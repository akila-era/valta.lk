import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { PrismaClient, WebOrder } from "@/generated/prisma/client";
import { Prisma } from "@/generated/prisma/client";
import { ErpError } from "../erp/errors";
import { getOrder } from "../erp/order-tracking";
import { createOrder } from "../erp/orders";
import type { CreateOrderRequest, ErpOrder } from "../erp/types";

/**
 * Website orders and their synchronisation with HEXALYTE ERP.
 *
 * Flow: the order is validated against live ERP data, written to the website database (PENDING), then sent to the ERP
 * with Idempotency-Key = externalRef. A transient failure keeps it PENDING and it is retried with backoff using the
 * identical request body, so the ERP either creates the order once or replays the one it already created.
 * The ERP stays authoritative for status, stock and COD collection; nothing here deducts stock.
 */

export interface DisplayLine {
  itemId: string;
  variantKey: string;
  name: string;
  variantLabel?: string;
  quantity: number;
  unitPrice: number;
  image?: string;
}

export type SyncOutcome =
  | { kind: "synced"; order: ErpOrder | null }
  | { kind: "pending"; code: string; message: string }
  | { kind: "failed"; code: string; message: string }
  | { kind: "busy" }
  | { kind: "missing" };

const LOCK_MS = 90_000;
const GIVE_UP_AFTER_MS = 24 * 60 * 60_000;
const BACKOFF_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000, 3 * 60 * 60_000, 6 * 60 * 60_000];

/** ERP answers that mean "this order cannot be created as sent": retrying the same body can never succeed. */
const DEFINITIVE = new Set([
  "PRICE_CHANGED",
  "TOTAL_MISMATCH",
  "CURRENCY_MISMATCH",
  "INSUFFICIENT_STOCK",
  "REFERENCE_REUSED",
  "ITEM_NOT_AVAILABLE",
  "ITEM_NOT_FULFILLABLE",
  "PAYMENT_METHOD_NOT_ENABLED",
  "VALIDATION_ERROR",
]);

/**
 * True when the ERP refused this exact request, so repeating it unchanged can never succeed. Network problems,
 * throttling, auth/config problems and 5xx are NOT definitive: they heal on their own or once configuration is fixed.
 */
export function isDefinitiveRejection(e: unknown): e is ErpError {
  if (!(e instanceof ErpError)) return false;
  if (DEFINITIVE.has(e.kind)) return true;
  return e.status >= 400 && e.status < 500 && ![401, 403, 404, 408, 429].includes(e.status) && e.kind !== "IDEMPOTENCY_IN_PROGRESS";
}

/** Wait before the next attempt. ORDER_SYNC_BACKOFF_MS overrides the schedule with a constant (used by automated tests only). */
export function backoffFor(attempts: number): number {
  const override = Number(process.env.ORDER_SYNC_BACKOFF_MS);
  if (Number.isFinite(override) && override > 0) return override;
  return BACKOFF_MS[Math.min(Math.max(attempts - 1, 0), BACKOFF_MS.length - 1)];
}

/** Safe, customer/admin-readable description of an ERP failure. Never includes upstream bodies or credentials. */
export function describeFailure(e: unknown): { code: string; message: string } {
  if (e instanceof ErpError) {
    const map: Record<string, string> = {
      UNREACHABLE: "The ERP could not be reached.",
      TIMEOUT: "The ERP did not answer in time.",
      BAD_RESPONSE: "The ERP returned an unexpected response.",
      RATE_LIMITED: "The ERP asked us to slow down.",
      UNAUTHORIZED: "The ERP rejected the store credential.",
      NOT_CONFIGURED: "The ERP connection is not configured.",
      ORDERS_NOT_ENABLED: "Orders are switched off in the ERP.",
      STORE_DISABLED: "The store is disabled in the ERP.",
      COD_DISABLED: "Cash on delivery is switched off in the ERP.",
      IDEMPOTENCY_IN_PROGRESS: "The ERP was still processing an earlier attempt.",
      PRICE_CHANGED: "A price changed before the order reached the ERP.",
      TOTAL_MISMATCH: "The order total no longer matches the ERP total.",
      CURRENCY_MISMATCH: "The currency does not match the ERP currency.",
      INSUFFICIENT_STOCK: "Not enough stock when the order reached the ERP.",
      REFERENCE_REUSED: "The order reference was already used with different details.",
      ITEM_NOT_AVAILABLE: "An item is no longer available in the ERP.",
      ITEM_NOT_FULFILLABLE: "An item cannot be fulfilled by the ERP.",
      PAYMENT_METHOD_NOT_ENABLED: "The payment method is not enabled in the ERP.",
      VALIDATION_ERROR: "The ERP rejected the order details.",
    };
    return { code: e.kind, message: map[e.kind] ?? `The ERP rejected the request (${e.status}).` };
  }
  return { code: "INTERNAL", message: "Unexpected error while sending the order." };
}

/* ------------------------------------------------------------------ access tokens (who may see delivery details) */

export const newAccessToken = () => randomBytes(24).toString("base64url");
export const hashAccessToken = (t: string) => createHash("sha256").update(t).digest("hex");

export function accessTokenMatches(storedHash: string | null | undefined, token: string | undefined): boolean {
  if (!storedHash || !token) return false;
  const a = Buffer.from(storedHash, "hex");
  const b = Buffer.from(hashAccessToken(token), "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/* ------------------------------------------------------------------ persistence */

const canonical = (v: unknown): string => JSON.stringify(v, (_k, val) => (val && typeof val === "object" && !Array.isArray(val) ? Object.fromEntries(Object.entries(val).sort(([a], [b]) => a.localeCompare(b))) : val));

export interface PersistInput {
  request: CreateOrderRequest;
  items: DisplayLine[];
  subtotal: number;
  customerId?: string | null;
  accessToken: string;
  priceBreakdown?: Prisma.InputJsonValue;
}

/**
 * Stores the order before the ERP is called. Idempotent on externalRef: the same reference with the same contents
 * returns the existing record; the same reference with different contents is REFERENCE_REUSED (as the ERP would say).
 */
export async function persistOrder(db: PrismaClient, input: PersistInput) {
  const { request: r } = input;
  const payload = JSON.parse(JSON.stringify(r)) as Prisma.InputJsonValue;
  const existing = await db.webOrder.findUnique({ where: { externalRef: r.externalRef } });
  if (existing) {
    if (canonical(existing.payload) !== canonical(payload)) throw new ErpError("REFERENCE_REUSED", 409, "Reference reused");
    // An identical resubmission is the same customer retrying (e.g. the first response was lost): hand the new browser token access.
    const updated = await db.webOrder.update({ where: { externalRef: r.externalRef }, data: { accessHash: hashAccessToken(input.accessToken) } });
    return { order: updated, created: false };
  }
  try {
    const order = await db.webOrder.create({
      data: {
        externalRef: r.externalRef,
        customerId: input.customerId ?? null,
        paymentMethod: r.paymentMethod,
        currency: r.currency,
        subtotal: input.subtotal.toFixed(2),
        deliveryCharge: r.deliveryCharge.toFixed(2),
        total: r.total.toFixed(2),
        customerName: r.customer.name,
        customerPhone: r.customer.phone,
        customerEmail: r.customer.email ?? null,
        payload,
        items: input.items as unknown as Prisma.InputJsonValue,
        accessHash: hashAccessToken(input.accessToken),
        ...(input.priceBreakdown ? { priceBreakdown: input.priceBreakdown } : {}),
      },
    });
    return { order, created: true };
  } catch (e) {
    // Two simultaneous submissions of the same reference: the loser reads the winner's row.
    const code = (e as { code?: string }).code;
    if (code === "P2002" || code === "23505") {
      const again = await db.webOrder.findUniqueOrThrow({ where: { externalRef: r.externalRef } });
      if (canonical(again.payload) !== canonical(payload)) throw new ErpError("REFERENCE_REUSED", 409, "Reference reused");
      return { order: again, created: false };
    }
    throw e;
  }
}

/** Removes an order the ERP definitively rejected during checkout (it was never accepted, so there is nothing to keep). */
export async function discardOrder(db: PrismaClient, externalRef: string): Promise<void> {
  await db.promotionRedemption.deleteMany({ where: { externalRef } }).catch(() => undefined);
  await db.webOrder.deleteMany({ where: { externalRef, syncStatus: { in: ["PENDING", "FAILED"] } } });
}

/* ------------------------------------------------------------------ synchronisation */

/**
 * Sends one order to the ERP. Safe to call concurrently and repeatedly: a lease (lockedUntil) allows one sender at a
 * time, and the ERP replays an identical request instead of creating a second order.
 * `force` ignores the backoff schedule (admin retry); it still respects the lease.
 */
export async function syncOrder(db: PrismaClient, externalRef: string, opts: { force?: boolean } = {}): Promise<SyncOutcome> {
  const now = new Date();
  const claim = await db.webOrder.updateMany({
    where: {
      externalRef,
      syncStatus: "PENDING",
      ...(opts.force ? {} : { nextAttemptAt: { lte: now } }),
      OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
    },
    data: { lockedUntil: new Date(now.getTime() + LOCK_MS) },
  });
  const row = await db.webOrder.findUnique({ where: { externalRef } });
  if (!row) return { kind: "missing" };
  if (claim.count === 0) {
    if (row.syncStatus === "SYNCED") return { kind: "synced", order: null };
    return { kind: "busy" };
  }

  try {
    const order = await createOrder(row.payload as unknown as CreateOrderRequest);
    await db.webOrder.update({
      where: { externalRef },
      data: {
        syncStatus: "SYNCED",
        syncedAt: new Date(),
        syncAttempts: { increment: 1 },
        lastError: null,
        lastErrorCode: null,
        lockedUntil: null,
        erpStatus: order.status,
        erpPaymentStatus: order.paymentStatus ?? null,
        erpStatusAt: new Date(),
        trackingNumber: order.trackingNumber ?? null,
        carrierName: order.carrierName ?? null,
      },
    });
    return { kind: "synced", order };
  } catch (e) {
    const { code, message } = describeFailure(e);
    const attempts = row.syncAttempts + 1;
    const definitive = isDefinitiveRejection(e);
    const exhausted = Date.now() - row.createdAt.getTime() > GIVE_UP_AFTER_MS;
    if (definitive || exhausted) {
      await db.webOrder.update({
        where: { externalRef },
        data: { syncStatus: "FAILED", syncAttempts: attempts, lastError: message, lastErrorCode: definitive ? code : "RETRIES_EXHAUSTED", lockedUntil: null },
      });
      return { kind: "failed", code: definitive ? code : "RETRIES_EXHAUSTED", message: definitive ? message : "Gave up after 24 hours of retries." };
    }
    await db.webOrder.update({
      where: { externalRef },
      data: { syncAttempts: attempts, lastError: message, lastErrorCode: code, lockedUntil: null, nextAttemptAt: new Date(Date.now() + backoffFor(attempts)) },
    });
    return { kind: "pending", code, message };
  }
}

/** Retries every PENDING order that is due. Used by the scheduled endpoint. */
export async function syncDueOrders(db: PrismaClient, limit = 25): Promise<{ due: number; synced: number; pending: number; failed: number; busy: number }> {
  const now = new Date();
  const due = await db.webOrder.findMany({
    where: { syncStatus: "PENDING", nextAttemptAt: { lte: now }, OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] },
    orderBy: { nextAttemptAt: "asc" },
    take: limit,
    select: { externalRef: true },
  });
  const out = { due: due.length, synced: 0, pending: 0, failed: 0, busy: 0 };
  for (const { externalRef } of due) {
    const r = await syncOrder(db, externalRef);
    if (r.kind === "synced") out.synced++;
    else if (r.kind === "pending") out.pending++;
    else if (r.kind === "failed") out.failed++;
    else out.busy++;
  }
  return out;
}

/** Admin action: put a FAILED (or stuck PENDING) order back in the queue and try right away. */
export async function retryOrderNow(db: PrismaClient, externalRef: string): Promise<SyncOutcome> {
  const reset = await db.webOrder.updateMany({
    where: { externalRef, syncStatus: { in: ["FAILED", "PENDING"] } },
    data: { syncStatus: "PENDING", nextAttemptAt: new Date(), lockedUntil: null, lastError: null, lastErrorCode: null },
  });
  if (reset.count === 0) {
    const row = await db.webOrder.findUnique({ where: { externalRef }, select: { syncStatus: true } });
    return row ? { kind: "synced", order: null } : { kind: "missing" };
  }
  return syncOrder(db, externalRef, { force: true });
}

/* ------------------------------------------------------------------ cached ERP status refresh */

/** In the ERP, an order is finished once cancelled, or delivered with the cash recorded as collected. */
const FINISHED_STATUSES = ["CANCELLED"];

/**
 * True when the cached ERP status of a synced order may still change and is older than `minAgeMs`, so a scheduled
 * refresh should ask the ERP again. Mirrors the database filter in `refreshOrderStatuses`.
 */
export function needsStatusRefresh(
  row: Pick<WebOrder, "syncStatus" | "erpStatus" | "erpPaymentStatus" | "erpStatusAt">,
  now: Date,
  minAgeMs: number,
): boolean {
  if (row.syncStatus !== "SYNCED") return false;
  if (row.erpStatus && FINISHED_STATUSES.includes(row.erpStatus)) return false;
  if (row.erpStatus === "DELIVERED" && row.erpPaymentStatus === "COD_COLLECTED") return false;
  return !row.erpStatusAt || now.getTime() - row.erpStatusAt.getTime() >= minAgeMs;
}

export interface StatusRefreshResult {
  due: number;
  refreshed: number;
  changed: number;
  failed: number;
  busy: number;
  /** Why the batch ended early: the time budget ran out or the ERP asked us to slow down. */
  stoppedBy: "budget" | "rate-limit" | null;
}

/**
 * Re-reads the ERP status of up to `limit` in-progress orders whose cached status is the oldest (never-refreshed first),
 * so admin reports such as "COD collected" do not depend on someone opening each order. Read-only towards the ERP.
 *
 * Safety: one ERP attempt per order with a short timeout; requests are sequential; the batch stops when `budgetMs` is
 * spent or the ERP returns 429. Each order is claimed with the same `lockedUntil` lease the sync queue uses (only on
 * SYNCED rows, which the sync queue never claims), so two overlapping scheduler calls never read the same order.
 * An ERP failure keeps the previous cached status. Never throws for a single order.
 */
export async function refreshOrderStatuses(
  db: PrismaClient,
  opts: { limit?: number; minAgeMs?: number; budgetMs?: number; timeoutMs?: number; now?: () => Date } = {},
): Promise<StatusRefreshResult> {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 20);
  const minAgeMs = opts.minAgeMs ?? 10 * 60_000;
  const budgetMs = opts.budgetMs ?? 20_000;
  const clock = opts.now ?? (() => new Date());
  const started = clock().getTime();
  const now = clock();

  const due = await db.webOrder.findMany({
    where: {
      syncStatus: "SYNCED",
      AND: [
        { OR: [{ erpStatus: null }, { erpStatus: { notIn: FINISHED_STATUSES } }] },
        // "not (delivered and collected)", written out so NULL columns are kept (SQL NOT over NULL would drop them)
        { OR: [{ erpStatus: null }, { erpStatus: { not: "DELIVERED" } }, { erpPaymentStatus: null }, { erpPaymentStatus: { not: "COD_COLLECTED" } }] },
        { OR: [{ erpStatusAt: null }, { erpStatusAt: { lte: new Date(now.getTime() - minAgeMs) } }] },
        { OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] },
      ],
    },
    orderBy: [{ erpStatusAt: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }],
    take: limit,
    select: { externalRef: true, erpStatus: true, erpPaymentStatus: true },
  });

  const out: StatusRefreshResult = { due: due.length, refreshed: 0, changed: 0, failed: 0, busy: 0, stoppedBy: null };
  for (const row of due) {
    if (clock().getTime() - started >= budgetMs) {
      out.stoppedBy = "budget";
      break;
    }
    const at = clock();
    const claim = await db.webOrder.updateMany({
      where: { externalRef: row.externalRef, syncStatus: "SYNCED", OR: [{ lockedUntil: null }, { lockedUntil: { lt: at } }] },
      data: { lockedUntil: new Date(at.getTime() + LOCK_MS) },
    });
    if (claim.count === 0) {
      out.busy++;
      continue;
    }
    try {
      const o = await getOrder(row.externalRef, { maxAttempts: 1, timeoutMs: opts.timeoutMs ?? 5000 });
      await db.webOrder.update({
        where: { externalRef: row.externalRef },
        data: { erpStatus: o.status, erpPaymentStatus: o.paymentStatus ?? null, erpStatusAt: clock(), trackingNumber: o.trackingNumber ?? null, carrierName: o.carrierName ?? null, lockedUntil: null },
      });
      out.refreshed++;
      if (o.status !== row.erpStatus || (o.paymentStatus ?? null) !== row.erpPaymentStatus) out.changed++;
    } catch (e) {
      out.failed++;
      await db.webOrder.updateMany({ where: { externalRef: row.externalRef, syncStatus: "SYNCED" }, data: { lockedUntil: null } }).catch(() => undefined);
      if (e instanceof ErpError && e.kind === "RATE_LIMITED") {
        out.stoppedBy = "rate-limit";
        break;
      }
    }
  }
  return out;
}

/** Cheap, bounded "retry on view": when a customer looks at a pending order and it is due, try once. Never throws. */
export async function syncIfDue(db: PrismaClient, externalRef: string): Promise<void> {
  try {
    await syncOrder(db, externalRef);
  } catch {
    /* the page must still render from the local record */
  }
}
