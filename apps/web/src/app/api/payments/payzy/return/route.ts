import { getDb } from "@/lib/db";
import { readPayzyParams, redirectToSite } from "@/lib/payments/payzy-http";
import { applyPayzyReturn } from "@/lib/payments/payzy-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Browser return from Payzy (query params x_order_id, response_code, signature). The signature is verified against the
 * request fields stored for that attempt; only a valid "00" marks the order paid. The customer is then sent to the
 * result page, which shows what OUR database says, never the query params.
 */
async function handle(req: Request) {
  const params = await readPayzyParams(req);
  const db = getDb();
  if (!db) return redirectToSite("/checkout");
  const outcome = await applyPayzyReturn(db, params).catch((e) => {
    console.error("[payzy] return handling failed", e instanceof Error ? e.message : "unknown");
    return null;
  });
  if (!outcome || outcome.kind === "unknown_attempt") return redirectToSite("/checkout?payment=error");
  return redirectToSite(`/checkout/payzy/result?orderId=${encodeURIComponent(outcome.orderRef)}`);
}

export const GET = handle;
export const POST = handle;
