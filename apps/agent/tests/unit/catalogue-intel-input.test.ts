import { describe, expect, it } from "vitest";
import { cardable } from "../../src/backend/cards";
import { mapProduct } from "../../src/backend/catalogue";
import { RawProduct } from "../../src/backend/wire";
import { extractItems, isCardable, parseMoney, readContent, readLinks, readProduct, readSnapshot, wireProblems } from "../../src/catalogue-intel";
import { product, rng, variant, type Raw } from "../fixtures/catalogue-intel/builders";

describe("parseMoney", () => {
  it("accepts exactly the decimal strings the Agent accepts", () => {
    for (const ok of ["0", "1000", "1000.5", "1000.50", "0.99"]) expect(parseMoney(ok)).toMatchObject({ wireOk: true, problem: null });
  });
  it("reads but flags values the Agent would refuse", () => {
    expect(parseMoney("1,000.00")).toMatchObject({ value: 1000, wireOk: false, problem: "thousands_separator" });
    expect(parseMoney("Rs. 1000")).toMatchObject({ value: 1000, wireOk: false, problem: "currency_symbol" });
    expect(parseMoney("LKR 2500.00")).toMatchObject({ value: 2500, wireOk: false });
    expect(parseMoney("10.123")).toMatchObject({ value: 10.123, wireOk: false, problem: "too_many_decimals" });
    expect(parseMoney(1000)).toMatchObject({ value: 1000, wireOk: false, problem: "number_type" });
    expect(parseMoney("-5")).toMatchObject({ value: -5, wireOk: false, problem: "negative" });
  });
  it("never throws and reports unreadable values as null", () => {
    for (const bad of [undefined, null, "", "abc", NaN, Infinity, {}, [], true, "1e999", "--1"]) {
      const m = parseMoney(bad);
      expect(m.wireOk).toBe(false);
      expect(m.problem).not.toBeNull();
    }
    expect(parseMoney(NaN).value).toBeNull();
  });
});

describe("wireProblems agrees with the Agent's real RawProduct schema", () => {
  const accepted = (r: Raw): boolean => RawProduct.safeParse(r).success;
  it("agrees on a valid product and on hand-picked breakages", () => {
    const ok = product();
    expect(wireProblems(ok)).toEqual([]);
    expect(accepted(ok)).toBe(true);
    const breakages: Raw[] = [
      { ...ok, price: 1000 },
      { ...ok, price: "1,000.00" },
      { ...ok, price: "10.123" },
      { ...ok, updatedAt: undefined },
      { ...ok, id: 5 },
      { ...ok, name: null },
      { ...ok, variants: [variant({ key: undefined })] },
      { ...ok, variants: [variant({ price: "x" })] },
      { ...ok, variants: [variant({ purchasableQuantity: 1.5 })] },
      { ...ok, purchasableQuantity: "5" },
      { ...ok, images: [{ nourl: 1 }] },
      { ...ok, availability: null },
      { ...ok, discountActive: "yes" },
      { ...ok, warrantyMonths: 1.5 },
      { ...ok, salePrice: "" },
    ];
    for (const b of breakages) expect({ b, problems: wireProblems(b).length === 0 }).toEqual({ b, problems: accepted(b) });
  });
  it("agrees on 600 randomly damaged products", () => {
    const rnd = rng(7);
    const mutations: ((r: Raw) => void)[] = [
      (r) => (r.price = [1000, "1,000", "1000.123", null, undefined, "", "12.5", " 5"][Math.floor(rnd() * 8)]),
      (r) => (r.salePrice = [1, "5.00", "", "x", undefined, null][Math.floor(rnd() * 6)]),
      (r) => delete r.updatedAt,
      (r) => (r.id = [5, null, "", "ok"][Math.floor(rnd() * 4)]),
      (r) => (r.name = [null, 3, "", "n"][Math.floor(rnd() * 4)]),
      (r) => (r.purchasableQuantity = [1.5, "5", null, -3, 1e20, Infinity, NaN, 7][Math.floor(rnd() * 8)]),
      (r) => (r.availability = [null, 5, "IN_STOCK", undefined][Math.floor(rnd() * 4)]),
      (r) => (r.images = [null, {}, [{ url: 5 }], [{ url: "a" }], "x", []][Math.floor(rnd() * 6)]),
      (r) => (r.variants = [null, [{}], [{ key: "k", price: "1.00" }], [{ key: 1, price: "1.00" }], [{ key: "k", price: "1.00", purchasableQuantity: 2.5 }], "x", []][Math.floor(rnd() * 7)]),
      (r) => (r.warrantyMonths = [null, 12, 1.2, "12", undefined][Math.floor(rnd() * 5)]),
      (r) => (r.discountActive = [true, false, "true", null, undefined][Math.floor(rnd() * 5)]),
      (r) => (r.brand = [null, 5, "x"][Math.floor(rnd() * 3)]),
    ];
    let mismatches = 0;
    const examples: string[] = [];
    for (let i = 0; i < 600; i++) {
      const r = product() as Raw;
      for (let k = 0; k < 1 + Math.floor(rnd() * 3); k++) mutations[Math.floor(rnd() * mutations.length)]!(r);
      const mine = wireProblems(r).length === 0;
      const real = accepted(r);
      if (mine !== real) {
        mismatches++;
        if (examples.length < 3) examples.push(JSON.stringify({ r, mine, real }).slice(0, 400));
      }
    }
    expect({ mismatches, examples }).toEqual({ mismatches: 0, examples: [] });
  });
});

describe("isCardable agrees with the Agent's cardable()", () => {
  const empty = { links: [], promotions: [], content: {}, customerOrders: new Map<string, string[]>() };
  it("on ids and names of every awkward kind", () => {
    const ids = ["ok-1", "UPPER", "a b", "a/b", "ünï", "x".repeat(100), "x".repeat(101), "id%20", "dot.dot", "~tilde", "emoji😀", "", "a?b", "..", "-"];
    const names = ["Phone", "", "ඇපල් iPhone", "  spaced  name ", "x".repeat(300), "!!!", "A/B"];
    let checked = 0;
    for (const id of ids)
      for (const name of names) {
        const parsed = RawProduct.safeParse({ ...product(), id, name });
        if (!parsed.success) continue;
        const view = mapProduct(parsed.data, "https://shop.example.invalid", empty, "guest");
        expect({ id, name: name.slice(0, 10), v: isCardable(id, name) }).toEqual({ id, name: name.slice(0, 10), v: cardable(view) });
        checked++;
      }
    expect(checked).toBeGreaterThan(80);
  });
});

describe("readSnapshot", () => {
  const one = product();
  it("finds the product list in every shape the relay and ERP produce", () => {
    for (const shape of [[one], { items: [one] }, { data: { items: [one] } }, { data: [one] }, [{ items: [one] }, { items: [] }]]) {
      expect(extractItems(shape)).toHaveLength(1);
      expect(readSnapshot(shape).products).toHaveLength(1);
    }
    expect(extractItems("nope")).toBeNull();
    expect(readSnapshot(42).products).toEqual([]);
  });
  it("turns unreadable records into stated problems, never exceptions", () => {
    const s = readSnapshot({ items: [one, null, 5, "x", { name: "no id" }, { id: "" }, { id: "ok", name: "n", price: "1.00", updatedAt: "t" }] });
    expect(s.products.map((p) => p.id)).toEqual([String(one.id), "ok"]);
    expect(s.invalid).toHaveLength(5);
  });
  it("reads the currency from the snapshot settings", () => {
    expect(readSnapshot({ items: [one], settings: { currency: "LKR" } }).currency).toBe("LKR");
    expect(readSnapshot({ items: [one] }, { currency: "USD" }).currency).toBe("USD");
  });
  it("keeps bad values as null with a problem instead of dropping the product", () => {
    const p = readProduct({ ...one, price: "Rs 1,000", purchasableQuantity: "many", variants: [variant({ price: NaN }), { nokey: 1 }] }, 0);
    expect("reason" in p).toBe(false);
    if (!("reason" in p)) {
      expect(p.priceProblem).toBe("thousands_separator");
      expect(p.qty).toBeNull();
      expect(p.invalidVariants).toBe(1);
      expect(p.wireProblems.length).toBeGreaterThan(0);
    }
  });
  it("reads website content and links in their usual shapes", () => {
    expect(readContent({ items: [{ id: "a", specs: [{ name: "RAM", value: "8", unit: "GB" }, { name: "", value: "" }] }] })).toEqual({ a: [{ name: "RAM", value: "8", unit: "GB" }] });
    expect(readContent({ a: { specs: [{ name: "Battery", value: 5000 }] } })).toEqual({ a: [{ name: "Battery", value: "5000" }] });
    expect(readContent(undefined)).toBeUndefined();
    expect(readLinks([{ sourceItemId: "a", accessoryItemId: "b", kind: "CASE" }, { sourceItemId: "a" }, 5])).toEqual([{ sourceItemId: "a", accessoryItemId: "b", kind: "CASE" }]);
    expect(readLinks("x")).toBeUndefined();
  });
});
