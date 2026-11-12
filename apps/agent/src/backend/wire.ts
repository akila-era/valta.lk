import { z } from "zod";

/**
 * The slice of the HEXALYTE ERP store-API wire contract that the assistant reads. It follows what the website's own ERP client
 * expects (apps/web/src/lib/erp/types.ts) and what the repo's MOCK ERP serves: money is a decimal STRING, responses are
 * `{ success: true, data }`, unknown fields are ignored (the contract allows additive changes). Read-only: the assistant never
 * calls an ERP write endpoint.
 */
const decimal = z.string().regex(/^\d+(\.\d{1,2})?$/, "expected a decimal string");

const RawVariant = z.looseObject({
  key: z.string(),
  sku: z.string().nullish(),
  storage: z.string().nullish(),
  color: z.string().nullish(),
  price: decimal,
  salePrice: decimal.nullish(),
  discountActive: z.boolean().default(false),
  availability: z.string().default("UNKNOWN"),
  purchasableQuantity: z.number().int().default(0),
});

export const RawProduct = z.looseObject({
  id: z.string(),
  sku: z.string().nullish(),
  name: z.string(),
  description: z.string().nullish(),
  brand: z.string().nullish(),
  category: z.string().nullish(),
  subCategory: z.string().nullish(),
  model: z.string().nullish(),
  condition: z.string().nullish(),
  warrantyMonths: z.number().int().nullish(),
  warrantyNote: z.string().nullish(),
  images: z.array(z.looseObject({ url: z.string(), relative: z.boolean().optional() })).default([]),
  price: decimal,
  salePrice: decimal.nullish(),
  discountActive: z.boolean().default(false),
  hasVariants: z.boolean().default(false),
  variants: z.array(RawVariant).default([]),
  availability: z.string().default("UNKNOWN"),
  purchasableQuantity: z.number().int().default(0),
  publishedAt: z.string().nullish(),
  updatedAt: z.string(),
});
export type RawProduct = z.infer<typeof RawProduct>;
export type RawVariant = z.infer<typeof RawVariant>;

export const CataloguePage = z.looseObject({
  items: z.array(RawProduct),
  nextCursor: z.string().nullish(),
});

export const RawSettings = z.looseObject({
  currency: z.string(),
  ordersEnabled: z.boolean(),
  deliveryCharge: decimal,
});
export type RawSettings = z.infer<typeof RawSettings>;

export const ORDER_STATUSES = ["PLACED", "CONFIRMED", "DISPATCHED", "DELIVERED", "CANCELLED"] as const;

export const RawOrder = z.looseObject({
  externalRef: z.string(),
  status: z.enum(ORDER_STATUSES),
  currency: z.string(),
  paymentMethod: z.string(),
  paymentStatus: z.string().optional(),
  lines: z.array(z.looseObject({ itemId: z.string(), variantKey: z.string().nullish(), quantity: z.number().int(), unitPrice: decimal })),
  deliveryCharge: decimal,
  total: decimal,
  trackingNumber: z.string().nullish(),
  carrierName: z.string().nullish(),
});
export type RawOrder = z.infer<typeof RawOrder>;

// ---------- money: integer cents everywhere, so no floating-point price can drift ----------

export function toCents(decimalString: string): number {
  const [whole = "0", frac = ""] = decimalString.split(".");
  return Number(whole) * 100 + Number((frac + "00").slice(0, 2));
}

export function formatLkr(cents: number): string {
  const whole = Math.floor(cents / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `Rs. ${whole}.${String(cents % 100).padStart(2, "0")}`;
}

export const money = (cents: number): { amount: number; text: string } => ({ amount: cents / 100, text: formatLkr(cents) });
