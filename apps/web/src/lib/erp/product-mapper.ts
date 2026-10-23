import type { ErpProduct, ErpVariant, RawProduct } from "./types";

export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
}

/** The ERP has no slug. Name + ERP id gives a stable, unique, readable URL segment. */
export const productSlug = (name: string, id: string) => `${slugify(name) || "product"}-${id.toLowerCase()}`;

const isInStock = (availability: string) => availability === "IN_STOCK";

function imageUrl(img: { url: string; relative?: boolean }, erpOrigin: string | null): string | null {
  try {
    const pathOnly = !/^https?:\/\//i.test(img.url);
    const abs = img.relative || pathOnly ? (erpOrigin ? new URL(img.url, erpOrigin).toString() : null) : new URL(img.url).toString();
    return abs && /^https?:\/\//i.test(abs) ? abs : null;
  } catch {
    return null;
  }
}

/** Converts the ERP wire product into the storefront model. Sale prices apply only while the ERP says the discount is active. */
export function mapProduct(raw: RawProduct, erpOrigin: string | null): ErpProduct {
  const variants: ErpVariant[] = raw.variants.map((v) => ({
    key: v.key,
    label: [v.storage, v.color].filter(Boolean).join(" / ") || v.key,
    sku: v.sku ?? undefined,
    price: v.price,
    salePrice: v.discountActive && v.salePrice != null && v.salePrice < v.price ? v.salePrice : null,
    available: isInStock(v.availability) && v.purchasableQuantity > 0,
    purchasableQuantity: v.purchasableQuantity,
  }));

  const specs: Record<string, string> = {};
  if (raw.brand) specs.Brand = raw.brand;
  if (raw.model) specs.Model = raw.model;
  if (raw.condition) specs.Condition = raw.condition;
  if (raw.warrantyMonths) specs.Warranty = `${raw.warrantyMonths} months${raw.warrantyNote ? ` (${raw.warrantyNote})` : ""}`;
  const barcode = raw.barcode?.trim();
  if (barcode) specs.Barcode = barcode;

  const category = raw.category?.trim() ? { slug: slugify(raw.category), name: raw.category.trim() } : null;
  const sub = category && raw.subCategory?.trim() ? { slug: slugify(raw.subCategory), name: raw.subCategory.trim() } : null;

  return {
    id: raw.id,
    slug: productSlug(raw.name, raw.id),
    sku: raw.sku ?? undefined,
    barcode: barcode || undefined,
    name: raw.name,
    description: raw.description ?? "",
    brand: raw.brand ?? null,
    category: category && category.slug ? category : null,
    subCategory: sub && sub.slug ? sub : null,
    images: raw.images.map((i) => imageUrl(i, erpOrigin)).filter((u): u is string => Boolean(u)).slice(0, 8),
    price: raw.price,
    salePrice: raw.discountActive && raw.salePrice != null && raw.salePrice < raw.price ? raw.salePrice : null,
    specs,
    variants,
    hasVariants: raw.hasVariants || variants.length > 0,
    available: variants.length ? variants.some((v) => v.available) : isInStock(raw.availability) && raw.purchasableQuantity > 0,
    purchasableQuantity: raw.purchasableQuantity,
    publishedAt: raw.publishedAt ?? null,
    updatedAt: raw.updatedAt,
  };
}
