/** Hot Deals scheduling, validation and matching against the ERP snapshot (pure functions, no database). */
import { describe, expect, it } from "vitest";
import type { ErpProduct } from "@/lib/erp/types";
import { dealStatus, hotDealCreateSchema, hotDealReorderSchema, hotDealUpdateSchema, isLive, resolveHotDeals, type HotDealSchedule } from "@/lib/hot-deals";

const now = new Date("2026-10-24T12:00:00Z");
const at = (iso: string) => new Date(iso);
const product = (id: string, over: Partial<ErpProduct> = {}): ErpProduct => ({
  id, slug: id, name: `Product ${id}`, description: "", images: [], price: 1000, salePrice: null, specs: {}, variants: [], hasVariants: false,
  available: true, purchasableQuantity: 3, publishedAt: null, updatedAt: "2026-01-01", ...over,
});
const deal = (erpItemId: string, over: Partial<HotDealSchedule> = {}): HotDealSchedule => ({
  erpItemId, sortOrder: 0, startsAt: at("2026-10-01T00:00:00Z"), endsAt: null, active: true, ...over,
});

describe("isLive", () => {
  it("is live once started, while active and before the end", () => {
    expect(isLive(deal("a"), now)).toBe(true);
    expect(isLive(deal("a", { endsAt: at("2026-10-30T00:00:00Z") }), now)).toBe(true);
  });
  it("is not live when switched off, not yet started, or ended (the end instant is exclusive)", () => {
    expect(isLive(deal("a", { active: false }), now)).toBe(false);
    expect(isLive(deal("a", { startsAt: at("2026-10-25T00:00:00Z") }), now)).toBe(false);
    expect(isLive(deal("a", { endsAt: at("2026-10-20T00:00:00Z") }), now)).toBe(false);
    expect(isLive(deal("a", { endsAt: now }), now)).toBe(false);
  });
});

describe("resolveHotDeals", () => {
  const products = new Map([
    ["a", product("a", { price: 5000, salePrice: 4500 })],
    ["b", product("b")],
    ["sold", product("sold", { available: false, purchasableQuantity: 0 })],
  ]);

  it("returns live deals in staff order, ties broken by creation time", () => {
    const deals = [
      deal("b", { sortOrder: 1 }),
      deal("a", { sortOrder: 0, createdAt: at("2026-10-02T00:00:00Z") }),
    ];
    expect(resolveHotDeals(deals, products, now).map((p) => p.id)).toEqual(["a", "b"]);
    const tie = [deal("b", { createdAt: at("2026-10-03T00:00:00Z") }), deal("a", { createdAt: at("2026-10-02T00:00:00Z") })];
    expect(resolveHotDeals(tie, products, now).map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("drops products missing from the ERP and products that cannot be bought", () => {
    const out = resolveHotDeals([deal("gone"), deal("sold"), deal("b")], products, now);
    expect(out.map((p) => p.id)).toEqual(["b"]);
  });

  it("drops deals that are off, scheduled for later or ended", () => {
    const out = resolveHotDeals(
      [deal("a", { active: false }), deal("b", { startsAt: at("2026-11-01T00:00:00Z") }), deal("a", { endsAt: at("2026-10-10T00:00:00Z") })],
      products,
      now,
    );
    expect(out).toEqual([]);
  });

  it("returns the ERP product objects untouched: no price, sale price or stock is changed", () => {
    const [a] = resolveHotDeals([deal("a")], products, now);
    expect(a).toBe(products.get("a"));
    expect(a.price).toBe(5000);
    expect(a.salePrice).toBe(4500);
  });
});

describe("dealStatus", () => {
  it("explains why a deal is or is not on the homepage", () => {
    const p = product("a");
    expect(dealStatus(deal("a"), p, now)).toBe("live");
    expect(dealStatus(deal("a"), undefined, now)).toBe("missing");
    expect(dealStatus(deal("a", { active: false }), p, now)).toBe("inactive");
    expect(dealStatus(deal("a", { startsAt: at("2026-12-01T00:00:00Z") }), p, now)).toBe("scheduled");
    expect(dealStatus(deal("a", { endsAt: at("2026-10-02T00:00:00Z") }), p, now)).toBe("ended");
    expect(dealStatus(deal("a"), product("a", { available: false }), now)).toBe("unavailable");
  });
});

describe("validation", () => {
  it("accepts a product id with optional dates", () => {
    expect(hotDealCreateSchema.safeParse({ erpItemId: "cm0item00000003" }).success).toBe(true);
    expect(hotDealCreateSchema.safeParse({ erpItemId: "p1", startsAt: "2026-10-01T00:00:00Z", endsAt: "2026-10-31T00:00:00Z" }).success).toBe(true);
  });
  it("rejects bad ids, unreadable dates and end dates that are not after the start", () => {
    expect(hotDealCreateSchema.safeParse({ erpItemId: "bad id!" }).success).toBe(false);
    expect(hotDealCreateSchema.safeParse({ erpItemId: "p1", startsAt: "not a date" }).success).toBe(false);
    const backwards = hotDealUpdateSchema.safeParse({ startsAt: "2026-10-31T00:00:00Z", endsAt: "2026-10-01T00:00:00Z", active: true });
    expect(backwards.success).toBe(false);
    expect(backwards.error?.issues[0]?.message).toMatch(/end date must be after/);
    expect(hotDealUpdateSchema.safeParse({ startsAt: "2026-10-01T00:00:00Z", endsAt: "2026-10-01T00:00:00Z", active: true }).success).toBe(false);
  });
  it("ignores any price or discount sent by the client", () => {
    const parsed = hotDealCreateSchema.parse({ erpItemId: "p1", price: 1, salePrice: 0, discount: 99 } as unknown);
    expect(parsed).not.toHaveProperty("price");
    expect(parsed).not.toHaveProperty("salePrice");
    expect(parsed).not.toHaveProperty("discount");
  });
  it("reorder needs a non-empty list of ids", () => {
    expect(hotDealReorderSchema.safeParse({ ids: [] }).success).toBe(false);
    expect(hotDealReorderSchema.safeParse({ ids: ["abc12345xyz"] }).success).toBe(true);
  });
});
