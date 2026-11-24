import "server-only";
import { getDb } from "./db";
import type { ErpProduct } from "./erp/types";
import { isLive, resolveHotDeals } from "./hot-deals";

/**
 * Hot Deals chosen by staff, resolved against the given ERP products. Returns null when the homepage should use its
 * normal ERP sale products instead: no website database, the table cannot be read, no entries, or none of them is
 * currently live and buyable. Never throws, so a database problem cannot break the homepage.
 */
export async function configuredHotDeals(products: Map<string, ErpProduct> | null, now: Date = new Date()): Promise<ErpProduct[] | null> {
  return (await configuredHotDealsWithEnd(products, now))?.deals ?? null;
}

/**
 * The same, plus when the first of the shown deals ends (null when none of them has an end date), for the homepage
 * countdown. Only real end dates set by staff are used: no invented urgency.
 */
export async function configuredHotDealsWithEnd(
  products: Map<string, ErpProduct> | null,
  now: Date = new Date(),
): Promise<{ deals: ErpProduct[]; endsAt: Date | null } | null> {
  const db = getDb();
  if (!db || !products) return null;
  const rows = await db.hotDeal
    .findMany({ where: { active: true }, select: { erpItemId: true, sortOrder: true, startsAt: true, endsAt: true, active: true, createdAt: true } })
    .catch(() => null);
  if (!rows?.length) return null;
  const deals = resolveHotDeals(rows, products, now);
  if (!deals.length) return null;
  const ends = rows
    .filter((r) => r.endsAt && isLive(r, now) && products.get(r.erpItemId)?.available)
    .map((r) => r.endsAt!.getTime());
  return { deals, endsAt: ends.length ? new Date(Math.min(...ends)) : null };
}
