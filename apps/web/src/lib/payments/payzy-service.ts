import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { syncOrder } from "../orders/web-orders";
import { getActivePayzy, getActivePayzyConfig } from "./payzy-config";
import {
  PayzyCheckoutError,
  buildRequestFields,
  createPayzyCheckout,
  formatPayzyAmount,
  signRequest,
  splitName,
  verifyPayzyResponse,
  type PayzyAddress,
  type PayzyConfig,
} from "./payzy";

/**
 * Payzy payment attempts and the "order paid" transition.
 *
 * The browser redirect to /api/payments/payzy/return is the ONLY confirmation Payzy gives us, so it is trusted only
 * after its HMAC verifies against the request fields we stored. The paid transition is atomic and idempotent.
 *
 * TODO(payzy): the sample has no server-to-server callback/webhook and no order-status API. If Payzy adds either,
 * plug it in here: verify its signature the same way and call `applyPayzyReturn` (or a sibling) with the result.
 * Until then attempts that stay PENDING are surfaced to admins by `listStalePayzyAttempts` for manual reconciliation.
 */

export type StartResult =
  | { ok: true; redirectUrl: string; payzyOrderId: string }
  | { ok: false; code: "NOT_FOUND" | "NOT_PAYABLE" | "ALREADY_PAID" | "NOT_CONFIGURED" | "PAYZY_REJECTED" };

const isUniqueViolation = (e: unknown) => ["P2002", "23505"].includes((e as { code?: string }).code ?? "");

/** Shipping cost as a string: "0", "500" or "500.50". Zero is valid here (unlike an amount). */
export const formatFreight = (v: { toString(): string }): string => {
  const n = Math.round(Number(v.toString()) * 100) / 100;
  if (!Number.isFinite(n) || n < 0) return "0";
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
};

interface StoredPayload {
  customer?: { name?: string; phone?: string; email?: string };
  delivery?: { addressLine1?: string; city?: string; district?: string; postalCode?: string };
}

/** Customer and delivery details come from the stored order, never from the browser. Shipping falls back to billing. */
export function addressesFromOrder(order: { customerName: string; customerPhone: string; customerEmail: string | null; payload: unknown }) {
  const p = (order.payload ?? {}) as StoredPayload;
  const { first, last } = splitName(p.customer?.name ?? order.customerName);
  const base: PayzyAddress = {
    firstName: first,
    lastName: last,
    company: "",
    address: p.delivery?.addressLine1 ?? "",
    country: "Sri Lanka",
    state: p.delivery?.district ?? "",
    city: p.delivery?.city ?? "",
    zip: p.delivery?.postalCode ?? "",
  };
  return {
    billing: { ...base, phone: order.customerPhone, email: order.customerEmail ?? "" },
    // This store has a single delivery address, so shipping equals billing.
    shipping: { ...base },
  };
}

/**
 * Creates a fresh attempt for an unpaid Payzy order, calls Payzy server-to-server and returns the hosted page URL.
 * The attempt is saved BEFORE the call, with the exact fields sent, because the return only echoes x_order_id.
 */
export async function startPayzyPayment(db: PrismaClient, ref: string, fetchImpl: typeof fetch = fetch): Promise<StartResult> {
  const { cfg, enabled } = await getActivePayzy();
  if (!cfg || !enabled) return { ok: false, code: "NOT_CONFIGURED" };
  const order = await db.webOrder.findUnique({ where: { externalRef: ref } });
  if (!order) return { ok: false, code: "NOT_FOUND" };
  if (order.paymentMethod !== "PAYZY") return { ok: false, code: "NOT_PAYABLE" };
  if (order.paymentStatus === "PAID") return { ok: false, code: "ALREADY_PAID" };

  // Amount, currency and customer details come from the stored order, never from the browser.
  const amount = formatPayzyAmount(order.total.toString());
  const { billing, shipping } = addressesFromOrder(order);
  for (let i = 0; i < 5; i++) {
    const last = await db.payzyPayment.findFirst({ where: { orderRef: ref }, orderBy: { attemptNo: "desc" }, select: { attemptNo: true } });
    const attemptNo = (last?.attemptNo ?? 0) + 1;
    const payzyOrderId = `VOLTA-${ref}-${attemptNo}`;
    const fields = buildRequestFields(cfg, { payzyOrderId, amount, billing, shipping, freight: formatFreight(order.deliveryCharge) });
    try {
      await db.payzyPayment.create({ data: { payzyOrderId, orderRef: ref, attemptNo, amount: order.total.toString(), currency: order.currency, requestFields: fields } });
    } catch (e) {
      if (isUniqueViolation(e)) continue; // two clicks at once: take the next number
      throw e;
    }
    try {
      const redirectUrl = await createPayzyCheckout(cfg, signRequest(cfg, fields), fetchImpl);
      await db.payzyPayment.update({ where: { payzyOrderId }, data: { redirectUrl } });
      return { ok: true, redirectUrl, payzyOrderId };
    } catch (e) {
      await db.payzyPayment.updateMany({ where: { payzyOrderId, status: "PENDING" }, data: { status: "FAILED", failureReason: e instanceof PayzyCheckoutError ? `create_failed:${e.status ?? "network"}` : "create_failed" } });
      if (!(e instanceof PayzyCheckoutError)) throw e;
      return { ok: false, code: "PAYZY_REJECTED" };
    }
  }
  throw new Error("Could not allocate a Payzy attempt number");
}

export type ReturnOutcome =
  | { kind: "paid" | "already_processed" | "failed" | "ignored" | "invalid_signature"; orderRef: string }
  | { kind: "unknown_attempt" };

export interface PayzyReturnParams {
  x_order_id?: string;
  response_code?: string;
  signature?: string;
}

/** Applies the browser return from Payzy. Only a valid signature can change payment state. Safe to call repeatedly. */
export async function applyPayzyReturn(db: PrismaClient, params: PayzyReturnParams, cfg?: PayzyConfig | null): Promise<ReturnOutcome> {
  if (cfg === undefined) cfg = await getActivePayzyConfig();
  const payzyOrderId = params.x_order_id?.trim() ?? "";
  const attempt = payzyOrderId ? await db.payzyPayment.findUnique({ where: { payzyOrderId } }) : null;
  if (!attempt) return { kind: "unknown_attempt" };
  const orderRef = attempt.orderRef;
  const code = (params.response_code ?? "").trim();
  // A "+" in base64 arrives as a space once the query string is decoded.
  const signature = (params.signature ?? "").replace(/ /g, "+");

  const stored = attempt.requestFields as Record<string, string>;
  if (!cfg || !code || !verifyPayzyResponse(stored, code, signature, cfg.secretKey)) {
    console.warn("[payzy] SECURITY: return with an invalid signature ignored for", payzyOrderId);
    return { kind: "invalid_signature", orderRef };
  }

  const raw = { x_order_id: payzyOrderId, response_code: code };
  if (code !== "00") {
    // The meaning of non-00 codes is not documented by Payzy yet, so log them.
    console.warn("[payzy] payment not successful, response_code =", code, "for", payzyOrderId);
    const r = await db.payzyPayment.updateMany({ where: { payzyOrderId, status: "PENDING" }, data: { status: "FAILED", responseCode: code, failureReason: `response_code:${code}`, rawReturn: raw } });
    return { kind: r.count ? "failed" : "ignored", orderRef };
  }

  return { kind: await markPayzyPaid(db, payzyOrderId, orderRef, code, raw), orderRef };
}

/** Atomic and idempotent "paid" transition shared by the verified return and the admin's manual reconciliation. */
async function markPayzyPaid(db: PrismaClient, payzyOrderId: string, orderRef: string, code: string, raw: Record<string, string>): Promise<"paid" | "already_processed"> {
  const released = await db.$transaction(async (tx) => {
    // Money has been taken, so SUCCESS wins over PENDING and FAILED; only an already-SUCCESS attempt is skipped (replay).
    const claimed = await tx.payzyPayment.updateMany({ where: { payzyOrderId, status: { not: "SUCCESS" } }, data: { status: "SUCCESS", responseCode: code, failureReason: null, rawReturn: raw } });
    if (claimed.count === 0) return null;
    const paid = await tx.webOrder.updateMany({
      where: { externalRef: orderRef, OR: [{ paymentStatus: null }, { paymentStatus: { not: "PAID" } }] },
      data: { paymentStatus: "PAID", paidAt: new Date(), awaitingPayment: false, nextAttemptAt: new Date() },
    });
    if (paid.count === 0) console.warn("[payzy] extra successful payment for an order that was already paid", orderRef, payzyOrderId);
    return paid.count > 0;
  });
  if (released === null) return "already_processed";
  if (released) {
    // "Order paid" side effect, run exactly once: hand the order to the ERP. A failure here is retried by the scheduler.
    await syncOrder(db, orderRef, { force: true }).catch((e) => console.error("[payzy] ERP release failed", orderRef, e instanceof Error ? e.message : "unknown"));
  }
  return "paid";
}

/**
 * Admin reconciliation for an attempt Payzy never confirmed (customer closed the tab). The admin has checked the Payzy
 * merchant portal. Only a PENDING attempt can be settled; the action is recorded with the admin's email.
 */
export async function settlePayzyAttemptManually(db: PrismaClient, payzyOrderId: string, outcome: "PAID" | "FAILED", adminEmail: string): Promise<"paid" | "already_processed" | "failed" | "not_pending" | "unknown_attempt"> {
  const attempt = await db.payzyPayment.findUnique({ where: { payzyOrderId } });
  if (!attempt) return "unknown_attempt";
  if (attempt.status !== "PENDING") return "not_pending";
  const raw = { manual: "true", by: adminEmail };
  if (outcome === "FAILED") {
    const r = await db.payzyPayment.updateMany({ where: { payzyOrderId, status: "PENDING" }, data: { status: "FAILED", failureReason: `manual:${adminEmail}`, rawReturn: raw } });
    return r.count ? "failed" : "not_pending";
  }
  console.warn("[payzy] attempt marked PAID manually by an admin", payzyOrderId, adminEmail);
  return markPayzyPaid(db, payzyOrderId, attempt.orderRef, "manual", raw);
}

/** Attempts still PENDING after `olderThanMs` (default 30 min): the customer probably closed the tab. Check the Payzy merchant portal. */
export async function listStalePayzyAttempts(db: PrismaClient, olderThanMs = 30 * 60_000, limit = 50) {
  const rows = await db.payzyPayment.findMany({
    where: { status: "PENDING", createdAt: { lt: new Date(Date.now() - olderThanMs) }, order: { paymentStatus: { not: "PAID" } } },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { payzyOrderId: true, orderRef: true, amount: true, createdAt: true },
  });
  if (rows.length) console.warn(`[payzy] ${rows.length} attempt(s) PENDING for over ${Math.round(olderThanMs / 60_000)} min: reconcile in the Payzy merchant portal`, rows.map((r) => r.payzyOrderId).join(", "));
  return rows;
}
