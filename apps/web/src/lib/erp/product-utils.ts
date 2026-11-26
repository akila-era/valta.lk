/** Pure helpers shared by server and client code (no server-only imports). */
export const effectivePrice = (p: { price: number; salePrice?: number | null }) =>
  p.salePrice != null && p.salePrice < p.price ? p.salePrice : p.price;

export const isOnSale = (p: { price: number; salePrice?: number | null }) => effectivePrice(p) < p.price;

/** Whole-percent discount derived from real ERP prices; null when there is no valid sale. */
export function discountPercent(p: { price: number; salePrice?: number | null }): number | null {
  if (!isOnSale(p) || p.price <= 0) return null;
  const pct = Math.floor(((p.price - effectivePrice(p)) / p.price) * 100);
  return pct >= 1 ? pct : null;
}

type Priced = { price: number; salePrice?: number | null };

/** Schema.org offer from real prices. Several different prices become an aggregate range, never a single invented price. */
export function productOffer(product: Priced & { available: boolean; variants?: Priced[] }) {
  const availability = product.available ? "https://schema.org/InStock" : "https://schema.org/OutOfStock";
  const prices = (product.variants?.length ? product.variants : [product]).map(effectivePrice).filter((n) => Number.isFinite(n) && n >= 0);
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  if (prices.length > 1 && low !== high) {
    return { "@type": "AggregateOffer" as const, priceCurrency: "LKR", lowPrice: low, highPrice: high, offerCount: prices.length, availability };
  }
  return { "@type": "Offer" as const, priceCurrency: "LKR", price: prices[0] ?? effectivePrice(product), availability };
}

const NEW_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/** True when the ERP published the product within the last 30 days. */
export function isNewArrival(publishedAt: string | null | undefined, now: number = Date.now()): boolean {
  const t = publishedAt ? Date.parse(publishedAt) : NaN;
  return Number.isFinite(t) && now - t >= 0 && now - t <= NEW_WINDOW_MS;
}

/** Spec names that identify a product. Other specs (colour, size) are not searched as identifiers. */
const IDENTIFIER_SPEC = /^(barcode|ean|gtin|upc|sku|model|model number)$/i;

export interface SearchableProduct {
  name: string;
  sku?: string;
  brand?: string | null;
  barcode?: string | null;
  category?: { name: string } | null;
  subCategory?: { name: string } | null;
  specs?: Record<string, string>;
  variants?: { sku?: string; label?: string }[];
  content?: { displayTitle?: string; specs?: { name: string; value: string }[] } | null;
}

/** Text the storefront can match. Only real catalogue fields, including a barcode when the catalogue actually has one. */
export function searchHaystack(p: SearchableProduct): string {
  const specs = p.specs ?? {};
  const identifiers = [
    p.barcode,
    ...Object.entries(specs).filter(([k]) => IDENTIFIER_SPEC.test(k)).map(([, v]) => v),
    ...(p.content?.specs ?? []).filter((s) => IDENTIFIER_SPEC.test(s.name)).map((s) => s.value),
  ];
  return [
    p.name,
    p.content?.displayTitle,
    p.sku,
    p.brand,
    p.category?.name,
    p.subCategory?.name,
    ...(p.variants ?? []).flatMap((v) => [v.sku, v.label]),
    ...identifiers,
  ]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(" ")
    .toLowerCase();
}

/**
 * How well a product answers a search, for ordering results: a name that starts with or contains the words counts most,
 * then an exact SKU/model, then brand and category. A product that only matched through its category sorts below
 * products with the words in their name ("charger" lists chargers before a Bluetooth adapter filed under Chargers).
 */
export function relevanceScore(p: SearchableProduct, q: string | undefined): number {
  const needle = q?.trim().toLowerCase();
  if (!needle) return 0;
  const name = `${p.name} ${p.content?.displayTitle ?? ""}`.toLowerCase();
  const words = name.split(/[^a-z0-9]+/).filter(Boolean);
  const skus = [p.sku, ...(p.variants ?? []).map((v) => v.sku)].filter((s): s is string => Boolean(s)).map((s) => s.toLowerCase());
  const brand = (p.brand ?? "").toLowerCase();
  const cats = `${p.category?.name ?? ""} ${p.subCategory?.name ?? ""}`.toLowerCase();
  let score = name.startsWith(needle) ? 40 : name.includes(needle) ? 25 : 0;
  for (const t of needle.split(/\s+/)) {
    if (skus.some((s) => s === t)) score += 50;
    else if (skus.some((s) => s.includes(t))) score += 15;
    if (words.some((w) => w === t)) score += 20;
    else if (words.some((w) => w.startsWith(t))) score += 14;
    else if (name.includes(t)) score += 8;
    if (brand.includes(t)) score += 5;
    if (cats.includes(t)) score += 3;
  }
  return score;
}

/** Every word must appear. An empty query matches everything. */
export function matchesSearch(p: SearchableProduct, q: string | undefined): boolean {
  const needle = q?.trim().toLowerCase();
  if (!needle) return true;
  const hay = searchHaystack(p);
  return needle.split(/\s+/).every((token) => hay.includes(token));
}

export function matchesBrand(brand: string | null | undefined, filter: string | undefined): boolean {
  const want = filter?.trim().toLowerCase();
  if (!want) return true;
  return (brand ?? "").trim().toLowerCase() === want;
}

/** More than one variant is ambiguous until the shopper picks one. */
export function variantChoiceRequired(variantCount: number): boolean {
  return variantCount > 1;
}

/** Upper quantity the UI may offer: live stock, and never above the cart line cap. */
export function quantityCap(stock: number, hardMax: number): number {
  if (!Number.isInteger(stock) || stock <= 0) return 1;
  return Math.min(hardMax, stock);
}
