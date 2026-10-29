import { z } from "zod";
import { requireAdmin } from "@/lib/admin/auth";
import { getDb } from "@/lib/db";
import { clearRatingsCache } from "@/lib/reviews";
import { errorResponse, guard, json, readJson } from "@/lib/security/api";

export const dynamic = "force-dynamic";

/** Origin + rate limit, then an admin session: the same front door as the other admin APIs. */
async function front(req: Request): Promise<{ ok: true; email: string } | { ok: false; response: Response }> {
  const blocked = guard(req, { name: "admin-reviews", limit: 60, windowMs: 60_000, mutating: true });
  if (blocked) return { ok: false, response: blocked };
  const access = await requireAdmin();
  if (access.kind === "signed-out") return { ok: false, response: errorResponse(401, "SIGNED_OUT", "Please sign in.") };
  if (access.kind === "forbidden") return { ok: false, response: errorResponse(403, "FORBIDDEN", "You do not have access to this action.") };
  return { ok: true, email: access.admin.email };
}

const id = z.string().min(1).max(64);

/** Admin: approve (publish) or reject a review. */
export async function PATCH(req: Request) {
  const ctx = await front(req);
  if (!ctx.ok) return ctx.response;
  const parsed = z.object({ id, status: z.enum(["APPROVED", "REJECTED", "PENDING"]) }).safeParse(await readJson(req, 1_000).catch(() => null));
  if (!parsed.success) return errorResponse(422, "INVALID", "Which review, and approve or reject?");
  const db = getDb();
  if (!db) return errorResponse(503, "NO_DATABASE", "Website database is not configured.");
  const res = await db.productReview.updateMany({ where: { id: parsed.data.id }, data: { status: parsed.data.status, moderatedBy: ctx.email } });
  if (!res.count) return errorResponse(404, "NOT_FOUND", "This review no longer exists.");
  clearRatingsCache();
  return json({ ok: true });
}

/** Admin: delete a review for good (spam, personal data). */
export async function DELETE(req: Request) {
  const ctx = await front(req);
  if (!ctx.ok) return ctx.response;
  const parsed = z.object({ id }).safeParse(await readJson(req, 1_000).catch(() => null));
  if (!parsed.success) return errorResponse(422, "INVALID", "Which review?");
  const db = getDb();
  if (!db) return errorResponse(503, "NO_DATABASE", "Website database is not configured.");
  await db.productReview.deleteMany({ where: { id: parsed.data.id } });
  clearRatingsCache();
  return json({ ok: true });
}
