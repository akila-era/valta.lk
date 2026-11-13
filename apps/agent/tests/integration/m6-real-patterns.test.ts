import { describe, expect, it } from "vitest";
import type { ErpTransport } from "../../src/backend/transport";
import { RawProduct, type RawOrder, type RawSettings } from "../../src/backend/wire";
import { createMockStack } from "../../src/mock/stack";
import { renderTemplate } from "../../src/router/templates";
import { emptySite } from "../bench/m6-real/snapshot";
import { run } from "../fixtures/pipeline-helpers";

/**
 * Patterns found in the REAL catalogue audit (docs/AI_REAL_CATALOGUE_AUDIT.md), rebuilt here with INVENTED products so the behaviour is
 * tested without shipping real data: phones filed under a category named after the brand, a watch filed under "Cables", two products with
 * the same name, no laptops at all, no specification numbers anywhere, placeholder prices and descriptions.
 */
const raw = (o: Record<string, unknown>) =>
  RawProduct.parse({ price: "1000.00", hasVariants: false, variants: [], images: [], availability: "IN_STOCK", purchasableQuantity: 5, updatedAt: "2026-11-01T00:00:00.000Z", ...o });

const CATALOGUE = [
  raw({ id: "a1", name: "Alpha 11", brand: "Fruitco", category: "fruitco", model: "FruitPhone" }),
  raw({ id: "a2", name: "Alpha 11", brand: "Fruitco", category: "fruitco", model: "FruitPhone", price: "1000.00", purchasableQuantity: 9 }), // same name twice
  raw({ id: "a3", name: "Alpha 13", brand: "Fruitco", category: "fruitco", price: "1500.00" }), // no model, no word "phone" anywhere
  raw({ id: "a4", name: "Beta Lite", brand: "Zeta", category: "Mobile Phones", availability: "OUT_OF_STOCK", purchasableQuantity: 0 }),
  raw({ id: "w1", name: "Tick watch", brand: "Fruitco", category: "Cables", price: "17000.00" }), // a watch filed under "Cables"
  raw({ id: "w2", name: "Tock watch", brand: "Omega5", category: "watch", price: "12500.00" }),
];

class T implements ErpTransport {
  readonly origin = "https://shop.invalid";
  async listProducts() {
    return CATALOGUE;
  }
  async getProduct(id: string) {
    return CATALOGUE.find((p) => p.id === id) ?? null;
  }
  async getSettings(): Promise<RawSettings> {
    return { currency: "LKR", ordersEnabled: true, deliveryCharge: "0.00" };
  }
  async getOrder(): Promise<RawOrder | null> {
    return null;
  }
}
const stack = () => createMockStack({ transport: new T(), site: emptySite(), catalogueTtlMs: 0 });
const t = (k: Parameters<typeof renderTemplate>[0], l: "en" | "si" = "en") => renderTemplate(k, l).text;
const names = (r: { cards: { type: string; name?: string }[] }) => r.cards.filter((c) => c.type === "product").map((c) => c.name);

describe("a catalogue whose categories do not match how shoppers speak", () => {
  it("'show me phones' finds the phones filed under another category, by their model word, instead of saying there are none", async () => {
    const r = (await run(stack().pipeline, "show me phones")).result;
    expect(names(r)).toEqual(["Alpha 11", "Alpha 11"]);
    expect(r.reply.text).not.toBe(t("no_results"));
  });

  it("a model word the shopper uses ('fruitphone') is searched even though no product NAME contains it", async () => {
    const r = (await run(stack().pipeline, "fruitphone ekak oni")).result;
    expect(names(r)).toEqual(["Alpha 11", "Alpha 11"]);
  });

  it("asking for a kind the shop does not stock ('laptop') says so; it never shows phones or watches as if they were laptops", async () => {
    for (const m of ["laptop for programming under 300000", "laptop for office work", "show me laptops"]) {
      const r = (await run(stack().pipeline, m)).result;
      expect(names(r), m).toEqual([]);
    }
  });

  it("a budget below every price is understood from a price word ('under 500') and answered with close alternatives marked over budget", async () => {
    const r = (await run(stack().pipeline, "a phone for under 500")).result;
    expect(r.reply.text).toBe(t("no_match_alternatives"));
    const first = r.cards.find((c) => c.type === "product") as { fit?: { tradeoffs: string[] } } | undefined;
    expect(first?.fit?.tradeoffs).toContain("over_budget");
  });

  it("naming a new kind of product the shop does not stock is a new subject: the previous brand and budget do not carry over", async () => {
    const st = stack();
    await run(st.pipeline, "fruitco products under 1500");
    for (const m of ["laptop for office work", "show me laptops"]) {
      const r = (await run(st.pipeline, m)).result;
      expect(names(r), m).toEqual([]);
    }
  });

  it("a bare small number without a price word is still not taken as a budget (it may be a quantity)", async () => {
    const r = (await run(stack().pipeline, "show me 2 phones")).result;
    expect(names(r).length).toBeGreaterThan(0);
  });
});

describe("a catalogue with no specification numbers", () => {
  it("says so instead of ranking, and shows the 'no details listed' trade-off on every card", async () => {
    const r = (await run(stack().pipeline, "I want a phone with a good camera")).result;
    expect(r.reply.text.startsWith(t("recommend_limited_data"))).toBe(true);
    for (const c of r.cards) if (c.type === "product") expect(c.fit?.tradeoffs).toContain("no_camera_data");
  });

  it("never states a camera, battery or memory number it was not given", async () => {
    for (const m of ["gaming phone under 5000", "phone with the best battery"]) {
      const r = (await run(stack().pipeline, m)).result;
      expect(JSON.stringify(r)).not.toMatch(/\b\d+\s?(MP|mAh|GB RAM)\b/i);
      expect(r.reply.text).not.toMatch(/\d/);
    }
  });
});

describe("duplicate and inconsistent records", () => {
  it("two products with the same name make a comparison ambiguous: it asks which products, instead of choosing a twin", async () => {
    const r = (await run(stack().pipeline, "compare Alpha 11 and Alpha 13")).result;
    expect(r.cards).toEqual([]);
    expect([t("clarify_ambiguous_product"), t("clarify_two_products")]).toContain(r.reply.text); // asks which one(s); never picks one of the twins
  });

  it("a brand search stays inside that brand and a watch filed under 'Cables' is still found as a watch", async () => {
    const brand = (await run(stack().pipeline, "Omega5 hodaida?")).result;
    expect(names(brand)).toEqual(["Tock watch"]);
    const watches = (await run(stack().pipeline, "show me watches")).result;
    expect(names(watches).sort()).toEqual(["Tick watch", "Tock watch"]);
  });
});
