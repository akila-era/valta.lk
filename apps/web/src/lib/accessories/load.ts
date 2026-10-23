import "server-only";
import { getDb } from "../db";
import { getSnapshot } from "../erp/catalogue";
import { resolveAccessoryOffers, type AccessoryOffer } from "./resolve";

/** Compatible accessories for the given ERP product ids. Empty when no links are stored or the database is absent. */
export async function offersForSources(sourceIds: string[]): Promise<AccessoryOffer[]> {
  const ids = [...new Set(sourceIds)].slice(0, 20);
  const db = getDb();
  if (!db || !ids.length) return [];
  try {
    const links = await db.accessoryLink.findMany({ where: { sourceItemId: { in: ids } } });
    const products = (await getSnapshot()).products;
    return resolveAccessoryOffers(links, products);
  } catch {
    return [];
  }
}
