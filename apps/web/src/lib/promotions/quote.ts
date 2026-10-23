import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { getDb } from "../db";
import { evaluatePromotions, type PriceQuote, type PricedLine, type PromotionRule } from "./evaluate";

export async function loadPromotionRules(db: PrismaClient, customerId: string | null): Promise<PromotionRule[]> {
  const [rows, counts, mine] = await Promise.all([
    db.promotion.findMany({ orderBy: { createdAt: "asc" } }),
    db.promotionRedemption.groupBy({ by: ["promotionId"], _count: { _all: true } }),
    customerId
      ? db.promotionRedemption.groupBy({ by: ["promotionId"], where: { customerId }, _count: { _all: true } })
      : Promise.resolve([]),
  ]);
  const used = new Map(counts.map((c) => [c.promotionId, c._count._all]));
  const byCustomer = new Map(mine.map((c) => [c.promotionId, c._count._all]));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    value: r.type === "FIXED" ? r.value / 100 : r.value,
    minSubtotal: r.minSubtotalCents / 100,
    maxDiscount: r.maxDiscountCents == null ? null : r.maxDiscountCents / 100,
    startsAt: r.startsAt.getTime(),
    endsAt: r.endsAt?.getTime() ?? null,
    usageLimit: r.usageLimit,
    perCustomerLimit: r.perCustomerLimit,
    used: used.get(r.id) ?? 0,
    usedByCustomer: byCustomer.get(r.id) ?? 0,
    stackable: r.stackable,
    active: r.active,
    productIds: r.productIds,
    categoryNames: r.categoryNames,
    bundleAccessoryId: r.bundleAccessoryId,
  }));
}

/** Quotes the cart. A database or promotion error never changes the HEXALYTE total. */
export async function quotePricedLines(lines: PricedLine[], opts: { customerId?: string | null; delivery?: number; now?: number } = {}): Promise<PriceQuote> {
  const now = opts.now ?? Date.now();
  const delivery = opts.delivery ?? 0;
  const db = getDb();
  if (!db) return evaluatePromotions(lines, [], now, delivery, opts.customerId ?? null);
  try {
    const rules = await loadPromotionRules(db, opts.customerId ?? null);
    return evaluatePromotions(lines, rules, now, delivery, opts.customerId ?? null);
  } catch {
    return evaluatePromotions(lines, [], now, delivery, opts.customerId ?? null);
  }
}

export function breakdownJson(quote: PriceQuote): Record<string, unknown> {
  return {
    subtotal: quote.subtotal,
    catalogueSavings: quote.catalogueSavings,
    delivery: quote.delivery,
    total: quote.total,
    lines: quote.lines,
    advertised: quote.advertised,
    blocked: quote.decisions.filter((d) => d.status === "blocked").map((d) => ({ id: d.id, name: d.name, reason: d.reason })),
  };
}

/** Records that an advertised promotion explained this order. Safe to call twice for the same reference. */
export async function recordAdvertisedRedemptions(db: PrismaClient, externalRef: string, customerId: string | null, quote: PriceQuote): Promise<void> {
  if (!quote.advertised.length) return;
  await db.promotionRedemption.createMany({
    data: quote.advertised.map((p) => ({
      promotionId: p.id,
      externalRef,
      customerId,
      discount: p.discount.toFixed(2),
    })),
    skipDuplicates: true,
  });
}
