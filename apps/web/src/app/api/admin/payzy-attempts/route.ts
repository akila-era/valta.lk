import { z } from "zod";
import { requireAdmin } from "@/lib/admin/auth";
import { getDb } from "@/lib/db";
import { settlePayzyAttemptManually } from "@/lib/payments/payzy-service";
import { errorResponse, guard, json, readJson } from "@/lib/security/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const body = z.object({ payzyOrderId: z.string().trim().min(3).max(100), outcome: z.enum(["PAID", "FAILED"]) });

/**
 * Manual reconciliation of a PENDING Payzy attempt after the admin checked the Payzy merchant portal
 * (Payzy sends no server-to-server confirmation). Only staff can call it.
 */
export async function POST(req: Request) {
  const blocked = guard(req, { name: "admin-payzy-attempts", limit: 30, windowMs: 60_000, mutating: true });
  if (blocked) return blocked;
  const a = await requireAdmin();
  if (a.kind === "signed-out") return errorResponse(401, "SIGNED_OUT", "Please sign in.");
  if (a.kind === "forbidden") return errorResponse(403, "FORBIDDEN", "You do not have access to this action.");
  const parsed = body.safeParse(await readJson(req).catch(() => null));
  if (!parsed.success) return errorResponse(400, "INVALID", "Invalid request.");
  const db = getDb();
  if (!db) return errorResponse(503, "NO_DATABASE", "The website database is not configured.");
  const r = await settlePayzyAttemptManually(db, parsed.data.payzyOrderId, parsed.data.outcome, a.admin.email);
  if (r === "unknown_attempt") return errorResponse(404, "NOT_FOUND", "Attempt not found.");
  if (r === "not_pending") return errorResponse(409, "NOT_PENDING", "This attempt was already settled.");
  return json({ ok: true, result: r });
}
