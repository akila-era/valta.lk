import "server-only";
import { getActiveErpEnv } from "./connection";
import { erpRequest } from "./client";
import { withContent } from "./content-overlay";
import { endpoints } from "./endpoints";
import { mapProduct } from "./product-mapper";
import { effectivePrice } from "./product-utils";
import { queryProducts, type ProductQuery } from "./query";
import { erpCataloguePageSchema, rawProductSchema, type ErpProduct } from "./types";

export type { BrandSummary, CategorySummary, ProductListResult, ProductQuery, SortKey } from "./query";

export { effectivePrice };

const PAGE_SIZE = 100; // ERP maximum
const MAX_PAGES = 100;
const TTL_MS = 60_000;

interface Snapshot {
  products: Map<string, ErpProduct>;
  syncedAt: number;
  watermark?: string; // data.generatedAt of the last sync, used as updatedSince
}

const g = globalThis as unknown as { __voltaCatalogue?: Snapshot; __voltaCatalogueSync?: Promise<Snapshot> };

const erpOrigin = async () => {
  const env = await getActiveErpEnv();
  return env ? new URL(env.HX_API_BASE).origin : null;
};

async function fetchAll(updatedSince?: string) {
  const origin = await erpOrigin();
  const items: ErpProduct[] = [];
  const removed: string[] = [];
  let truncated = false;
  let cursor: string | undefined;
  let watermark: string | undefined;
  for (let i = 0; i < MAX_PAGES; i++) {
    const page = await erpRequest(endpoints.catalogue({ cursor, limit: PAGE_SIZE, updatedSince }), erpCataloguePageSchema);
    items.push(...page.items.map((p) => mapProduct(p, origin)));
    removed.push(...page.removed.map((r) => r.id));
    truncated ||= page.removedTruncated;
    // Keep the FIRST page's timestamp so changes made while paging are re-fetched next time.
    watermark ??= page.generatedAt;
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return { items, removed, truncated, watermark };
}

async function fullSync(): Promise<Snapshot> {
  const { items, watermark } = await fetchAll();
  return (g.__voltaCatalogue = { products: new Map(items.map((p) => [p.id, p])), syncedAt: Date.now(), watermark });
}

async function sync(): Promise<Snapshot> {
  const prev = g.__voltaCatalogue;
  if (!prev?.watermark) return fullSync();
  const { items, removed, truncated, watermark } = await fetchAll(prev.watermark);
  if (truncated) return fullSync(); // the ERP could not list every removal: reload everything
  const products = new Map(prev.products);
  removed.forEach((id) => products.delete(id));
  items.forEach((p) => products.set(p.id, p));
  return (g.__voltaCatalogue = { products, syncedAt: Date.now(), watermark: watermark ?? prev.watermark });
}

/** ERP catalogue with the website's own images/descriptions layered on top (see content-overlay.ts). */
export async function getSnapshot(): Promise<Snapshot> {
  const s = await getErpSnapshot();
  return { ...s, products: await withContent(s.products) };
}

/** Cached catalogue, refreshed at most once per TTL. A stale copy is only used if a refresh fails after a prior success. */
export async function getErpSnapshot(): Promise<Snapshot> {
  const cur = g.__voltaCatalogue;
  if (cur && Date.now() - cur.syncedAt < TTL_MS) return cur;
  g.__voltaCatalogueSync ??= sync().finally(() => {
    g.__voltaCatalogueSync = undefined;
  });
  try {
    return await g.__voltaCatalogueSync;
  } catch (e) {
    if (cur) return cur;
    throw e;
  }
}

export function resetCatalogueCache() {
  g.__voltaCatalogue = undefined;
  g.__voltaCatalogueSync = undefined;
}

/** Live (uncached) single product. Returns null when the ERP no longer lists it. */
export async function fetchLiveProduct(id: string): Promise<ErpProduct | null> {
  try {
    const raw = await erpRequest(endpoints.product(id), rawProductSchema);
    return mapProduct(raw, await erpOrigin());
  } catch (e) {
    if (e instanceof Error && "kind" in e && (e as { kind: string }).kind === "NOT_FOUND") return null;
    throw e;
  }
}

/** Search/filter/sort run on the cached catalogue: the ERP has no server-side sort or text search. */
export async function listProducts(query: ProductQuery = {}) {
  const { products } = await getSnapshot();
  return queryProducts([...products.values()], query);
}

export async function getProductBySlug(slug: string): Promise<ErpProduct | null> {
  const { products } = await getSnapshot();
  return [...products.values()].find((p) => p.slug === slug) ?? null;
}

export async function getRelated(product: ErpProduct, limit = 4): Promise<ErpProduct[]> {
  if (!product.category) return [];
  const { products } = await getSnapshot();
  return [...products.values()].filter((p) => p.id !== product.id && p.category?.slug === product.category?.slug).slice(0, limit);
}

/** Distinct brand names present in the catalogue (with a real product image when one exists), most products first. */
export async function listBrands(): Promise<{ name: string; count: number; image?: string }[]> {
  const { products } = await getSnapshot();
  const map = new Map<string, { name: string; count: number; image?: string }>();
  for (const p of products.values()) {
    const name = p.brand?.trim();
    if (!name) continue;
    const b = map.get(name) ?? { name, count: 0 };
    b.count++;
    b.image ??= p.images[0];
    map.set(name, b);
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

const niceStep = (x: number) => (x < 10_000 ? 500 : x < 100_000 ? 5_000 : 25_000);
const nice = (x: number) => Math.max(niceStep(x), Math.round(x / niceStep(x)) * niceStep(x));

/** Budget bands from the real price distribution (thirds, rounded to tidy numbers); null when too few products or not distinct. */
export function budgetBands(prices: number[]): { under: number; over: number } | null {
  if (prices.length < 6) return null;
  const sorted = [...prices].sort((a, b) => a - b);
  const under = nice(sorted[Math.floor(sorted.length / 3)]);
  const over = nice(sorted[Math.floor((sorted.length * 2) / 3)]);
  return over > under ? { under, over } : null;
}

export async function listPrices(): Promise<number[]> {
  const { products } = await getSnapshot();
  return [...products.values()].map((p) => effectivePrice(p));
}
