import { describe, expect, it } from "vitest";
import type { ComparisonCardData, ProductCardData } from "@/components/assistant/types";
import { DEMO_LINKS, DEMO_PRODUCTS } from "@/lib/assistant-demo/data";
import { DemoInputError, accessories, cartSummary, compare, details, formatRs, initialState, proposeCart, reduce, search, stock } from "@/lib/assistant-demo/controller";

const NOVA = "demo-nova-x1";
const ORBIT = "demo-orbit-pro";
const WATCH = "demo-atlas-watch";
const ZEN = "demo-zen-14";
const TABLET = "demo-orbit-tab";

describe("demo catalogue and cards", () => {
  it("formats rupees exactly and labels nothing as live", () => {
    expect(formatRs(129900)).toBe("Rs. 129,900.00");
    expect(formatRs(990)).toBe("Rs. 990.00");
  });

  it("searches by category, budget (sale price counts), stock and sort", () => {
    const names = (c: unknown[]) => (c as ProductCardData[]).map((x) => x.name);
    expect(names(search({ category: "Mobile Phones", maxPriceLkr: 200000, sort: "price-asc" }))).toEqual(["Nova X1 Smartphone", "Orbit Pro Smartphone"]); // Orbit's sale price 199,900 fits
    expect(names(search({ category: "Audio", inStockOnly: true }))).toEqual(["Pulse ANC Earbuds"]);
    expect(names(search({ category: "Audio", inStockOnly: false }))).toHaveLength(2);
    expect(search({ category: "Tablets", maxPriceLkr: 1000 })).toEqual([]);
    expect(() => search({ maxPriceLkr: -5 })).toThrow(DemoInputError);
  });

  it("returns details with specs and warranty only where the data has them", () => {
    const zen = details(ZEN)[0] as ProductCardData;
    expect(zen.specs).toContainEqual({ name: "Warranty", value: "24 months" });
    expect(zen.price.text).toBe("Rs. 289,900.00");
    expect((details(WATCH)[0] as ProductCardData).specs?.map((s) => s.name)).not.toContain("Warranty");
    expect((details(ORBIT)[0] as ProductCardData)).toMatchObject({ price: { text: "Rs. 199,900.00" }, listPrice: { text: "Rs. 219,900.00" } });
    expect(() => details("nope")).toThrow(DemoInputError);
  });

  it("answers stock as a flag only", () => {
    expect(stock("demo-echo-speaker")).toEqual([{ type: "stock", productId: "demo-echo-speaker", available: false }]);
  });

  it("recommends accessories only from explicit links, in stock", () => {
    expect((accessories(ZEN) as { kind: string }[]).map((a) => a.kind)).toEqual(["CHARGER", "OTHER", "OTHER"]);
    expect(accessories(WATCH)).toEqual([]);
    expect(DEMO_LINKS.every((l) => DEMO_PRODUCTS.some((p) => p.id === l.forId) && DEMO_PRODUCTS.some((p) => p.id === l.accessoryId))).toBe(true);
  });
});

describe("demo comparison: 2 to 4 products", () => {
  const cmp = (ids: string[]) => compare(ids)[0] as ComparisonCardData;
  it.each([2, 3, 4])("compares %i products with that many values in every row", (n) => {
    const card = cmp([NOVA, ORBIT, WATCH, ZEN].slice(0, n));
    expect(card.products).toHaveLength(n);
    for (const r of card.rows) expect(r.values).toHaveLength(n);
  });
  it("rejects 0, 1, 5 products and duplicates, and unknown ids", () => {
    for (const ids of [[], [NOVA], [NOVA, ORBIT, WATCH, ZEN, TABLET], [NOVA, NOVA], [NOVA, "nope"]]) expect(() => compare(ids), ids.join()).toThrow(DemoInputError);
  });
  it("shows a missing specification as null, never an invented value, and computes the price spread", () => {
    const card = cmp([ZEN, TABLET, WATCH, NOVA]);
    expect(card.rows.find((r) => r.label === "Memory")?.values).toEqual(["16 GB", null, null, null]);
    expect(card.rows.find((r) => r.label === "Memory")?.differs).toBe(true);
    expect(card.priceDelta?.text).toBe("Rs. 255,000.00"); // 289,900 minus 34,900
  });
});

describe("cart proposals are confirmation-gated", () => {
  it("a proposal changes nothing until it is confirmed", () => {
    let s = initialState();
    const add = proposeCart("cart.add", NOVA, 2);
    expect(add).toMatchObject({ type: "cart.add", quantity: 2, confirm: "ask" });
    s = reduce(s, { type: "propose", action: add });
    expect(s.cart).toEqual([]); // proposed, not applied
    expect(s.pending).toEqual(add);
    s = reduce(s, { type: "confirm", actionId: add.actionId });
    expect(s.cart).toEqual([{ productId: NOVA, quantity: 2 }]);
    expect(s.pending).toBeNull();
  });

  it("Cancel leaves the cart exactly as it was", () => {
    let s = reduce(initialState(), { type: "propose", action: proposeCart("cart.add", NOVA, 1) });
    s = reduce(s, { type: "cancel", actionId: s.pending!.actionId });
    expect(s).toMatchObject({ cart: [], pending: null });
  });

  it("applies a confirmation once, ignores a wrong or replayed id, and refuses a proposal that does not ask", () => {
    const add = proposeCart("cart.add", NOVA, 1);
    let s = reduce(initialState(), { type: "propose", action: add });
    s = reduce(s, { type: "confirm", actionId: "some-other-id" });
    expect(s.cart).toEqual([]);
    s = reduce(s, { type: "confirm", actionId: add.actionId });
    const replay = reduce(s, { type: "confirm", actionId: add.actionId });
    expect(replay.cart).toEqual([{ productId: NOVA, quantity: 1 }]);
    expect(reduce(initialState(), { type: "propose", action: { ...add, confirm: "none" } }).pending).toBeNull();
  });

  it("updates and removes lines only through confirmed proposals", () => {
    let s = initialState();
    const run = (a: ReturnType<typeof proposeCart>) => {
      s = reduce(reduce(s, { type: "propose", action: a }), { type: "confirm", actionId: a.actionId });
    };
    run(proposeCart("cart.add", NOVA, 1, s.cart));
    run(proposeCart("cart.setQuantity", NOVA, 3, s.cart));
    expect(s.cart).toEqual([{ productId: NOVA, quantity: 3 }]);
    run(proposeCart("cart.add", NOVA, 2, s.cart));
    expect(s.cart).toEqual([{ productId: NOVA, quantity: 5 }]);
    run(proposeCart("cart.remove", NOVA, 1, s.cart));
    expect(s.cart).toEqual([]);
  });

  it("validates product ids and quantities before proposing", () => {
    for (const q of [0, -1, 11, 1.5, Number.NaN]) expect(() => proposeCart("cart.add", NOVA, q), String(q)).toThrow(DemoInputError);
    expect(() => proposeCart("cart.add", "nope", 1)).toThrow(DemoInputError);
    expect(() => proposeCart("cart.add", "demo-echo-speaker", 1)).toThrow(/out of stock/);
    expect(() => proposeCart("cart.remove", NOVA, 1, [])).toThrow(DemoInputError);
    expect(() => proposeCart("cart.setQuantity", NOVA, 2, [])).toThrow(DemoInputError);
    expect(() => proposeCart("cart.add", NOVA, 5, [{ productId: NOVA, quantity: 6 }])).toThrow(/at most/);
  });

  it("totals the demo cart from the demo prices", () => {
    expect(cartSummary([{ productId: NOVA, quantity: 2 }, { productId: ORBIT, quantity: 1 }]).subtotal.text).toBe("Rs. 459,700.00");
  });
});
