import { getDb } from "@/lib/db";
import { readKokoParams, redirectTo } from "@/lib/payments/koko-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Browser return from Koko (GET with query, or a form POST). The params can be forged, so nothing is marked paid here:
 * we only find our order and send the customer to the result page, which reads the real status from our database.
 */
async function handle(req: Request) {
  const { orderId = "" } = await readKokoParams(req);
  const db = getDb();
  const attempt = db && orderId ? await db.kokoPayment.findUnique({ where: { kokoOrderId: orderId }, select: { orderRef: true } }).catch(() => null) : null;
  return await redirectTo(attempt ? `/checkout/koko/result?orderId=${encodeURIComponent(attempt.orderRef)}` : "/checkout");
}

export const GET = handle;
export const POST = handle;
