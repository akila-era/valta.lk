import "server-only";
import { orderRefsFor } from "../auth/accounts";
import { getDb } from "../db";
import type { PublicOrder } from "../erp/order-tracking";
import { loadOrderView } from "../orders/public";

/** The orders linked to a customer, newest first as stored, each with its live view (null when it cannot be read now). */
export async function accountOrders(customerId: string): Promise<{ ref: string; order: PublicOrder | null }[]> {
  const refs = await orderRefsFor(getDb()!, customerId).catch(() => [] as string[]);
  return Promise.all(
    refs.map(async (ref) => ({
      ref,
      order: await loadOrderView(getDb(), ref).then((v) => v.order).catch(() => null as PublicOrder | null),
    })),
  );
}
