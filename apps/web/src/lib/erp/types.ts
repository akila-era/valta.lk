import { z } from "zod";
import { parseDecimal } from "../utils/money";

/**
 * Schemas follow docs/API_INTEGRATION_GUIDE.md and docs/openapi.yaml of the HEXALYTE ERP
 * (windsurf-project, branch feature/ecommerce-cod-launch). Money on the wire is a decimal string.
 * Unknown response fields are ignored (the contract allows additive changes inside v1).
 */

const decimal = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, "expected a decimal string")
  .transform(parseDecimal);

export const ORDER_STATUSES = ["PLACED", "CONFIRMED", "DISPATCHED", "DELIVERED", "CANCELLED"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export const TERMINAL_STATUSES: OrderStatus[] = ["DELIVERED", "CANCELLED"];

export const erpSettingsSchema = z.object({
  currency: z.string(),
  reservationsEnabled: z.boolean().default(false),
  ordersEnabled: z.boolean(),
  paymentMethods: z.object({ COD: z.boolean().default(false), ONLINE: z.boolean().default(false) }).partial().default({}),
  deliveryCharge: decimal,
  limits: z
    .object({ maxOrderLines: z.number().int().optional(), maxQuantityPerLine: z.number().int().optional() })
    .partial()
    .optional(),
});
export type ErpSettings = z.infer<typeof erpSettingsSchema>;

// ---- Catalogue (raw wire shape) ----
const rawVariantSchema = z.object({
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

export const rawProductSchema = z.object({
  id: z.string(),
  sku: z.string().nullish(),
  /** Present only when the store API includes it. The public catalogue usually omits barcodes. */
  barcode: z.string().trim().max(64).nullish(),
  name: z.string(),
  description: z.string().nullish(),
  brand: z.string().nullish(),
  category: z.string().nullish(),
  subCategory: z.string().nullish(),
  model: z.string().nullish(),
  condition: z.string().nullish(),
  warrantyMonths: z.number().int().nullish(),
  warrantyNote: z.string().nullish(),
  images: z.array(z.object({ url: z.string(), relative: z.boolean().optional() })).default([]),
  price: decimal,
  salePrice: decimal.nullish(),
  discountActive: z.boolean().default(false),
  hasVariants: z.boolean().default(false),
  variants: z.array(rawVariantSchema).default([]),
  availability: z.string().default("UNKNOWN"),
  purchasableQuantity: z.number().int().default(0),
  publishedAt: z.string().nullish(),
  updatedAt: z.string(),
});
export type RawProduct = z.infer<typeof rawProductSchema>;

export const erpCataloguePageSchema = z.object({
  currency: z.string().optional(),
  items: z.array(rawProductSchema),
  removed: z.array(z.object({ id: z.string() })).default([]),
  removedTruncated: z.boolean().default(false),
  nextCursor: z.string().nullish(),
  generatedAt: z.string().optional(),
});

/** Storefront product model (normalised from the wire shape in catalogue.ts). */
export interface ErpVariant {
  key: string;
  label: string;
  sku?: string;
  price: number;
  salePrice: number | null;
  available: boolean;
  purchasableQuantity: number;
}

export interface ErpProduct {
  id: string;
  slug: string;
  sku?: string;
  /** Set only when the ERP catalogue payload includes a barcode. */
  barcode?: string;
  name: string;
  description: string;
  brand?: string | null;
  category?: { slug: string; name: string } | null;
  subCategory?: { slug: string; name: string } | null;
  images: string[];
  price: number;
  salePrice: number | null;
  specs: Record<string, string>;
  variants: ErpVariant[];
  hasVariants: boolean;
  available: boolean;
  purchasableQuantity: number;
  publishedAt: string | null;
  updatedAt: string;
  /** Published website content for this product (presentation only; never price/stock). Absent = plain ERP product. */
  content?: import("../content/schema").ContentDoc;
}

// ---- Reservations ----
export const reservationSchema = z.object({
  externalRef: z.string(),
  status: z.string(),
  expiresAt: z.string(),
});
export type Reservation = z.infer<typeof reservationSchema>;

// ---- Orders ----
export const erpOrderSchema = z
  .object({
    externalRef: z.string(),
    status: z.enum(ORDER_STATUSES),
    currency: z.string(),
    paymentMethod: z.string(),
    paymentStatus: z.string().optional(), // PENDING | PAID | FAILED | COD_PENDING | COD_COLLECTED
    lines: z.array(
      z.object({
        itemId: z.string(),
        variantKey: z.string().nullish(),
        quantity: z.number().int(),
        unitPrice: decimal,
      }),
    ),
    deliveryCharge: decimal,
    total: decimal,
    placedAt: z.string().optional(),
    trackingNumber: z.string().nullish(),
    carrierName: z.string().nullish(),
  })
  .transform((o) => ({
    ...o,
    lines: o.lines.map((l) => ({ ...l, variantKey: l.variantKey ?? "" })),
  }));
export type ErpOrder = z.infer<typeof erpOrderSchema>;

/** Order creation request in storefront terms; orders.ts converts it to the wire format. */
export interface CreateOrderRequest {
  externalRef: string;
  reservationRef?: string;
  currency: string;
  paymentMethod: "COD";
  lines: { itemId: string; variantKey: string; quantity: number; unitPrice: number }[];
  deliveryCharge: number;
  total: number;
  customer: { name: string; phone: string; email?: string };
  delivery: { addressLine1: string; city: string; district: string; postalCode?: string; notes?: string };
}

export interface AvailabilityLine {
  itemId: string;
  variantKey: string;
  requested: number;
  available: boolean;
  maxQuantity: number | null;
  /** Authoritative HEXALYTE price, including an active catalogue sale. */
  unitPrice: number;
  /** Regular catalogue price before a sale. Equal to unitPrice when nothing is reduced. */
  listPrice: number;
  categoryName: string | null;
}

/** Error codes documented by the ERP that the storefront reacts to. */
export const ERP_ERROR_CODES = [
  "INVALID_CREDENTIALS",
  "ECOMMERCE_NOT_ENTITLED",
  "CATALOGUE_NOT_ENABLED",
  "RESERVATIONS_NOT_ENABLED",
  "ORDERS_NOT_ENABLED",
  "PAYMENT_METHOD_NOT_ENABLED",
  "FULFILMENT_NOT_CONFIGURED",
  "VALIDATION_ERROR",
  "CURRENCY_MISMATCH",
  "PRICE_CHANGED",
  "TOTAL_MISMATCH",
  "INSUFFICIENT_STOCK",
  "ITEM_NOT_AVAILABLE",
  "ITEM_NOT_FULFILLABLE",
  "MULTI_BRANCH_ORDER_UNSUPPORTED",
  "REFERENCE_REUSED",
  "RESERVATION_NOT_FOUND",
  "RESERVATION_IN_USE",
  "RESERVATION_EXPIRED",
  "RESERVATION_MISMATCH",
  "IDEMPOTENCY_IN_PROGRESS",
  "IDEMPOTENCY_KEY_REUSED",
  "ORDER_NOT_CANCELLABLE",
  "RATE_LIMITED",
] as const;
export type ErpErrorCode = (typeof ERP_ERROR_CODES)[number];
