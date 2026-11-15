import { readSnapshot, runAudit, type AuditOptions, type Report } from "../../../src/catalogue-intel";

/** Invented products only. Nothing here comes from any real catalogue. */
export type Raw = Record<string, unknown>;

let counter = 0;
export const resetIds = (): void => {
  counter = 0;
};

export function variant(over: Raw = {}): Raw {
  counter++;
  return { key: `v${counter}`, sku: `VSKU-${counter}`, storage: "128GB", color: "Black", price: "150000.00", salePrice: null, discountActive: false, availability: "IN_STOCK", purchasableQuantity: 5, ...over };
}

/** A clean, believable phone: it should raise no blocking finding. */
export function product(over: Raw = {}): Raw {
  counter++;
  const id = `p${counter}`;
  return {
    id,
    sku: `SKU-${1000 + counter}`,
    name: `Samsung Galaxy S24 ${counter}`,
    description: "A flagship phone with a bright display, a fast processor and an all-day battery, sold with the original charger in the box.",
    brand: "Samsung",
    category: "Mobile Phones",
    subCategory: null,
    model: `Galaxy S24 ${counter}`,
    condition: "BRAND_NEW",
    warrantyMonths: 12,
    warrantyNote: null,
    images: [{ url: "https://img.example.invalid/a.jpg" }],
    price: "249000.00",
    salePrice: null,
    discountActive: false,
    hasVariants: true,
    variants: [variant()],
    availability: "IN_STOCK",
    purchasableQuantity: 5,
    publishedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    ...over,
  };
}

export const phoneSpecs = (): { name: string; value: string }[] => [
  { name: "RAM", value: "8 GB" },
  { name: "Storage", value: "256 GB" },
  { name: "Display", value: "6.2 inch AMOLED" },
  { name: "Processor", value: "Snapdragon 8 Gen 3" },
  { name: "Camera", value: "50 MP" },
  { name: "Battery", value: "4000 mAh" },
  { name: "Connectivity", value: "5G, Wi-Fi 6, NFC" },
  { name: "Operating system", value: "Android 14" },
];

export function audit(products: Raw[], extra: { content?: unknown; links?: unknown; currency?: string } = {}, options: AuditOptions = {}): Report {
  return runAudit(readSnapshot({ items: products }, extra), options);
}

export const codes = (r: Report, id?: string): string[] => r.findings.filter((f) => !id || f.productIds.includes(id)).map((f) => f.code);
export const has = (r: Report, code: string, id?: string): boolean => codes(r, id).includes(code);
export const find = (r: Report, code: string) => r.findings.filter((f) => f.code === code);

/** Small deterministic generator for property-style tests. */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
