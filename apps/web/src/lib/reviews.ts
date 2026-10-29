import "server-only";
import { z } from "zod";
import { getDb } from "./db";

/**
 * Customer product reviews. Shoppers write them on the product page; nothing is public until staff approve it in the
 * admin (Catalog, Product Reviews). Everything here reads approved reviews only and never throws, so a database
 * problem can hide reviews but never break a page.
 */

export const reviewInput = z.object({
  productId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().max(80).optional().transform((v) => v || undefined),
  body: z.string().trim().min(10, "Please write at least a sentence (10 characters).").max(2000),
  name: z.string().trim().min(2, "Please enter your name.").max(60),
  /** Spam trap: a hidden field people leave empty. */
  company: z.string().max(200).optional(),
});
export type ReviewInput = z.infer<typeof reviewInput>;

export interface PublicReview {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  name: string;
  verified: boolean;
  createdAt: string;
}

export interface RatingSummary {
  average: number;
  count: number;
  /** How many reviews gave 5, 4, 3, 2 and 1 stars (index 0 = 5 stars). */
  stars: [number, number, number, number, number];
}

export type CardRating = { average: number; count: number };

/** Shown as the reviewer's name: first name and the initial of the last, so full names are not published. */
export function displayName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.` : parts[0];
}

/** Approved reviews of one product (newest first, up to `limit`) with the rating summary; null summary when none. */
export async function productReviews(erpItemId: string, limit = 20): Promise<{ summary: RatingSummary | null; reviews: PublicReview[] }> {
  const db = getDb();
  if (!db) return { summary: null, reviews: [] };
  try {
    const where = { erpItemId, status: "APPROVED" as const };
    const [groups, rows] = await Promise.all([
      db.productReview.groupBy({ by: ["rating"], where, _count: { _all: true } }),
      db.productReview.findMany({ where, orderBy: { createdAt: "desc" }, take: limit }),
    ]);
    const stars: RatingSummary["stars"] = [0, 0, 0, 0, 0];
    let sum = 0;
    let count = 0;
    for (const g of groups) {
      stars[5 - g.rating] = g._count._all;
      sum += g.rating * g._count._all;
      count += g._count._all;
    }
    return {
      summary: count ? { average: Math.round((sum / count) * 10) / 10, count, stars } : null,
      reviews: rows.map((r) => ({ id: r.id, rating: r.rating, title: r.title, body: r.body, name: displayName(r.name), verified: r.verified, createdAt: r.createdAt.toISOString() })),
    };
  } catch {
    return { summary: null, reviews: [] };
  }
}

const TTL_MS = 60_000;
const g = globalThis as unknown as { __voltaRatings?: { at: number; map: Map<string, CardRating> } };

/** Average and count of approved reviews per product, for the stars on product cards. Cached for a minute. */
export async function cardRatings(): Promise<Map<string, CardRating>> {
  const cur = g.__voltaRatings;
  if (cur && Date.now() - cur.at < TTL_MS) return cur.map;
  const db = getDb();
  let map = new Map<string, CardRating>();
  if (db) {
    const rows = await db.productReview
      .groupBy({ by: ["erpItemId"], where: { status: "APPROVED" }, _avg: { rating: true }, _count: { _all: true } })
      .catch(() => null);
    if (rows) map = new Map(rows.map((r) => [r.erpItemId, { average: Math.round((r._avg.rating ?? 0) * 10) / 10, count: r._count._all }]));
  }
  g.__voltaRatings = { at: Date.now(), map };
  return map;
}

/** Drop the card cache (after staff approve, reject or delete a review). */
export function clearRatingsCache() {
  g.__voltaRatings = undefined;
}

/** The best recent approved reviews (4 or 5 stars, with real text) for the homepage when the owner set none. */
export async function featuredReviews(limit = 6): Promise<{ name: string; rating: number; text: string; source?: string; date?: string }[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db.productReview
    .findMany({ where: { status: "APPROVED", rating: { gte: 4 } }, orderBy: [{ rating: "desc" }, { createdAt: "desc" }], take: limit })
    .catch(() => []);
  return rows
    .filter((r) => r.body.length >= 20)
    .map((r) => ({
      name: displayName(r.name),
      rating: r.rating,
      text: r.body.length > 220 ? `${r.body.slice(0, 217).trimEnd()}…` : r.body,
      source: r.verified ? "VOLTA.LK · Verified buyer" : "VOLTA.LK",
      date: r.createdAt.toLocaleDateString("en-LK", { month: "short", year: "numeric" }),
    }));
}

/** True when this customer has a website order (not cancelled) containing the product. */
export async function boughtBy(customerId: string, erpItemId: string): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const rows = await db.webOrder
    .findMany({ where: { customerId, NOT: { erpStatus: "CANCELLED" } }, select: { items: true }, take: 200 })
    .catch(() => []);
  return rows.some((r) => (Array.isArray(r.items) ? r.items : []).some((l) => (l as { itemId?: unknown })?.itemId === erpItemId));
}
