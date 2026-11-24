/**
 * Pure analytics calculations for the admin reports. No database or ERP access here: callers pass in rows.
 *
 * Two kinds of input, never mixed up:
 * - Funnel events (browser signals: views, clicks, adds, checkout starts, order-placed markers). They describe shopping
 *   behaviour only and are never counted as sales.
 * - Website orders (`WebOrder` rows). The only source for order counts and money; their status and COD payment status
 *   are the cached copy of the ERP, which stays authoritative.
 * Rates are null when their denominator is 0, so an empty period never shows as 0 %.
 */

export const FUNNEL_STAGES = ["PRODUCT_VIEW", "ADD_TO_CART", "CHECKOUT_START", "ORDER_PLACED"] as const;
export type FunnelStage = (typeof FUNNEL_STAGES)[number];
export const EVENT_TYPES = ["PRODUCT_VIEW", "PRODUCT_CLICK", "ADD_TO_CART", "CHECKOUT_START", "ORDER_PLACED"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export interface FunnelEvent {
  type: EventType;
  visitId: string;
  erpItemId?: string | null;
  placement?: string | null;
  externalRef?: string | null;
}

/** The fields of a `WebOrder` the reports need. */
export interface OrderRow {
  externalRef: string;
  total: number;
  syncStatus: "PENDING" | "SYNCED" | "FAILED";
  erpStatus: string | null;
  erpPaymentStatus: string | null;
  erpStatusAt: Date | null;
}

export const rate = (part: number, whole: number): number | null => (whole > 0 && Number.isFinite(part) ? part / whole : null);

const cents = (n: number) => Math.round(n * 100);
const fromCents = (c: number) => c / 100;

export interface FunnelStep {
  stage: FunnelStage;
  visits: number;
  /** Share of all visits that reached this stage. */
  ofVisits: number | null;
  /** Share of the previous stage's visits that also reached this one (null for the first stage). */
  fromPrevious: number | null;
}

/**
 * Visit-based funnel: a visit counts once per stage however many events it sent. A visit is counted at a stage only
 * if it reached that stage, so a visit that ordered without a recorded product view (e.g. an old cart) still counts
 * as an order. `ordered` must already be limited to real orders (see `confirmedOrderVisits`).
 */
export function funnel(events: FunnelEvent[], ordered: Set<string> = new Set()): { visits: number; steps: FunnelStep[] } {
  const visits = new Set<string>();
  const reached = new Map<FunnelStage, Set<string>>(FUNNEL_STAGES.map((s) => [s, new Set<string>()]));
  for (const e of events) {
    if (!e.visitId) continue;
    visits.add(e.visitId);
    if (e.type !== "ORDER_PLACED" && e.type !== "PRODUCT_CLICK") reached.get(e.type)!.add(e.visitId);
  }
  for (const v of ordered) if (visits.has(v)) reached.get("ORDER_PLACED")!.add(v);
  const steps = FUNNEL_STAGES.map((stage, i) => {
    const n = reached.get(stage)!.size;
    const prev = i === 0 ? null : reached.get(FUNNEL_STAGES[i - 1])!.size;
    return { stage, visits: n, ofVisits: rate(n, visits.size), fromPrevious: prev == null ? null : rate(n, prev) };
  });
  return { visits: visits.size, steps };
}

/**
 * Joins order-placed events to website orders. An event counts only when its reference is a `WebOrder` that still
 * exists (orders the ERP rejected at checkout are deleted) and is not cancelled in the ERP. Each reference counts once,
 * whatever the number of events, and is credited to the first visit that reported it.
 */
export function confirmedOrderVisits(events: FunnelEvent[], orders: Pick<OrderRow, "externalRef" | "erpStatus">[]): { visits: Set<string>; refs: Set<string> } {
  const live = new Set(orders.filter((o) => o.erpStatus !== "CANCELLED").map((o) => o.externalRef));
  const refs = new Set<string>();
  const visits = new Set<string>();
  for (const e of events) {
    if (e.type !== "ORDER_PLACED" || !e.externalRef || !e.visitId) continue;
    if (!live.has(e.externalRef) || refs.has(e.externalRef)) continue;
    refs.add(e.externalRef);
    visits.add(e.visitId);
  }
  return { visits, refs };
}

export interface ProductFunnelRow {
  erpItemId: string;
  views: number;
  clicks: number;
  adds: number;
  /** Visits that added the product, out of visits that viewed it. */
  addRate: number | null;
}

/** Per-product views, clicks and adds, counted by distinct visits. Sorted by views, then adds. */
export function productFunnel(events: FunnelEvent[]): ProductFunnelRow[] {
  const by = new Map<string, { views: Set<string>; clicks: Set<string>; adds: Set<string> }>();
  for (const e of events) {
    if (!e.erpItemId || !e.visitId) continue;
    const key = e.type === "PRODUCT_VIEW" ? "views" : e.type === "PRODUCT_CLICK" ? "clicks" : e.type === "ADD_TO_CART" ? "adds" : null;
    if (!key) continue;
    const row = by.get(e.erpItemId) ?? { views: new Set<string>(), clicks: new Set<string>(), adds: new Set<string>() };
    row[key].add(e.visitId);
    by.set(e.erpItemId, row);
  }
  return [...by]
    .map(([erpItemId, r]) => {
      const addedAfterView = [...r.adds].filter((v) => r.views.has(v)).length;
      return { erpItemId, views: r.views.size, clicks: r.clicks.size, adds: r.adds.size, addRate: rate(addedAfterView, r.views.size) };
    })
    .sort((a, b) => b.views - a.views || b.adds - a.adds || a.erpItemId.localeCompare(b.erpItemId));
}

/** Product clicks per page placement (e.g. "home-arrivals"), counted by distinct visit and product. */
export function clicksByPlacement(events: FunnelEvent[]): { placement: string; clicks: number }[] {
  const by = new Map<string, Set<string>>();
  for (const e of events) {
    if (e.type !== "PRODUCT_CLICK" || !e.visitId) continue;
    const p = e.placement || "unknown";
    const set = by.get(p) ?? new Set<string>();
    set.add(`${e.visitId}::${e.erpItemId ?? ""}`);
    by.set(p, set);
  }
  return [...by].map(([placement, s]) => ({ placement, clicks: s.size })).sort((a, b) => b.clicks - a.clicks || a.placement.localeCompare(b.placement));
}

export interface RevenueSummary {
  /** Orders not cancelled in the ERP (includes orders still waiting to reach it). */
  orders: number;
  /** Total of those orders as charged: order value, not cash received. */
  placedValue: number;
  /** Orders whose cached ERP payment status is COD_COLLECTED, and their total. */
  collectedOrders: number;
  collectedValue: number;
  /** Placed but not yet collected. */
  outstandingValue: number;
  cancelledOrders: number;
  /** Orders that never reached the ERP and need a person (sync FAILED). Excluded from every value above. */
  failedOrders: number;
  /** Oldest cached ERP status among in-progress orders: how stale "collected" may be. Null when none are in progress. */
  oldestStatusAt: Date | null;
}

/**
 * Money from website orders only. Values are summed in integer cents. FAILED orders never reached the ERP, so they are
 * not sales; cancelled orders are counted separately and add no value.
 */
export function revenueSummary(orders: OrderRow[]): RevenueSummary {
  let placed = 0;
  let collected = 0;
  let count = 0;
  let collectedCount = 0;
  let cancelled = 0;
  let failed = 0;
  let oldest: Date | null = null;
  for (const o of orders) {
    if (o.syncStatus === "FAILED") {
      failed++;
      continue;
    }
    if (o.erpStatus === "CANCELLED") {
      cancelled++;
      continue;
    }
    count++;
    placed += cents(o.total);
    if (o.erpPaymentStatus === "COD_COLLECTED") {
      collectedCount++;
      collected += cents(o.total);
    } else if (o.syncStatus === "SYNCED") {
      const at = o.erpStatusAt;
      if (!at) oldest = new Date(0);
      else if (!oldest || at < oldest) oldest = at;
    }
  }
  return {
    orders: count,
    placedValue: fromCents(placed),
    collectedOrders: collectedCount,
    collectedValue: fromCents(collected),
    outstandingValue: fromCents(placed - collected),
    cancelledOrders: cancelled,
    failedOrders: failed,
    oldestStatusAt: oldest,
  };
}

/** Visit conversion: visits with a confirmed order out of all visits. */
export const conversionRate = (orderVisits: number, visits: number) => rate(orderVisits, visits);

/** Funnel events are kept for 13 months. Rows created before the returned instant are past retention. */
export const RETENTION_MONTHS = 13;
export function retentionCutoff(now: Date, months = RETENTION_MONTHS): Date {
  const d = new Date(now.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - months);
  // Clamp to the last day of the target month (e.g. 31 March minus one month is 28/29 February, not 2/3 March).
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}
