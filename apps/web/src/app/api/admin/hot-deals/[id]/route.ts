import { erpProducts, hotDealFront, presentHotDeal, validDealId } from "@/lib/admin/hot-deal-api";
import { hotDealUpdateSchema } from "@/lib/hot-deals";
import { errorResponse, json, readJson } from "@/lib/security/api";

export const dynamic = "force-dynamic";

/** Admin: change a deal's schedule or switch it on/off. The product and its price cannot be changed here. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await hotDealFront(req, true);
  if (!ctx.ok) return ctx.response;
  const { id } = await params;
  if (!validDealId(id)) return errorResponse(404, "NOT_FOUND", "Deal not found.");
  const parsed = hotDealUpdateSchema.safeParse(await readJson(req, 4_000).catch(() => null));
  if (!parsed.success) return errorResponse(422, "INVALID", parsed.error.issues[0]?.message ?? "Check the deal details.");
  const { startsAt, endsAt, active } = parsed.data;
  const row = await ctx.db.hotDeal
    .update({ where: { id }, data: { startsAt: new Date(startsAt), endsAt: endsAt ? new Date(endsAt) : null, active, updatedBy: ctx.email } })
    .catch(() => null);
  if (!row) return errorResponse(404, "NOT_FOUND", "Deal not found.");
  return json({ deal: presentHotDeal(row, await erpProducts()) });
}

/** Admin: remove a product from Hot Deals. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await hotDealFront(req, true);
  if (!ctx.ok) return ctx.response;
  const { id } = await params;
  if (!validDealId(id)) return errorResponse(404, "NOT_FOUND", "Deal not found.");
  await ctx.db.hotDeal.deleteMany({ where: { id } }).catch(() => null);
  return json({ ok: true });
}
