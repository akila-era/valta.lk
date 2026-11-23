import type { ErpProduct } from "@/lib/erp/types";

/** What "Recently viewed" needs to draw a product card, and nothing else. */
export interface RecentProduct {
  id: string;
  slug: string;
  name: string;
  /** Published display title, when staff wrote one. */
  displayTitle?: string;
  brand?: string | null;
  model?: string;
  sku?: string;
  /** First product photo only. */
  image?: string;
  price: number;
  salePrice: number | null;
  available: boolean;
  hasVariants: boolean;
  purchasableQuantity: number;
  publishedAt: string | null;
}

/**
 * Whitelist mapper: copies only the public fields above. Descriptions, variants, specs, barcodes, categories, timestamps and
 * published content bodies never leave the server through the recently-viewed endpoint.
 */
export function toRecentProduct(p: ErpProduct): RecentProduct {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    displayTitle: p.content?.displayTitle || undefined,
    brand: p.brand ?? null,
    model: p.specs.Model || undefined,
    sku: p.sku,
    image: p.images[0],
    price: p.price,
    salePrice: p.salePrice,
    available: p.available,
    hasVariants: p.hasVariants,
    purchasableQuantity: p.purchasableQuantity,
    publishedAt: p.publishedAt,
  };
}
