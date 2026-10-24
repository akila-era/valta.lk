import { hotDealFront } from "@/lib/admin/hot-deal-api";
import { hotDealReorderSchema } from "@/lib/hot-deals";
import { errorResponse, json, readJson } from "@/lib/security/api";

export const dynamic = "force-dynamic";

/** Admin: save the display order. The body lists every deal id once, first shown first. */
export async function POST(req: Request) {
  const ctx = await hotDealFront(req, true);
  if (!ctx.ok) return ctx.response;
  const parsed = hotDealReorderSchema.safeParse(await readJson(req, 4_000).catch(() => null));
  if (!parsed.success) return errorResponse(422, "INVALID", "The new order was not understood. Reload and try again.");
  const { ids } = parsed.data;
  const existing = await ctx.db.hotDeal.findMany({ select: { id: true } }).catch(() => null);
  if (!existing) return errorResponse(500, "SERVER_ERROR", "The order could not be saved.");
  const known = new Set(existing.map((r) => r.id));
  if (new Set(ids).size !== ids.length || ids.length !== known.size || ids.some((id) => !known.has(id))) {
    return errorResponse(409, "STALE", "Hot Deals changed in another window. Reload and try again.");
  }
  const done = await ctx.db
    .$transaction(ids.map((id, i) => ctx.db.hotDeal.update({ where: { id }, data: { sortOrder: i, updatedBy: ctx.email } })))
    .then(() => true)
    .catch(() => false);
  if (!done) return errorResponse(500, "SERVER_ERROR", "The order could not be saved.");
  return json({ ok: true });
}
