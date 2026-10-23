import { linkOrder } from "@/lib/auth/accounts";
import { getCurrentCustomer } from "@/lib/auth/session";
import { CheckoutConflict, placeOrder } from "@/lib/checkout/place-order";
import { getDb } from "@/lib/db";
import { mapErpError } from "@/lib/erp/errors";
import { withOrderAccess } from "@/lib/orders/access-cookie";
import { newAccessToken } from "@/lib/orders/web-orders";
import { errorResponse, guard, json, readJson } from "@/lib/security/api";
import { placeOrderSchema } from "@/lib/validation/checkout";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const blocked = guard(req, { name: "orders", limit: 10, windowMs: 60_000, mutating: true });
  if (blocked) return blocked;
  let body: unknown;
  try {
    body = await readJson(req);
  } catch {
    return errorResponse(400, "INVALID_JSON", "Invalid request body.");
  }
  const parsed = placeOrderSchema.safeParse(body);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) fields[issue.path.join(".")] ??= issue.message;
    return errorResponse(422, "VALIDATION_FAILED", "Please correct the highlighted fields.", { fields });
  }
  try {
    const customer = await getCurrentCustomer();
    const accessToken = newAccessToken();
    const result = await placeOrder(parsed.data, { customerId: customer?.id ?? null, accessToken });
    const db = getDb();
    // Signed-in customers get the order in "My orders". Best effort: the order itself is already safely stored/placed.
    if (customer && db) await linkOrder(db, customer.id, result.order.ref).catch(() => undefined);

    // 201 = confirmed by the ERP; 202 = received and saved, the ERP will be retried automatically.
    const res = json({ state: result.state, order: result.order }, result.state === "created" ? 201 : 202);
    if (db) {
      const c = await withOrderAccess(result.order.ref, accessToken);
      res.cookies.set(c.name, c.value, c.options);
    }
    return res;
  } catch (e) {
    if (e instanceof CheckoutConflict) {
      const message =
        e.code === "PRICE_CHANGED"
          ? "Some prices changed. We have refreshed your cart, so please review the new total."
          : "Some items are no longer available in the requested quantity.";
      return errorResponse(409, e.code, message, { refreshed: e.refreshed, newTotal: e.newTotal ?? null });
    }
    const m = mapErpError(e);
    return errorResponse(m.status, m.code, m.message);
  }
}
