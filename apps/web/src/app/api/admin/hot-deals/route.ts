import { erpProducts, hotDealFront, listHotDeals, presentHotDeal } from "@/lib/admin/hot-deal-api";
import { hotDealCreateSchema, MAX_HOT_DEALS } from "@/lib/hot-deals";
import { errorResponse, json, readJson } from "@/lib/security/api";

export const dynamic = "force-dynamic";

/** Admin: every Hot Deal entry in display order, with the live ERP facts for each product. */
export async function GET(req: Request) {
  const ctx = await hotDealFront(req, false);
  if (!ctx.ok) return ctx.response;
  try {
    const products = await erpProducts();
    return json({ deals: await listHotDeals(ctx.db, products), catalogueOk: products !== null, max: MAX_HOT_DEALS });
  } catch {
    return errorResponse(500, "SERVER_ERROR", "Hot Deals could not be loaded.");
  }
}

/** Admin: add an ERP product to Hot Deals. Only the selection and schedule are stored, never a price. */
export async function POST(req: Request) {
  const ctx = await hotDealFront(req, true);
  if (!ctx.ok) return ctx.response;
  const parsed = hotDealCreateSchema.safeParse(await readJson(req, 4_000).catch(() => null));
  if (!parsed.success) return errorResponse(422, "INVALID", parsed.error.issues[0]?.message ?? "Check the deal details.");
  const input = parsed.data;

  const products = await erpProducts();
  if (!products) return errorResponse(503, "ERP_UNAVAILABLE", "The ERP catalogue could not be reached, so the product could not be checked.");
  if (!products.has(input.erpItemId)) return errorResponse(422, "NOT_IN_CATALOGUE", "That product is not in the ERP catalogue.");

  try {
    const [existing, count, last] = await Promise.all([
      ctx.db.hotDeal.findUnique({ where: { erpItemId: input.erpItemId }, select: { id: true } }),
      ctx.db.hotDeal.count(),
      ctx.db.hotDeal.findFirst({ orderBy: { sortOrder: "desc" }, select: { sortOrder: true } }),
    ]);
    if (existing) return errorResponse(409, "DUPLICATE", "This product is already in Hot Deals.");
    if (count >= MAX_HOT_DEALS) return errorResponse(422, "TOO_MANY", `You can keep at most ${MAX_HOT_DEALS} Hot Deals. Remove one first.`);
    const row = await ctx.db.hotDeal.create({
      data: {
        erpItemId: input.erpItemId,
        sortOrder: (last?.sortOrder ?? -1) + 1,
        ...(input.startsAt ? { startsAt: new Date(input.startsAt) } : {}),
        endsAt: input.endsAt ? new Date(input.endsAt) : null,
        active: input.active,
        updatedBy: ctx.email,
      },
    });
    return json({ deal: presentHotDeal(row, products) }, 201);
  } catch (e) {
    // A second admin adding the same product at the same moment hits the unique index.
    if ((e as { code?: string })?.code === "P2002") return errorResponse(409, "DUPLICATE", "This product is already in Hot Deals.");
    return errorResponse(500, "SERVER_ERROR", "The deal could not be saved.");
  }
}
