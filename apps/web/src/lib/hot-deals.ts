import { z } from "zod";
import type { ErpProduct } from "./erp/types";

/**
 * Admin-managed Hot Deals. Staff choose WHICH products appear, in what order and when; the website never stores a
 * price or a discount for them. Each entry is matched against the live ERP snapshot when the homepage is built, so the
 * shopper always sees the ERP price, sale price and stock.
 */

export const MAX_HOT_DEALS = 24;

/** The fields a schedule needs; a database row has more, but these decide whether a deal is live. */
export interface HotDealSchedule {
  erpItemId: string;
  sortOrder: number;
  startsAt: Date;
  endsAt: Date | null;
  active: boolean;
  createdAt?: Date;
}

const erpId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, "Choose a product from the catalogue.");
const isoDate = (label: string) => z.string().refine((s) => Number.isFinite(Date.parse(s)), `Enter a valid ${label}.`);

/** Server-side validation for creating a deal. Dates are ISO strings from the admin form. */
export const hotDealCreateSchema = z
  .object({
    erpItemId: erpId,
    startsAt: isoDate("start date").optional(),
    endsAt: z.union([isoDate("end date"), z.null()]).default(null),
    active: z.boolean().default(true),
  })
  .superRefine((v, ctx) => checkRange(v.startsAt, v.endsAt, ctx));

/** Server-side validation for editing a deal; the product itself cannot be swapped (delete and add instead). */
export const hotDealUpdateSchema = z
  .object({
    startsAt: isoDate("start date"),
    endsAt: z.union([isoDate("end date"), z.null()]),
    active: z.boolean(),
  })
  .superRefine((v, ctx) => checkRange(v.startsAt, v.endsAt, ctx));

/** New order of every deal, by id; the position in the list becomes the sort order. */
export const hotDealReorderSchema = z.object({ ids: z.array(z.string().regex(/^[a-z0-9]{8,40}$/i)).min(1).max(MAX_HOT_DEALS) });

function checkRange(startsAt: string | undefined, endsAt: string | null, ctx: z.RefinementCtx) {
  if (endsAt == null || !Number.isFinite(Date.parse(endsAt))) return;
  const start = startsAt && Number.isFinite(Date.parse(startsAt)) ? Date.parse(startsAt) : Date.now();
  if (Date.parse(endsAt) <= start) ctx.addIssue({ code: "custom", message: "The end date must be after the start date.", path: ["endsAt"] });
}

/** Active, already started and not yet ended. */
export function isLive(deal: HotDealSchedule, now: Date = new Date()): boolean {
  if (!deal.active) return false;
  if (deal.startsAt.getTime() > now.getTime()) return false;
  return deal.endsAt == null || deal.endsAt.getTime() > now.getTime();
}

/** The shopper-facing state of one entry, for the admin list. */
export type HotDealStatus = "live" | "scheduled" | "ended" | "inactive" | "missing" | "unavailable";

export function dealStatus(deal: HotDealSchedule, product: ErpProduct | undefined, now: Date = new Date()): HotDealStatus {
  if (!product) return "missing";
  if (!deal.active) return "inactive";
  if (deal.startsAt.getTime() > now.getTime()) return "scheduled";
  if (deal.endsAt != null && deal.endsAt.getTime() <= now.getTime()) return "ended";
  if (!product.available) return "unavailable";
  return "live";
}

/**
 * Live deals in staff order, as the ERP products themselves (prices untouched). Products that are no longer in the
 * catalogue or cannot be bought right now are left out, exactly like the rest of the storefront.
 */
export function resolveHotDeals(deals: HotDealSchedule[], products: Map<string, ErpProduct>, now: Date = new Date()): ErpProduct[] {
  return deals
    .filter((d) => isLive(d, now))
    .sort((a, b) => a.sortOrder - b.sortOrder || (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0))
    .map((d) => products.get(d.erpItemId))
    .filter((p): p is ErpProduct => Boolean(p && p.available));
}
