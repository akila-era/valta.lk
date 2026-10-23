import { requireAdmin } from "@/lib/admin/auth";
import { getDb } from "@/lib/db";
import { getSnapshot } from "@/lib/erp/catalogue";
import { promotionData, promotionInputSchema, type PromotionInput } from "@/lib/promotions/input";
import { errorResponse, guard, json, readJson } from "@/lib/security/api";

export const dynamic = "force-dynamic";

const idRe = /^[a-z0-9]{8,40}$/i;

async function catalogueCheck(input: PromotionInput): Promise<string | null> {
  let products;
  try {
    products = (await getSnapshot()).products;
  } catch {
    return "The ERP catalogue could not be reached, so product and category eligibility could not be checked.";
  }
  const missing = [...input.productIds, ...(input.bundleAccessoryId ? [input.bundleAccessoryId] : [])].filter((id) => !products.has(id));
  if (missing.length) return "Every product must exist in the ERP catalogue.";
  const names = new Set([...products.values()].map((p) => p.category?.name).filter((n): n is string => Boolean(n)));
  if (input.categoryNames.some((n) => !names.has(n))) return "Every category must match a category name from the ERP catalogue.";
  return null;
}

/** Admin: replace a promotion's rules. Redemption history is kept. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = guard(req, { name: "admin-promotions", limit: 60, windowMs: 60_000, mutating: true });
  if (blocked) return blocked;
  const access = await requireAdmin();
  if (access.kind === "signed-out") return errorResponse(401, "SIGNED_OUT", "Please sign in.");
  if (access.kind === "forbidden") return errorResponse(403, "FORBIDDEN", "You do not have access to this action.");
  const { id } = await params;
  if (!idRe.test(id)) return errorResponse(404, "NOT_FOUND", "Promotion not found.");
  const db = getDb();
  if (!db) return errorResponse(503, "NO_DATABASE", "Website database is not configured.");
  const parsed = promotionInputSchema.safeParse(await readJson(req, 20_000).catch(() => null));
  if (!parsed.success) return errorResponse(422, "INVALID", parsed.error.issues[0]?.message ?? "Check the promotion details.");
  const problem = await catalogueCheck(parsed.data);
  if (problem) return errorResponse(422, "INVALID", problem);
  try {
    const row = await db.promotion.update({ where: { id }, data: promotionData(parsed.data) });
    const stats = await db.promotionRedemption.aggregate({ where: { promotionId: id }, _count: { _all: true }, _sum: { discount: true } });
    return json({
      promotion: {
        ...parsed.data,
        id: row.id,
        startsAt: row.startsAt.toISOString(),
        endsAt: row.endsAt?.toISOString() ?? null,
        used: stats._count._all,
        discountGiven: Number(stats._sum.discount ?? 0),
      },
    });
  } catch {
    return errorResponse(404, "NOT_FOUND", "Promotion not found.");
  }
}
