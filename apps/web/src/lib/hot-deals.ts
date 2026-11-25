import "server-only";
import { z } from "zod";
import { getDb } from "./db";
import { getErpSnapshot } from "./erp/catalogue";
import type { ErpProduct } from "./erp/types";

/** The Hot Deals settings live in one banner-table row with this placement (no schema change). */
export const HOT_PLACEMENT = "HOTDEAL";
export const MAX_HOT_PRODUCTS = 12;

export const hotDealsSchema = z.object({
  enabled: z.boolean(),
  title: z.string().trim().min(2).max(40),
  subtitle: z.string().trim().max(120),
  /** "chosen" shows the products picked below; "auto" shows every product whose ERP price is reduced. */
  mode: z.enum(["chosen", "auto"]),
  productIds: z.array(z.string().min(1).max(80)).max(MAX_HOT_PRODUCTS),
  /** ISO time the offer ends (owner-entered: the ERP has no end date), or null for no countdown. */
  endsAt: z.string().max(40).nullable(),
  label: z.string().trim().max(60),
});
export type HotDealsConfig = z.infer<typeof hotDealsSchema>;

export const DEFAULT_HOT_DEALS: HotDealsConfig = { enabled: true, title: "Hot Deals", subtitle: "", mode: "auto", productIds: [], endsAt: null, label: "Offer ends in" };

/** The saved settings, or the defaults (section on, automatic, no countdown). */
export async function getHotDealsConfig(): Promise<{ config: HotDealsConfig; saved: boolean }> {
  const db = getDb();
  if (!db) return { config: DEFAULT_HOT_DEALS, saved: false };
  const row = await db.banner.findFirst({ where: { placement: HOT_PLACEMENT }, select: { text: true } }).catch(() => null);
  if (!row?.text) return { config: DEFAULT_HOT_DEALS, saved: false };
  try {
    const parsed = hotDealsSchema.safeParse(JSON.parse(row.text));
    return parsed.success ? { config: parsed.data, saved: true } : { config: DEFAULT_HOT_DEALS, saved: false };
  } catch {
    return { config: DEFAULT_HOT_DEALS, saved: false };
  }
}

export interface ResolvedHotDeals {
  enabled: boolean;
  title: string;
  subtitle: string;
  products: ErpProduct[];
  /** Future end time as ISO, otherwise null (a time in the past is ignored). */
  endsAt: string | null;
  label: string;
}

/** What the homepage shows: the chosen in-stock products in the owner's order, or (automatic) the reduced-price ones. */
export async function resolveHotDeals(autoOffers: ErpProduct[]): Promise<ResolvedHotDeals> {
  const { config } = await getHotDealsConfig();
  let products = autoOffers.filter((p) => p.available);
  if (config.mode === "chosen") {
    try {
      const snap = await getErpSnapshot();
      products = config.productIds.map((id) => snap.products.get(id)).filter((p): p is ErpProduct => Boolean(p && p.available));
    } catch {
      products = [];
    }
  }
  const t = config.endsAt ? Date.parse(config.endsAt) : NaN;
  return {
    enabled: config.enabled,
    title: config.title,
    subtitle: config.subtitle,
    products,
    endsAt: Number.isFinite(t) && t > Date.now() ? new Date(t).toISOString() : null,
    label: config.label || "Offer ends in",
  };
}

export interface PickerProduct {
  id: string;
  name: string;
  sku: string;
  brand: string;
  price: number;
  salePrice: number | null;
  image: string | null;
  available: boolean;
}

export const toPicker = (p: ErpProduct): PickerProduct => ({
  id: p.id,
  name: p.content?.displayTitle || p.name,
  sku: p.sku ?? "",
  brand: p.brand ?? "",
  price: p.price,
  salePrice: p.salePrice ?? null,
  image: p.images[0] ?? null,
  available: p.available,
});
