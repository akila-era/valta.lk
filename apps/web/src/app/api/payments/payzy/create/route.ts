import { getCurrentCustomer } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { accessTokensFor } from "@/lib/orders/access-cookie";
import { canSeeOrderDetails } from "@/lib/orders/public";
import { startPayzyPayment } from "@/lib/payments/payzy-service";
import { errorResponse, guard, json, readJson } from "@/lib/security/api";
import { orderRefParamSchema } from "@/lib/validation/checkout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Starts a Payzy payment attempt for an unpaid order the caller owns. The body carries only our order reference:
 * amount and customer details are read from the stored order. Returns the Payzy page URL to send the browser to.
 */
export async function POST(req: Request) {
  const blocked = guard(req, { name: "payzy-create", limit: 15, windowMs: 60_000, mutating: true });
  if (blocked) return blocked;
  let body: unknown;
  try {
    body = await readJson(req);
  } catch {
    return errorResponse(400, "INVALID_JSON", "Invalid request body.");
  }
  const ref = orderRefParamSchema.safeParse(String((body as { orderRef?: unknown } | null)?.orderRef ?? "").trim().toUpperCase());
  if (!ref.success) return errorResponse(404, "NOT_FOUND", "Order not found.");
  const db = getDb();
  if (!db) return errorResponse(503, "NO_DATABASE", "Online payment is not available right now.");

  const row = await db.webOrder.findUnique({ where: { externalRef: ref.data } });
  const customer = await getCurrentCustomer();
  if (!canSeeOrderDetails(row, { customerId: customer?.id, tokens: await accessTokensFor(ref.data) })) return errorResponse(404, "NOT_FOUND", "Order not found.");

  const r = await startPayzyPayment(db, ref.data);
  if (!r.ok) {
    if (r.code === "ALREADY_PAID") return errorResponse(409, "ALREADY_PAID", "This order has already been paid.");
    if (r.code === "NOT_CONFIGURED") return errorResponse(503, "PAYZY_UNAVAILABLE", "Payzy is not available right now.");
    if (r.code === "PAYZY_REJECTED") return errorResponse(502, "PAYZY_REJECTED", "We could not start the Payzy payment. Please try again or choose another payment method.");
    return errorResponse(409, "NOT_PAYABLE", "This order cannot be paid with Payzy.");
  }
  return json({ redirectUrl: r.redirectUrl });
}
