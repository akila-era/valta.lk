import { describe, expect, it } from "vitest";
import {
  clicksByPlacement,
  confirmedOrderVisits,
  conversionRate,
  funnel,
  productFunnel,
  rate,
  retentionCutoff,
  revenueSummary,
  type FunnelEvent,
  type OrderRow,
} from "../../src/lib/analytics/metrics";
import { needsStatusRefresh } from "../../src/lib/orders/web-orders";

const ev = (type: FunnelEvent["type"], visitId: string, extra: Partial<FunnelEvent> = {}): FunnelEvent => ({ type, visitId, ...extra });
const order = (o: Partial<OrderRow> & { externalRef: string }): OrderRow => ({
  total: 1000,
  syncStatus: "SYNCED",
  erpStatus: "PLACED",
  erpPaymentStatus: "COD_PENDING",
  erpStatusAt: new Date("2026-10-24T10:00:00Z"),
  ...o,
});

describe("rate", () => {
  it("is unset rather than 0 when there is nothing to divide by", () => {
    expect(rate(0, 0)).toBeNull();
    expect(rate(3, 0)).toBeNull();
    expect(rate(1, 4)).toBe(0.25);
    expect(conversionRate(0, 0)).toBeNull();
  });
});

describe("funnel", () => {
  it("counts each visit once per stage, however many events it sent", () => {
    const events = [
      ev("PRODUCT_VIEW", "a"), ev("PRODUCT_VIEW", "a"), ev("ADD_TO_CART", "a"), ev("CHECKOUT_START", "a"),
      ev("PRODUCT_VIEW", "b"), ev("ADD_TO_CART", "b"),
      ev("PRODUCT_VIEW", "c"),
      ev("PRODUCT_CLICK", "d"),
    ];
    const f = funnel(events, new Set(["a"]));
    expect(f.visits).toBe(4);
    expect(f.steps.map((s) => [s.stage, s.visits])).toEqual([
      ["PRODUCT_VIEW", 3],
      ["ADD_TO_CART", 2],
      ["CHECKOUT_START", 1],
      ["ORDER_PLACED", 1],
    ]);
    expect(f.steps[0].fromPrevious).toBeNull();
    expect(f.steps[1].fromPrevious).toBeCloseTo(2 / 3);
    expect(f.steps[3].ofVisits).toBe(0.25);
  });

  it("never counts an order-placed event by itself: only visits in the confirmed set reach the last stage", () => {
    const f = funnel([ev("CHECKOUT_START", "a"), ev("ORDER_PLACED", "a", { externalRef: "VL-1" })]);
    expect(f.steps.find((s) => s.stage === "ORDER_PLACED")!.visits).toBe(0);
  });

  it("ignores confirmed visits that sent no event in the period", () => {
    const f = funnel([ev("PRODUCT_VIEW", "a")], new Set(["zzz"]));
    expect(f.steps.find((s) => s.stage === "ORDER_PLACED")!.visits).toBe(0);
  });

  it("is empty but well-formed with no events", () => {
    const f = funnel([]);
    expect(f.visits).toBe(0);
    expect(f.steps.every((s) => s.visits === 0 && s.ofVisits === null)).toBe(true);
  });
});

describe("confirmedOrderVisits", () => {
  const orders = [order({ externalRef: "VL-1" }), order({ externalRef: "VL-2", erpStatus: "CANCELLED" })];

  it("counts an order only when it exists as a website order and is not cancelled", () => {
    const r = confirmedOrderVisits(
      [ev("ORDER_PLACED", "a", { externalRef: "VL-1" }), ev("ORDER_PLACED", "b", { externalRef: "VL-2" }), ev("ORDER_PLACED", "c", { externalRef: "VL-404" })],
      orders,
    );
    expect([...r.refs]).toEqual(["VL-1"]);
    expect([...r.visits]).toEqual(["a"]);
  });

  it("counts each reference once and credits the first visit that reported it", () => {
    const r = confirmedOrderVisits([ev("ORDER_PLACED", "a", { externalRef: "VL-1" }), ev("ORDER_PLACED", "b", { externalRef: "VL-1" })], orders);
    expect(r.refs.size).toBe(1);
    expect([...r.visits]).toEqual(["a"]);
  });

  it("ignores events without a reference and other event types carrying one", () => {
    const r = confirmedOrderVisits([ev("ORDER_PLACED", "a"), ev("CHECKOUT_START", "b", { externalRef: "VL-1" })], orders);
    expect(r.refs.size).toBe(0);
  });
});

describe("productFunnel", () => {
  it("counts distinct visits per product and the add rate among viewers", () => {
    const rows = productFunnel([
      ev("PRODUCT_VIEW", "a", { erpItemId: "p1" }), ev("PRODUCT_VIEW", "a", { erpItemId: "p1" }), ev("ADD_TO_CART", "a", { erpItemId: "p1" }),
      ev("PRODUCT_VIEW", "b", { erpItemId: "p1" }),
      ev("ADD_TO_CART", "c", { erpItemId: "p1" }), // added without a recorded view (e.g. from a card): an add, not a view-to-add
      ev("PRODUCT_CLICK", "a", { erpItemId: "p2" }),
      ev("CHECKOUT_START", "a"),
    ]);
    expect(rows[0]).toEqual({ erpItemId: "p1", views: 2, clicks: 0, adds: 2, addRate: 0.5 });
    expect(rows[1]).toEqual({ erpItemId: "p2", views: 0, clicks: 1, adds: 0, addRate: null });
  });
});

describe("clicksByPlacement", () => {
  it("counts distinct visit and product per placement, and names missing placements", () => {
    expect(
      clicksByPlacement([
        ev("PRODUCT_CLICK", "a", { erpItemId: "p1", placement: "home-arrivals" }),
        ev("PRODUCT_CLICK", "a", { erpItemId: "p1", placement: "home-arrivals" }),
        ev("PRODUCT_CLICK", "b", { erpItemId: "p1", placement: "home-arrivals" }),
        ev("PRODUCT_CLICK", "a", { erpItemId: "p2" }),
        ev("PRODUCT_VIEW", "a", { erpItemId: "p1", placement: "home-arrivals" }),
      ]),
    ).toEqual([
      { placement: "home-arrivals", clicks: 2 },
      { placement: "unknown", clicks: 1 },
    ]);
  });
});

describe("revenueSummary", () => {
  it("uses website orders only, in cents, and separates collected cash from order value", () => {
    const s = revenueSummary([
      order({ externalRef: "1", total: 0.1 }),
      order({ externalRef: "2", total: 0.2, erpStatus: "DELIVERED", erpPaymentStatus: "COD_COLLECTED" }),
      order({ externalRef: "3", total: 5000, erpStatus: "CANCELLED" }),
      order({ externalRef: "4", total: 7000, syncStatus: "FAILED", erpStatus: null, erpPaymentStatus: null, erpStatusAt: null }),
      order({ externalRef: "5", total: 300, syncStatus: "PENDING", erpStatus: null, erpPaymentStatus: null, erpStatusAt: null }),
    ]);
    expect(s.orders).toBe(3);
    expect(s.placedValue).toBe(300.3); // 0.1 + 0.2 + 300 without floating-point drift
    expect(s.collectedOrders).toBe(1);
    expect(s.collectedValue).toBe(0.2);
    expect(s.outstandingValue).toBe(300.1);
    expect(s.cancelledOrders).toBe(1);
    expect(s.failedOrders).toBe(1);
  });

  it("reports how old the oldest in-progress cached status is, and never-refreshed as the epoch", () => {
    const older = new Date("2026-10-01T00:00:00Z");
    expect(revenueSummary([order({ externalRef: "1" }), order({ externalRef: "2", erpStatusAt: older })]).oldestStatusAt).toEqual(older);
    expect(revenueSummary([order({ externalRef: "1", erpStatusAt: null })]).oldestStatusAt).toEqual(new Date(0));
    expect(revenueSummary([order({ externalRef: "1", erpPaymentStatus: "COD_COLLECTED" })]).oldestStatusAt).toBeNull();
    expect(revenueSummary([]).oldestStatusAt).toBeNull();
  });
});

describe("retentionCutoff", () => {
  it("is 13 calendar months earlier", () => {
    expect(retentionCutoff(new Date("2026-10-24T08:30:00Z"))).toEqual(new Date("2025-09-24T08:30:00Z"));
  });

  it("clamps to the end of a shorter month instead of rolling over", () => {
    expect(retentionCutoff(new Date("2026-03-31T00:00:00Z"), 1)).toEqual(new Date("2026-02-28T00:00:00Z"));
    expect(retentionCutoff(new Date("2025-03-29T00:00:00Z"), 13)).toEqual(new Date("2024-02-29T00:00:00Z"));
  });
});

describe("needsStatusRefresh", () => {
  const now = new Date("2026-10-24T12:00:00Z");
  const old = new Date("2026-10-24T11:00:00Z");
  const fresh = new Date("2026-10-24T11:58:00Z");
  const row = (r: Partial<Parameters<typeof needsStatusRefresh>[0]>) =>
    needsStatusRefresh({ syncStatus: "SYNCED", erpStatus: "PLACED", erpPaymentStatus: "COD_PENDING", erpStatusAt: old, ...r }, now, 10 * 60_000);

  it("refreshes in-progress synced orders whose cached status is old or missing", () => {
    expect(row({})).toBe(true);
    expect(row({ erpStatus: "DISPATCHED" })).toBe(true);
    expect(row({ erpStatus: null, erpPaymentStatus: null, erpStatusAt: null })).toBe(true);
    expect(row({ erpStatus: "DELIVERED", erpPaymentStatus: "COD_PENDING" })).toBe(true); // cash not recorded yet
  });

  it("skips finished, recently refreshed and not-yet-synced orders", () => {
    expect(row({ erpStatus: "CANCELLED" })).toBe(false);
    expect(row({ erpStatus: "DELIVERED", erpPaymentStatus: "COD_COLLECTED" })).toBe(false);
    expect(row({ erpStatusAt: fresh })).toBe(false);
    expect(row({ syncStatus: "PENDING" })).toBe(false);
    expect(row({ syncStatus: "FAILED" })).toBe(false);
  });
});
