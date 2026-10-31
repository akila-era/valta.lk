import { requireAdmin } from "@/lib/admin/auth";
import { getDb } from "@/lib/db";
import { getSeasonSettings, saveSeasonSettings, seasonSchema } from "@/lib/season";
import { errorResponse, guard, json, readJson } from "@/lib/security/api";

export const dynamic = "force-dynamic";

/** Origin + rate limit, then an admin session: the same front door as the other admin APIs. */
async function front(req: Request, mutating: boolean): Promise<{ ok: true; email: string } | { ok: false; response: Response }> {
  const blocked = guard(req, { name: "admin-settings", limit: 30, windowMs: 60_000, mutating });
  if (blocked) return { ok: false, response: blocked };
  const access = await requireAdmin();
  if (access.kind === "signed-out") return { ok: false, response: errorResponse(401, "SIGNED_OUT", "Please sign in.") };
  if (access.kind === "forbidden") return { ok: false, response: errorResponse(403, "FORBIDDEN", "You do not have access to this action.") };
  return { ok: true, email: access.admin.email };
}

/** Admin: the storefront's seasonal theme. */
export async function GET(req: Request) {
  const ctx = await front(req, false);
  if (!ctx.ok) return ctx.response;
  return json({ settings: await getSeasonSettings(), canSave: Boolean(getDb()) });
}

/** Admin: switch a seasonal theme on, or back to the normal look. */
export async function PUT(req: Request) {
  const ctx = await front(req, true);
  if (!ctx.ok) return ctx.response;
  const parsed = seasonSchema.safeParse(await readJson(req, 2_000).catch(() => null));
  if (!parsed.success) return errorResponse(422, "INVALID", parsed.error.issues[0]?.message ?? "Check the settings.");
  if (!getDb()) return errorResponse(503, "NO_DATABASE", "Website database is not configured.");
  try {
    return json({ settings: await saveSeasonSettings(parsed.data, ctx.email) });
  } catch {
    return errorResponse(500, "SERVER_ERROR", "The theme could not be saved.");
  }
}
