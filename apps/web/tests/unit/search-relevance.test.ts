import { describe, expect, it } from "vitest";
import { queryProducts } from "@/lib/erp/query";
import type { ErpProduct } from "@/lib/erp/types";

const p = (id: string, name: string, extra: Partial<ErpProduct> = {}) =>
  ({ id, slug: id, name, sku: id, brand: "UGREEN", category: null, subCategory: null, specs: {}, variants: [], images: [], price: 100, salePrice: null, available: true, updatedAt: "2026-01-01", publishedAt: null, ...extra }) as unknown as ErpProduct;

const ids = (list: ErpProduct[], q: Parameters<typeof queryProducts>[1]) => queryProducts(list, q).items.map((x) => x.id);

describe("search relevance", () => {
  it("ranks products with the word in their name above ones that only match through the category", () => {
    const adapter = p("a1", "Bluetooth Adapter", { category: { slug: "chargers", name: "Chargers" }, updatedAt: "2026-02-01" }); // the newest
    const charger = p("c1", "30W USB-C Fast Charger", { updatedAt: "2026-01-01" });
    expect(ids([adapter, charger], { q: "charger" })).toEqual(["c1", "a1"]);
  });

  it("puts an exact SKU first, then names that start with the word, then names that contain it", () => {
    const cable = p("x1", "Fast Charging Cable 1M", { sku: "60116" });
    const pad = p("x2", "Charging Pad 60116 Edition", { sku: "PAD" });
    expect(ids([pad, cable], { q: "60116" })).toEqual(["x1", "x2"]); // exact SKU beats a name that merely contains the number
    expect(ids([cable, pad], { q: "charging" })).toEqual(["x2", "x1"]); // starts with the word first
  });

  it("keeps newest-first when there is no search, and honours an explicit sort", () => {
    const old = p("o1", "Old", { updatedAt: "2025-01-01" });
    const fresh = p("n1", "New", { updatedAt: "2026-01-01" });
    expect(ids([old, fresh], {})).toEqual(["n1", "o1"]);
    expect(ids([fresh, old], { sort: "name" })).toEqual(["n1", "o1"]); // "New" before "Old"
    expect(ids([old, p("o2", "Old Two", { updatedAt: "2026-03-01" })], { q: "old", sort: "newest" })).toEqual(["o2", "o1"]);
  });
});
