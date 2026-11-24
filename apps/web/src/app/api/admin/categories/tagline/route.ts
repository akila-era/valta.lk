import { z } from "zod";
import { requireAdmin } from "@/lib/admin/auth";
import { MAX_TAGLINE, saveCategoryTagline } from "@/lib/category-taglines";
import { getDb } from "@/lib/db";
import { errorResponse, guard, json, readJson } from "@/lib/security/api";

export const dynamic = "force-dynamic";

const body = z.object({ slug: z.string().trim().min(1).max(120), tagline: z.string().max(MAX_TAGLINE) });

/** Admin: set (or with an empty value, remove) one category's short line for the homepage range tiles. */
export async function PUT(req: Request) {
  const blocked = guard(req, { name: "admin-settings", limit: 60, windowMs: 60_000, mutating: true });
  if (blocked) return blocked;
  const access = await requireAdmin();
  if (access.kind === "signed-out") return errorResponse(401, "SIGNED_OUT", "Please sign in.");
  if (access.kind === "forbidden") return errorResponse(403, "FORBIDDEN", "You do not have access to this action.");
  const parsed = body.safeParse(await readJson(req, 1_000).catch(() => null));
  if (!parsed.success) return errorResponse(422, "INVALID", `Keep it to ${MAX_TAGLINE} characters.`);
  if (!getDb()) return errorResponse(503, "NO_DATABASE", "Website database is not configured.");
  try {
    await saveCategoryTagline(parsed.data.slug, parsed.data.tagline, access.admin.email);
    return json({ ok: true });
  } catch {
    return errorResponse(500, "SERVER_ERROR", "The line could not be saved.");
  }
}
