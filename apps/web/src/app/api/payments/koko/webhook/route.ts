import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { verifyKokoCallback } from "@/lib/payments/koko";
import { getActiveKokoConfig } from "@/lib/payments/koko-config";
import { readKokoParams } from "@/lib/payments/koko-http";
import { applyKokoResult } from "@/lib/payments/koko-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Koko server-to-server callback (_responseUrl): the ONLY source of truth for "paid".
 * The signature covers orderId + trnId + status + desc. Invalid signature: 400 and nothing changes.
 */
export async function POST(req: Request) {
  // Works even while Koko is switched off in admin, so a payment already started can still complete.
  const cfg = await getActiveKokoConfig();
  const db = getDb();
  if (!cfg || !db) return new NextResponse("unavailable", { status: 503 });

  const p = await readKokoParams(req);
  const { orderId = "", trnId = "", status = "", desc = "", signature = "" } = p;
  if (!orderId || !signature || !verifyKokoCallback({ orderId, trnId, status, desc, signature }, cfg.publicKey)) {
    console.warn("[koko] webhook rejected: invalid signature or missing fields", orderId.slice(0, 60));
    return new NextResponse("invalid signature", { status: 400 });
  }

  const s = status.toUpperCase();
  if (s === "SUCCESS" || s === "FAILED" || s === "FAILURE") {
    const outcome = await applyKokoResult(db, orderId, { status: s === "SUCCESS" ? "SUCCESS" : "FAILED", trnId, raw: { orderId, trnId, status, desc } });
    if (outcome === "unknown_attempt") console.warn("[koko] verified webhook for an unknown attempt", orderId);
  }
  return new NextResponse("ok", { status: 200 });
}
