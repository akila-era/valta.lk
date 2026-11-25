import { timingSafeEqual } from "node:crypto";
import { getDb } from "@/lib/db";
import { reconcilePendingKoko } from "@/lib/payments/koko-service";
import { errorResponse, json } from "@/lib/security/api";
import { rateLimit } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function secretOk(header: string | null, secret: string): boolean {
  const given = header?.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Rechecks Koko attempts that have been PENDING for over 15 minutes. Protected by ORDER_SYNC_SECRET (same scheduler as order sync):
 *   curl -X POST -H "Authorization: Bearer $ORDER_SYNC_SECRET" https://<site>/api/internal/koko-reconcile
 * GET works too, so a Vercel Cron job can call it.
 */
async function handle(req: Request) {
  const secret = process.env.ORDER_SYNC_SECRET?.trim();
  if (!secret || secret.length < 16) return errorResponse(404, "NOT_FOUND", "Not found.");
  if (!rateLimit("koko-reconcile", 30, 60_000).ok) return errorResponse(429, "RATE_LIMITED", "Too many requests.");
  if (!secretOk(req.headers.get("authorization"), secret)) return errorResponse(401, "UNAUTHORIZED", "Unauthorized.");
  const db = getDb();
  if (!db) return errorResponse(503, "NO_DATABASE", "Website database is not configured.");
  try {
    return json(await reconcilePendingKoko(db));
  } catch {
    return errorResponse(500, "RECONCILE_FAILED", "Could not reconcile payments.");
  }
}

export const POST = handle;
export const GET = handle;
