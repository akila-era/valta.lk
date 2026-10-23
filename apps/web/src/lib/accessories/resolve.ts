import { effectivePrice } from "../erp/product-utils";
import type { ErpProduct } from "../erp/types";

/** Kinds staff can assign. Compatibility is never guessed from the product name. */
export const ACCESSORY_KINDS = ["BACK_COVER", "SCREEN_PROTECTOR", "LENS_PROTECTOR", "CHARGER", "CABLE", "OTHER"] as const;
export type AccessoryKind = (typeof ACCESSORY_KINDS)[number];

export const ACCESSORY_LABELS: Record<AccessoryKind, string> = {
  BACK_COVER: "Back cover",
  SCREEN_PROTECTOR: "Screen protector",
  LENS_PROTECTOR: "Camera lens protector",
  CHARGER: "Charger",
  CABLE: "Cable",
  OTHER: "Accessory",
};

export const isAccessoryKind = (value: string): value is AccessoryKind => (ACCESSORY_KINDS as readonly string[]).includes(value);

export interface AccessoryLinkInput {
  sourceItemId: string;
  accessoryItemId: string;
  kind: AccessoryKind;
  /** Empty or omitted: compatible with every variant. A key limits the link to that ERP variant. */
  sourceVariantKey?: string | null;
}

export interface AccessoryOffer {
  sourceItemId: string;
  productId: string;
  slug: string;
  /** ERP name, used in the cart and on the order. */
  name: string;
  title: string;
  image?: string;
  sku?: string;
  unitPrice: number;
  /** True when the shown price is the lowest available variant, not a single purchasable option. */
  priceFrom: boolean;
  kind: AccessoryKind;
  kindLabel: string;
  variantKey: string;
  variantLabel?: string;
  canAdd: boolean;
  /** Empty when the link applies to every configuration of the source product. */
  sourceVariantKey: string;
}

/** A blank source variant matches any selection. A set key matches only that variant of its source product. */
export function offerMatchesSelection(offer: Pick<AccessoryOffer, "sourceItemId" | "sourceVariantKey">, selections: { productId: string; variantKey: string }[]): boolean {
  const relevant = selections.filter((s) => s.productId === offer.sourceItemId);
  if (!offer.sourceVariantKey) return relevant.length > 0 || selections.length === 0;
  return relevant.some((s) => s.variantKey === offer.sourceVariantKey);
}

/** When a variant-specific link and a product-wide link point at the same accessory, keep the specific one. */
export function preferSpecificOffers(offers: AccessoryOffer[]): AccessoryOffer[] {
  const specific = new Set(offers.filter((o) => o.sourceVariantKey).map((o) => `${o.sourceItemId}::${o.productId}`));
  return offers.filter((o) => o.sourceVariantKey || !specific.has(`${o.sourceItemId}::${o.productId}`));
}

/**
 * Turns explicit links into offers. Products missing from the catalogue, hidden from it, or out of stock are omitted.
 * A multi-variant accessory is shown but not added, so the wrong variant is never chosen for the customer.
 */
export function resolveAccessoryOffers(links: AccessoryLinkInput[], products: Map<string, ErpProduct>): AccessoryOffer[] {
  const out: AccessoryOffer[] = [];
  const seen = new Set<string>();
  for (const link of links) {
    if (!isAccessoryKind(link.kind) || link.sourceItemId === link.accessoryItemId) continue;
    const sourceVariantKey = link.sourceVariantKey?.trim() ?? "";
    const key = `${link.sourceItemId}::${sourceVariantKey}::${link.accessoryItemId}`;
    if (seen.has(key)) continue;
    const product = products.get(link.accessoryItemId);
    if (!product) continue;
    const title = product.content?.displayTitle || product.name;
    const base = {
      sourceItemId: link.sourceItemId,
      productId: product.id,
      slug: product.slug,
      name: product.name,
      title,
      image: product.images[0],
      sku: product.sku,
      kind: link.kind,
      kindLabel: ACCESSORY_LABELS[link.kind],
      sourceVariantKey,
    };
    if (product.hasVariants) {
      const variants = product.variants.filter((v) => v.available && v.purchasableQuantity > 0);
      if (!variants.length) continue;
      seen.add(key);
      if (variants.length === 1) {
        const v = variants[0];
        out.push({ ...base, sku: v.sku ?? product.sku, unitPrice: effectivePrice(v), priceFrom: false, variantKey: v.key, variantLabel: v.label, canAdd: true });
      } else {
        const unitPrice = Math.min(...variants.map((v) => effectivePrice(v)));
        out.push({ ...base, unitPrice, priceFrom: true, variantKey: "", canAdd: false });
      }
      continue;
    }
    if (!product.available || product.purchasableQuantity <= 0) continue;
    seen.add(key);
    out.push({ ...base, unitPrice: effectivePrice(product), priceFrom: false, variantKey: "", canAdd: true });
  }
  return out;
}
