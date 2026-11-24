import { describe, expect, it } from "vitest";
import { funnelData, funnelSteps, PLACEMENTS, percent, rangeDays, sampleFunnel } from "../../src/lib/analytics/view";

const NOW = new Date("2026-10-24T06:00:00Z");

describe("funnelSteps", () => {
  it("keeps the order Visits → Product views → Add to cart → Checkout → Orders with shares of visits and of the previous step", () => {
    const s = funnelSteps({ visits: 200, productViews: 100, addToCart: 20, checkoutStarts: 10, orders: 5 });
    expect(s.map((x) => x.label)).toEqual(["Visits", "Product views", "Add to cart", "Checkout", "Orders"]);
    expect(s[0]).toMatchObject({ ofVisits: 1, fromPrevious: null });
    expect(s[2]).toMatchObject({ ofVisits: 0.1, fromPrevious: 0.2 });
    expect(s[4]).toMatchObject({ ofVisits: 0.025, fromPrevious: 0.5 });
  });

  it("never divides by zero: empty steps have unset shares", () => {
    const s = funnelSteps({ visits: 0, productViews: 0, addToCart: 0, checkoutStarts: 0, orders: 0 });
    expect(s.every((x) => x.ofVisits === null)).toBe(true);
    expect(s.slice(1).every((x) => x.fromPrevious === null)).toBe(true);
  });
});

describe("percent", () => {
  it("formats rates and shows a dash when there is no rate", () => {
    expect(percent(0.1234)).toBe("12.3%");
    expect(percent(0.5, 0)).toBe("50%");
    expect(percent(null)).toBe("—");
  });
});

describe("rangeDays", () => {
  it("lists the days of the range oldest first, ending today in Sri Lanka time", () => {
    const days = rangeDays(7, NOW);
    expect(days).toHaveLength(7);
    expect(days[6]).toBe("2026-10-24");
    expect(days[0]).toBe("2026-10-18");
    // 20:00 UTC is already the next day in Colombo (UTC+5:30)
    expect(rangeDays(1, new Date("2026-10-24T20:00:00Z"))).toEqual(["2026-10-25"]);
  });
});

describe("funnelData", () => {
  it("has nothing to draw unless there is preview or live data", () => {
    expect(funnelData({ kind: "not-collecting" })).toBeNull();
    expect(funnelData({ kind: "error" })).toBeNull();
    const data = sampleFunnel(7, NOW);
    expect(funnelData({ kind: "preview", data })).toBe(data);
  });
});

describe("sampleFunnel (layout preview only)", () => {
  it("is deterministic and covers every day of the range", () => {
    expect(sampleFunnel(30, NOW)).toEqual(sampleFunnel(30, NOW));
    expect(sampleFunnel(90, NOW).daily).toHaveLength(90);
  });

  it("is visibly synthetic: products are named as samples, never real catalogue items", () => {
    expect(sampleFunnel(30, NOW).products.every((p) => /^Sample product \d+$/.test(p.name))).toBe(true);
  });

  it("is internally consistent: totals match the days and each step is no larger than the one before", () => {
    const d = sampleFunnel(30, NOW);
    expect(d.visits).toBe(d.daily.reduce((n, x) => n + x.visits, 0));
    expect(d.orders).toBe(d.daily.reduce((n, x) => n + x.orders, 0));
    const steps = funnelSteps(d).map((s) => s.value);
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeLessThanOrEqual(steps[i - 1]);
  });

  it("uses the five placements in the agreed order", () => {
    expect(sampleFunnel(7, NOW).placements.map((p) => p.label)).toEqual(PLACEMENTS.map((p) => p.label));
    expect(PLACEMENTS.map((p) => p.label)).toEqual(["Categories", "Deals", "Arrivals", "Search", "Related Products"]);
  });
});
