import "server-only";
import { getDb } from "./db";
import type { ErpProduct } from "./erp/types";
import { resolveHotDeals } from "./hot-deals";

/**
 * Hot Deals chosen by staff, resolved against the given ERP products. Returns null when the homepage should use its
 * normal ERP sale products instead: no website database, the table cannot be read, no entries, or none of them is
 * currently live and buyable. Never throws, so a database problem cannot break the homepage.
 */
export async function configuredHotDeals(products: Map<string, ErpProduct> | null, now: Date = new Date()): Promise<ErpProduct[] | null> {
  const db = getDb();
  if (!db || !products) return null;
  const rows = await db.hotDeal
    .findMany({ where: { active: true }, select: { erpItemId: true, sortOrder: true, startsAt: true, endsAt: true, active: true, createdAt: true } })
    .catch(() => null);
  if (!rows?.length) return null;
  const deals = resolveHotDeals(rows, products, now);
  return deals.length ? deals : null;
}
