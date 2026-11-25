import { getDb } from "@/lib/db";
import { readKokoParams, redirectTo } from "@/lib/payments/koko-http";
import { cancelKokoAttempt } from "@/lib/payments/koko-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Customer cancelled on the Koko page. The attempt is marked CANCELED (never over a SUCCESS) and the cart is kept. */
async function handle(req: Request) {
  const { orderId = "", trnId = "" } = await readKokoParams(req);
  const db = getDb();
  if (db && orderId) await cancelKokoAttempt(db, orderId, trnId || undefined).catch(() => undefined);
  return await redirectTo("/checkout?payment=cancelled");
}

export const GET = handle;
export const POST = handle;
