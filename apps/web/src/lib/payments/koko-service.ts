import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { syncOrder } from "../orders/web-orders";
import { buildKokoForm, formatKokoAmount, getKokoOrderStatus, type KokoForm } from "./koko";
import { getActiveKoko, getActiveKokoConfig } from "./koko-config";

/**
 * Koko payment attempts and the "order paid" transition.
 *
 * Only two things may mark an attempt SUCCESS: Koko's signed webhook, or a signed orderView answer. The browser
 * return/cancel redirects never do. The paid transition is atomic and idempotent, so a repeated callback is a no-op.
 */

export type StartResult =
  | { ok: true; form: KokoForm; kokoOrderId: string }
  | { ok: false; code: "NOT_FOUND" | "NOT_PAYABLE" | "ALREADY_PAID" | "NOT_CONFIGURED" };

const isUniqueViolation = (e: unknown) => ["P2002", "23505"].includes((e as { code?: string }).code ?? "");

/** Creates a fresh attempt (new unique Koko order id) for an unpaid Koko order and returns the form to post to Koko. */
export async function startKokoPayment(db: PrismaClient, ref: string): Promise<StartResult> {
  const { cfg, enabled } = await getActiveKoko();
  if (!cfg || !enabled) return { ok: false, code: "NOT_CONFIGURED" };
  const order = await db.webOrder.findUnique({ where: { externalRef: ref } });
  if (!order) return { ok: false, code: "NOT_FOUND" };
  if (order.paymentMethod !== "KOKO") return { ok: false, code: "NOT_PAYABLE" };
  if (order.paymentStatus === "PAID") return { ok: false, code: "ALREADY_PAID" };

  // Amount and currency come from the stored order, never from the browser.
  const amount = formatKokoAmount(order.total.toString());
  const lineCount = ((order.items as unknown as { quantity: number }[]) ?? []).reduce((n, l) => n + (l.quantity || 0), 0);
  for (let i = 0; i < 5; i++) {
    const last = await db.kokoPayment.findFirst({ where: { orderRef: ref }, orderBy: { attemptNo: "desc" }, select: { attemptNo: true } });
    const attemptNo = (last?.attemptNo ?? 0) + 1;
    const kokoOrderId = `${ref}-${attemptNo}`;
    try {
      await db.kokoPayment.create({ data: { kokoOrderId, orderRef: ref, attemptNo, amount, currency: order.currency } });
    } catch (e) {
      if (isUniqueViolation(e)) continue; // two clicks at once: take the next number
      throw e;
    }
    const form = buildKokoForm(cfg, {
      kokoOrderId,
      amount,
      currency: order.currency,
      customerName: order.customerName,
      email: order.customerEmail ?? "",
      mobile: order.customerPhone,
      description: `${lineCount} item${lineCount === 1 ? "" : "s"}`,
    });
    return { ok: true, form, kokoOrderId };
  }
  throw new Error("Could not allocate a Koko attempt number");
}

export type ApplyOutcome = "paid" | "already_processed" | "failed" | "unknown_attempt" | "ignored";

/**
 * Applies a VERIFIED result from Koko. The caller must have checked the signature.
 * SUCCESS: attempt -> SUCCESS and the order -> paid in one transaction, then the order is released to the ERP once.
 */
export async function applyKokoResult(db: PrismaClient, kokoOrderId: string, result: { status: "SUCCESS" | "FAILED"; trnId: string; raw: unknown }): Promise<ApplyOutcome> {
  const attempt = await db.kokoPayment.findUnique({ where: { kokoOrderId } });
  if (!attempt) return "unknown_attempt";
  const raw = JSON.parse(JSON.stringify(result.raw ?? null));

  if (result.status === "FAILED") {
    const r = await db.kokoPayment.updateMany({ where: { kokoOrderId, status: "PENDING" }, data: { status: "FAILED", trnId: result.trnId || null, rawCallback: raw } });
    return r.count ? "failed" : "ignored";
  }

  const released = await db.$transaction(async (tx) => {
    // Money has been taken, so SUCCESS wins over PENDING, FAILED and CANCELED; only an already-SUCCESS attempt is skipped.
    const claimed = await tx.kokoPayment.updateMany({ where: { kokoOrderId, status: { not: "SUCCESS" } }, data: { status: "SUCCESS", trnId: result.trnId || null, rawCallback: raw } });
    if (claimed.count === 0) return null;
    const paid = await tx.webOrder.updateMany({
      where: { externalRef: attempt.orderRef, OR: [{ paymentStatus: null }, { paymentStatus: { not: "PAID" } }] },
      data: { paymentStatus: "PAID", paidAt: new Date(), awaitingPayment: false, nextAttemptAt: new Date() },
    });
    if (paid.count === 0) console.warn("[koko] extra successful payment for an order that was already paid", attempt.orderRef, kokoOrderId);
    return paid.count > 0;
  });
  if (released === null) return "already_processed";
  if (released) {
    // "Order paid" side effect, run exactly once: hand the order to the ERP. A failure here is retried by the scheduler.
    await syncOrder(db, attempt.orderRef, { force: true }).catch((e) => console.error("[koko] ERP release failed", attempt.orderRef, e instanceof Error ? e.message : "unknown"));
  }
  return "paid";
}

/** Customer pressed cancel on Koko's page. Never overrides a SUCCESS. */
export async function cancelKokoAttempt(db: PrismaClient, kokoOrderId: string, trnId?: string): Promise<boolean> {
  const r = await db.kokoPayment.updateMany({ where: { kokoOrderId, status: "PENDING" }, data: { status: "CANCELED", ...(trnId ? { trnId } : {}) } });
  return r.count > 0;
}

/** Asks Koko (orderView) about one attempt and applies the answer when it is signed and final. */
export async function recheckKokoAttempt(db: PrismaClient, kokoOrderId: string): Promise<ApplyOutcome | "no_answer" | "still_pending"> {
  const s = await getKokoOrderStatus(kokoOrderId, await getActiveKokoConfig());
  if (!s) return "no_answer";
  if (s.status === "PENDING") return "still_pending";
  return applyKokoResult(db, kokoOrderId, { status: s.status, trnId: s.trnId, raw: s.raw });
}

/** Reconciliation job: recheck attempts that have been PENDING for a while. */
export async function reconcilePendingKoko(db: PrismaClient, opts: { olderThanMs?: number; limit?: number } = {}) {
  const cutoff = new Date(Date.now() - (opts.olderThanMs ?? 15 * 60_000));
  const rows = await db.kokoPayment.findMany({ where: { status: "PENDING", createdAt: { lt: cutoff } }, orderBy: { createdAt: "asc" }, take: opts.limit ?? 25, select: { kokoOrderId: true } });
  const out = { checked: rows.length, paid: 0, failed: 0, stillPending: 0, noAnswer: 0 };
  for (const { kokoOrderId } of rows) {
    const r = await recheckKokoAttempt(db, kokoOrderId);
    if (r === "paid" || r === "already_processed") out.paid++;
    else if (r === "failed") out.failed++;
    else if (r === "still_pending") out.stillPending++;
    else out.noAnswer++;
  }
  return out;
}
