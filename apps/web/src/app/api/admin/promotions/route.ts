import type { PrismaClient } from "@/generated/prisma/client";
import { requireAdmin } from "@/lib/admin/auth";
import { getDb } from "@/lib/db";
import { getSnapshot } from "@/lib/erp/catalogue";
import { promotionData, promotionInputSchema, type PromotionInput } from "@/lib/promotions/input";
import { errorResponse, guard, json, readJson } from "@/lib/security/api";

export const dynamic = "force-dynamic";

async function adminDb(req: Request, mutating: boolean) {
  const blocked = guard(req, { name: "admin-promotions", limit: 60, windowMs: 60_000, mutating });
  if (blocked) return { error: blocked };
  const access = await requireAdmin();
  if (access.kind === "signed-out") return { error: errorResponse(401, "SIGNED_OUT", "Please sign in.") };
  if (access.kind === "forbidden") return { error: errorResponse(403, "FORBIDDEN", "You do not have access to this action.") };
  const db = getDb();
  if (!db) return { error: errorResponse(503, "NO_DATABASE", "Website database is not configured.") };
  return { db, email: access.admin.email };
}

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

function present(row: {
  id: string; name: string; type: "PERCENT" | "FIXED"; value: number; minSubtotalCents: number; maxDiscountCents: number | null;
  startsAt: Date; endsAt: Date | null; usageLimit: number | null; perCustomerLimit: number | null; stackable: boolean; active: boolean;
  productIds: string[]; categoryNames: string[]; bundleAccessoryId: string | null;
}, used: number, discountGiven: number) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    value: row.type === "FIXED" ? row.value / 100 : row.value,
    minSubtotal: row.minSubtotalCents / 100,
    maxDiscount: row.maxDiscountCents == null ? null : row.maxDiscountCents / 100,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt?.toISOString() ?? null,
    usageLimit: row.usageLimit,
    perCustomerLimit: row.perCustomerLimit,
    stackable: row.stackable,
    active: row.active,
    productIds: row.productIds,
    categoryNames: row.categoryNames,
    bundleAccessoryId: row.bundleAccessoryId,
    used,
    discountGiven,
  };
}

async function list(db: PrismaClient) {
  const [rows, sums] = await Promise.all([
    db.promotion.findMany({ orderBy: { updatedAt: "desc" } }),
    db.promotionRedemption.groupBy({ by: ["promotionId"], _count: { _all: true }, _sum: { discount: true } }),
  ]);
  const stats = new Map(sums.map((s) => [s.promotionId, { used: s._count._all, discountGiven: Number(s._sum.discount ?? 0) }]));
  return rows.map((r) => present(r, stats.get(r.id)?.used ?? 0, stats.get(r.id)?.discountGiven ?? 0));
}

export async function GET(req: Request) {
  const ctx = await adminDb(req, false);
  if ("error" in ctx) return ctx.error;
  try {
    const products = await getSnapshot().then((s) => s.products).catch(() => null);
    const categories = products ? [...new Set([...products.values()].map((p) => p.category?.name).filter((n): n is string => Boolean(n)))].sort() : [];
    return json({ promotions: await list(ctx.db), categories });
  } catch {
    return errorResponse(500, "SERVER_ERROR", "Promotions could not be loaded.");
  }
}

export async function POST(req: Request) {
  const ctx = await adminDb(req, true);
  if ("error" in ctx) return ctx.error;
  const parsed = promotionInputSchema.safeParse(await readJson(req, 20_000).catch(() => null));
  if (!parsed.success) return errorResponse(422, "INVALID", parsed.error.issues[0]?.message ?? "Check the promotion details.");
  const problem = await catalogueCheck(parsed.data);
  if (problem) return errorResponse(422, "INVALID", problem);
  try {
    const row = await ctx.db.promotion.create({ data: promotionData(parsed.data) });
    return json({ promotion: present(row, 0, 0) }, 201);
  } catch {
    return errorResponse(500, "SERVER_ERROR", "The promotion could not be saved.");
  }
}
