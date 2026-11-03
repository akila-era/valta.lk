import { z } from "zod";
import { requireAdmin } from "@/lib/admin/auth";
import { saveBrandColor } from "@/lib/brand-colors";
import { getDb } from "@/lib/db";
import { errorResponse, guard, json, readJson } from "@/lib/security/api";

export const dynamic = "force-dynamic";

const body = z.object({
  brand: z.string().trim().min(1).max(80),
  /** #rrggbb, or null to go back to the brand's default colour. */
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable(),
});

/** Admin: set (or reset) one brand's colour for its brand page and its tile in "Explore our brands". */
export async function PUT(req: Request) {
  const blocked = guard(req, { name: "admin-settings", limit: 60, windowMs: 60_000, mutating: true });
  if (blocked) return blocked;
  const access = await requireAdmin();
  if (access.kind === "signed-out") return errorResponse(401, "SIGNED_OUT", "Please sign in.");
  if (access.kind === "forbidden") return errorResponse(403, "FORBIDDEN", "You do not have access to this action.");
  const parsed = body.safeParse(await readJson(req, 1_000).catch(() => null));
  if (!parsed.success) return errorResponse(422, "INVALID", "Choose a colour like #1428a0.");
  if (!getDb()) return errorResponse(503, "NO_DATABASE", "Website database is not configured.");
  try {
    await saveBrandColor(parsed.data.brand, parsed.data.color, access.admin.email);
    return json({ ok: true });
  } catch {
    return errorResponse(500, "SERVER_ERROR", "The colour could not be saved.");
  }
}
