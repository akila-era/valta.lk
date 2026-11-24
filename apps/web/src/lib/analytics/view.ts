/**
 * Presentation model for the admin Conversion Analytics page. The page renders only from these shapes, so the
 * storefront event backend can fill them later without changing the UI.
 *
 * Funnel data (visits, views, adds, checkouts, orders per visit) does not exist yet: event collection is not switched
 * on. Until it is, the page shows `not-collecting`. `preview` is an opt-in layout preview filled with obviously
 * synthetic sample values ("Sample product 1"); it is labelled as such everywhere it appears and is never used for
 * money, which always comes from real website orders.
 */
import { rate } from "./metrics";

/** Where a product click happened, in the order the comparison shows them. Keys match the planned event `placement`. */
export const PLACEMENTS = [
  { key: "home-categories", label: "Categories" },
  { key: "home-deals", label: "Deals" },
  { key: "home-arrivals", label: "Arrivals" },
  { key: "search", label: "Search" },
  { key: "related", label: "Related Products" },
] as const;

export interface FunnelDay {
  /** YYYY-MM-DD in Sri Lanka time. */
  day: string;
  visits: number;
  views: number;
  adds: number;
  checkouts: number;
  orders: number;
}

export interface ProductRow {
  name: string;
  views: number;
  clicks: number;
  adds: number;
  /** Visits that added the product out of visits that viewed it; null when nobody viewed it. */
  addRate: number | null;
}

export interface FunnelData {
  visits: number;
  productViews: number;
  addToCart: number;
  checkoutStarts: number;
  /** Visits with a confirmed website order (never counted from browser events alone). */
  orders: number;
  daily: FunnelDay[];
  products: ProductRow[];
  placements: { key: string; label: string; clicks: number }[];
}

export type FunnelState = { kind: "not-collecting" } | { kind: "error" } | { kind: "preview"; data: FunnelData } | { kind: "live"; data: FunnelData };

/** The numbers to draw, or null when there are none (not collecting yet, or the events could not be loaded). */
export const funnelData = (s: FunnelState): FunnelData | null => (s.kind === "preview" || s.kind === "live" ? s.data : null);

export interface FunnelStep {
  label: string;
  value: number;
  /** Share of all visits. */
  ofVisits: number | null;
  /** Share of the previous step (null for the first). */
  fromPrevious: number | null;
}

/** Visits → Product views → Add to cart → Checkout → Orders, with the share kept at each step. */
export function funnelSteps(d: Pick<FunnelData, "visits" | "productViews" | "addToCart" | "checkoutStarts" | "orders">): FunnelStep[] {
  const raw = [
    { label: "Visits", value: d.visits },
    { label: "Product views", value: d.productViews },
    { label: "Add to cart", value: d.addToCart },
    { label: "Checkout", value: d.checkoutStarts },
    { label: "Orders", value: d.orders },
  ];
  return raw.map((s, i) => ({ ...s, ofVisits: rate(s.value, d.visits), fromPrevious: i === 0 ? null : rate(s.value, raw[i - 1].value) }));
}

/** "12.3%", or "—" when there is nothing to divide by. */
export const percent = (r: number | null, digits = 1) => (r == null ? "—" : `${(r * 100).toFixed(digits)}%`);

/** The `range` days ending today, oldest first, as YYYY-MM-DD in Sri Lanka time. */
export function rangeDays(range: number, now: Date): string[] {
  return Array.from({ length: range }, (_, i) => new Date(now.getTime() - (range - 1 - i) * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Colombo" }));
}

export const shortDay = (key: string) => new Date(`${key}T12:00:00Z`).toLocaleDateString("en-LK", { month: "short", day: "numeric", timeZone: "UTC" });

/**
 * Synthetic numbers for the layout preview. Deterministic (the same range always draws the same shapes) and visibly
 * fake: products are named "Sample product N". Never shown unless the admin asks for the preview.
 */
export function sampleFunnel(range: number, now: Date): FunnelData {
  const days = rangeDays(range, now);
  // A gentle wave so the trend chart has shape; values are illustrative only.
  const daily = days.map((day, i) => {
    const visits = 120 + Math.round(40 * Math.sin(i / 2.3) + 20 * Math.cos(i / 5.1));
    const views = Math.round(visits * 0.62);
    const adds = Math.round(views * 0.18);
    const checkouts = Math.round(adds * 0.55);
    const orders = Math.round(checkouts * 0.6);
    return { day, visits, views, adds, checkouts, orders };
  });
  const sum = (k: keyof Omit<FunnelDay, "day">) => daily.reduce((n, d) => n + d[k], 0);
  const products = [0.34, 0.24, 0.17, 0.11, 0.08, 0.06].map((share, i) => {
    const views = Math.round(sum("views") * share);
    const adds = Math.round(views * [0.21, 0.16, 0.24, 0.09, 0.13, 0.05][i]);
    return { name: `Sample product ${i + 1}`, views, clicks: Math.round(views * 0.7), adds, addRate: rate(adds, views) };
  });
  const placements = PLACEMENTS.map((p, i) => ({ key: p.key, label: p.label, clicks: Math.round(sum("views") * [0.22, 0.14, 0.26, 0.19, 0.08][i]) }));
  return { visits: sum("visits"), productViews: sum("views"), addToCart: sum("adds"), checkoutStarts: sum("checkouts"), orders: sum("orders"), daily, products, placements };
}
