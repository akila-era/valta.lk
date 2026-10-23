import { mapErpError } from "@/lib/erp/errors";
import { getDb } from "@/lib/db";
import { cancelOrder, canCancel, getOrder, getPublicOrder } from "@/lib/erp/order-tracking";
import { loadOrderView } from "@/lib/orders/public";
import { errorResponse, guard, json } from "@/lib/security/api";
import { orderRefParamSchema } from "@/lib/validation/checkout";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ ref: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const blocked = guard(req, { name: "order-lookup", limit: 40, windowMs: 60_000 });
  if (blocked) return blocked;
  const ref = orderRefParamSchema.safeParse((await params).ref.trim().toUpperCase());
  if (!ref.success) return errorResponse(404, "NOT_FOUND", "We could not find that order.");
  try {
    // The ERP answers whenever it can; an order saved on the website but not yet in the ERP is shown as "received".
    return json({ order: (await loadOrderView(getDb(), ref.data)).order });
  } catch (e) {
    const m = mapErpError(e);
    return errorResponse(m.status, m.code, m.message);
  }
}

/** Cancel before dispatch. The ERP remains the final authority. */
export async function DELETE(req: Request, { params }: Ctx) {
  const blocked = guard(req, { name: "order-cancel", limit: 5, windowMs: 60_000, mutating: true });
  if (blocked) return blocked;
  const ref = orderRefParamSchema.safeParse((await params).ref.trim().toUpperCase());
  if (!ref.success) return errorResponse(404, "NOT_FOUND", "We could not find that order.");
  try {
    const current = await getOrder(ref.data);
    if (!canCancel(current.status)) return errorResponse(409, "CANNOT_CANCEL", "This order can no longer be cancelled online. Please contact us.");
    await cancelOrder(ref.data);
    return json({ order: await getPublicOrder(ref.data) });
  } catch (e) {
    const m = mapErpError(e);
    return errorResponse(m.status, m.code, m.message);
  }
}
