import "server-only";
import { fetchLiveProduct } from "./catalogue";
import { effectivePrice } from "./product-utils";
import type { AvailabilityLine } from "./types";

export interface LineRequest {
  productId: string;
  variantKey: string;
  quantity: number;
}

/**
 * Live (uncached) availability and authoritative unit prices for specific cart lines.
 * The ERP's availability feed is a bulk cursor feed, so per-line checks read the live product
 * (`GET /catalogue/products/{id}`), which carries price, sale state and purchasable quantity.
 * `purchasableQuantity` is capped at 20 by the ERP; the order endpoint remains the final authority.
 */
export async function checkAvailability(lines: LineRequest[]): Promise<AvailabilityLine[]> {
  const ids = [...new Set(lines.map((l) => l.productId))];
  const products = new Map(await Promise.all(ids.map(async (id) => [id, await fetchLiveProduct(id)] as const)));

  return lines.map((l) => {
    const p = products.get(l.productId);
    const base = { itemId: l.productId, variantKey: l.variantKey, requested: l.quantity };
    const categoryName = p?.category?.name ?? null;
    if (!p) return { ...base, available: false, maxQuantity: 0, unitPrice: 0, listPrice: 0, categoryName };

    if (p.hasVariants) {
      const v = p.variants.find((x) => x.key === l.variantKey);
      if (!v) return { ...base, available: false, maxQuantity: 0, unitPrice: 0, listPrice: 0, categoryName };
      return {
        ...base,
        available: v.available && l.quantity <= v.purchasableQuantity,
        maxQuantity: v.purchasableQuantity,
        unitPrice: effectivePrice(v),
        listPrice: v.price,
        categoryName,
      };
    }
    if (l.variantKey) return { ...base, available: false, maxQuantity: 0, unitPrice: 0, listPrice: 0, categoryName };
    return {
      ...base,
      available: p.available && l.quantity <= p.purchasableQuantity,
      maxQuantity: p.purchasableQuantity,
      unitPrice: effectivePrice(p),
      listPrice: p.price,
      categoryName,
    };
  });
}
