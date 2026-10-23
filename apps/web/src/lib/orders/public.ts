import "server-only";
import type { PrismaClient, WebOrder } from "@/generated/prisma/client";
import { ErpError } from "../erp/errors";
import { getPublicOrder, type PublicOrder } from "../erp/order-tracking";
import { accessTokenMatches, syncIfDue, type DisplayLine } from "./web-orders";

/** The order as the customer should see it while the ERP has not confirmed it yet (built only from the website record). */
export function localPublicOrder(row: WebOrder): PublicOrder {
  const items = (row.items as unknown as DisplayLine[]) ?? [];
  const known = row.syncStatus === "SYNCED" && row.erpStatus ? (row.erpStatus as PublicOrder["status"]) : null; // last status the ERP gave us
  return {
    ref: row.externalRef,
    status: known ?? "RECEIVED",
    syncState: known ? "synced" : "pending",
    currency: row.currency,
    paymentMethod: row.paymentMethod,
    codCollected: row.erpPaymentStatus === "COD_COLLECTED",
    trackingNumber: row.trackingNumber ?? undefined,
    carrier: row.carrierName ?? undefined,
    lines: items.map((l) => ({ name: l.name, variantLabel: l.variantLabel, quantity: l.quantity, unitPrice: l.unitPrice })),
    deliveryCharge: Number(row.deliveryCharge),
    total: Number(row.total),
    createdAt: row.createdAt.toISOString(),
    cancellable: false,
  };
}

export interface OrderView {
  order: PublicOrder;
  /** The website record, when this order was placed through a database-backed checkout. */
  local: WebOrder | null;
  /** True when the ERP could not be asked and the data below is the website's last known copy. */
  stale: boolean;
}

/**
 * Loads an order for display. The ERP is authoritative whenever it can answer; the website record is used only when the
 * ERP does not have the order yet (still pending) or cannot be reached. A pending order that is due is retried first.
 */
export async function loadOrderView(db: PrismaClient | null, ref: string): Promise<OrderView> {
  const local = db ? await db.webOrder.findUnique({ where: { externalRef: ref } }).catch(() => null) : null;
  if (local && local.syncStatus === "PENDING") await syncIfDue(db!, ref);
  const current = local && db ? await db.webOrder.findUnique({ where: { externalRef: ref } }).catch(() => local) : null;
  try {
    const order = await getPublicOrder(ref);
    if (current && db) {
      // keep the cached copy used by admin listings fresh (best effort)
      await db.webOrder
        .update({ where: { externalRef: ref }, data: { syncStatus: "SYNCED", syncedAt: current.syncedAt ?? new Date(), lastError: null, lastErrorCode: null, lockedUntil: null, erpStatus: order.status === "RECEIVED" ? null : order.status, erpPaymentStatus: order.codCollected ? "COD_COLLECTED" : "COD_PENDING", erpStatusAt: new Date(), trackingNumber: order.trackingNumber ?? null, carrierName: order.carrier ?? null } })
        .catch(() => undefined);
    }
    return { order: { ...order, syncState: "synced" }, local: current ?? null, stale: false };
  } catch (e) {
    const unreachable = e instanceof ErpError && ["UNREACHABLE", "TIMEOUT", "BAD_RESPONSE", "NOT_CONFIGURED", "UNAUTHORIZED"].includes(e.kind);
    const notYetThere = e instanceof ErpError && e.kind === "NOT_FOUND" && current?.syncStatus !== "SYNCED";
    if (current && (unreachable || notYetThere)) return { order: localPublicOrder(current), local: current, stale: unreachable };
    throw e;
  }
}

/** Who may see the delivery address and phone: the customer it belongs to, the browser that placed it, or an admin. */
export function canSeeOrderDetails(row: WebOrder | null, viewer: { customerId?: string | null; tokens?: string[]; isAdmin?: boolean }): boolean {
  if (!row) return false;
  if (viewer.isAdmin) return true;
  if (viewer.customerId && row.customerId && viewer.customerId === row.customerId) return true;
  return (viewer.tokens ?? []).some((t) => accessTokenMatches(row.accessHash, t));
}
