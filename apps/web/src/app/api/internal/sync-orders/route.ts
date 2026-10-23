import { timingSafeEqual } from "node:crypto";
import { getDb } from "@/lib/db";
import { syncDueOrders } from "@/lib/orders/web-orders";
import { errorResponse, json } from "@/lib/security/api";
import { rateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function secretOk(header: string | null, secret: string): boolean {
  const given = header?.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Scheduled retry of orders that have not reached the ERP yet. Call it every minute or so from a scheduler:
 *   curl -X POST -H "Authorization: Bearer $ORDER_SYNC_SECRET" https://<site>/api/internal/sync-orders
 * Disabled (404) unless ORDER_SYNC_SECRET is set. Retries are safe: the ERP replays identical requests.
 */
export async function POST(req: Request) {
  const secret = process.env.ORDER_SYNC_SECRET?.trim();
  if (!secret || secret.length < 16) return errorResponse(404, "NOT_FOUND", "Not found.");
  if (!rateLimit("sync-orders", 30, 60_000).ok) return errorResponse(429, "RATE_LIMITED", "Too many requests.");
  if (!secretOk(req.headers.get("authorization"), secret)) return errorResponse(401, "UNAUTHORIZED", "Unauthorized.");
  const db = getDb();
  if (!db) return errorResponse(503, "NO_DATABASE", "Website database is not configured.");
  try {
    return json(await syncDueOrders(db, 25));
  } catch {
    return errorResponse(500, "SYNC_FAILED", "Could not process the queue.");
  }
}
