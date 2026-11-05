import { z } from "zod";
import { requireAdmin } from "@/lib/admin/auth";
import { getDb } from "@/lib/db";
import { errorResponse, guard, json, readJson } from "@/lib/security/api";

export const dynamic = "force-dynamic";

const body = z.object({ status: z.enum(["NEW", "CONTACTED"]) });

/** Admin: mark a wholesale application as contacted (or back to new). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = guard(req, { name: "admin-settings", limit: 60, windowMs: 60_000, mutating: true });
  if (blocked) return blocked;
  const access = await requireAdmin();
  if (access.kind === "signed-out") return errorResponse(401, "SIGNED_OUT", "Please sign in.");
  if (access.kind === "forbidden") return errorResponse(403, "FORBIDDEN", "You do not have access to this action.");
  const parsed = body.safeParse(await readJson(req, 500).catch(() => null));
  if (!parsed.success) return errorResponse(422, "INVALID", "Unknown status.");
  const db = getDb();
  if (!db) return errorResponse(503, "NO_DATABASE", "Website database is not configured.");
  const { id } = await params;
  const updated = await db.wholesaleApplication.updateMany({ where: { id: id.slice(0, 40) }, data: { status: parsed.data.status } }).catch(() => null);
  if (!updated) return errorResponse(500, "SERVER_ERROR", "Could not update.");
  if (updated.count === 0) return errorResponse(404, "NOT_FOUND", "That application no longer exists.");
  return json({ ok: true });
}
