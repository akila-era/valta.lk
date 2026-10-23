import { describe, expect, it } from "vitest";
import { resolveAccessoryOffers, type AccessoryKind } from "@/lib/accessories/resolve";
import { evaluatePromotions, rawDiscountCents, type PricedLine, type PromotionRule } from "@/lib/promotions/evaluate";
import type { ErpProduct } from "@/lib/erp/types";

const now = Date.parse("2026-06-01T00:00:00.000Z");

const rule = (over: Partial<PromotionRule> = {}): PromotionRule => ({
  id: "promo-1",
  name: "Phone sale",
  type: "PERCENT",
  value: 10,
  minSubtotal: 0,
  maxDiscount: null,
  startsAt: now - 86_400_000,
  endsAt: now + 86_400_000,
  usageLimit: null,
  perCustomerLimit: null,
  used: 0,
  usedByCustomer: 0,
  stackable: false,
  active: true,
  productIds: ["phone"],
  categoryNames: [],
  bundleAccessoryId: null,
  ...over,
});

const line = (over: Partial<PricedLine> = {}): PricedLine => ({
  productId: "phone",
  variantKey: "",
  quantity: 1,
  listPrice: 1000,
  erpPrice: 900,
  categoryName: "Mobile Phones",
  ...over,
});

describe("promotion evaluation", () => {
  it("advertises a percent rule only when it matches the catalogue sale, and does not change the total", () => {
    const quote = evaluatePromotions([line()], [rule()], now, 450);
    expect(quote.advertised).toEqual([{ id: "promo-1", name: "Phone sale", discount: 100 }]);
    expect(quote.lines[0].offerName).toBe("Phone sale");
    expect(quote.subtotal).toBe(900);
    expect(quote.total).toBe(1350);
    expect(quote.catalogueSavings).toBe(100);
  });

  it("does not advertise a discount the catalogue price does not already include", () => {
    const quote = evaluatePromotions([line({ erpPrice: 1000 })], [rule()], now);
    expect(quote.advertised).toEqual([]);
    expect(quote.lines[0].offerName).toBeNull();
    expect(quote.subtotal).toBe(1000);
    expect(quote.decisions[0].reason).toMatch(/catalogue price/i);
    expect(quote.decisions[0].computedDiscount).toBe(100);
  });

  it("blocks expired, inactive, minimum, usage and customer limits", () => {
    expect(evaluatePromotions([line()], [rule({ active: false })], now).decisions[0].reason).toMatch(/inactive/i);
    expect(evaluatePromotions([line()], [rule({ endsAt: now })], now).decisions[0].reason).toMatch(/expired/i);
    expect(evaluatePromotions([line()], [rule({ startsAt: now + 1 })], now).decisions[0].reason).toMatch(/not started/i);
    expect(evaluatePromotions([line()], [rule({ minSubtotal: 5000 })], now).decisions[0].reason).toMatch(/minimum/i);
    expect(evaluatePromotions([line()], [rule({ usageLimit: 1, used: 1 })], now).decisions[0].reason).toMatch(/usage limit/i);
    expect(evaluatePromotions([line()], [rule({ perCustomerLimit: 1 })], now, 0, null).decisions[0].reason).toMatch(/signed-in/i);
    expect(evaluatePromotions([line()], [rule({ perCustomerLimit: 1, usedByCustomer: 1 })], now, 0, "cust").decisions[0].reason).toMatch(/customer has reached/i);
  });

  it("requires the bundle accessory and the eligible product", () => {
    const bundle = rule({ bundleAccessoryId: "case" });
    expect(evaluatePromotions([line()], [bundle], now).decisions[0].reason).toMatch(/accessory/i);
    const withCase = evaluatePromotions([line(), line({ productId: "case", listPrice: 50, erpPrice: 50, categoryName: "Accessories" })], [bundle], now);
    expect(withCase.advertised).toHaveLength(1);
    expect(evaluatePromotions([line({ productId: "other" })], [rule()], now).decisions[0].reason).toMatch(/qualify/i);
  });

  it("caps a fixed discount and refuses one larger than the item", () => {
    const fixed = rule({ type: "FIXED", value: 100, maxDiscount: 80 });
    expect(rawDiscountCents(fixed, [line({ listPrice: 1000, erpPrice: 1000 })])).toBe(8000);
    expect(evaluatePromotions([line({ listPrice: 50, erpPrice: 50 })], [rule({ type: "FIXED", value: 80 })], now).decisions[0].reason).toMatch(/above the item/i);
  });

  it("keeps a single non-stackable offer and allows disjoint stackable offers", () => {
    const a = rule({ id: "a", name: "A", value: 10 });
    const b = rule({ id: "b", name: "B", value: 10, productIds: ["case"] });
    const lines = [line(), line({ productId: "case", listPrice: 200, erpPrice: 180 })];
    const one = evaluatePromotions(lines, [a, b], now);
    expect(one.advertised.map((p) => p.id)).toEqual(["a"]);
    expect(one.decisions.find((d) => d.id === "b")?.reason).toMatch(/another promotion/i);

    const stacked = evaluatePromotions(lines, [rule({ ...a, stackable: true }), rule({ ...b, stackable: true })], now);
    expect(stacked.advertised.map((p) => p.id).sort()).toEqual(["a", "b"]);
    expect(stacked.lines.map((l) => l.offerName)).toEqual(["A", "B"]);
    expect(stacked.total).toBe(1080);
  });

  it("never produces a negative savings figure", () => {
    const quote = evaluatePromotions([line({ listPrice: 10, erpPrice: 12 })], [], now);
    expect(quote.catalogueSavings).toBe(0);
    expect(quote.subtotal).toBe(12);
  });
});

const product = (over: Partial<ErpProduct> = {}): ErpProduct => ({
  id: "case",
  slug: "case-case",
  name: "Clear Case",
  description: "",
  brand: "Orbit",
  category: { slug: "accessories", name: "Accessories" },
  images: ["/case.jpg"],
  price: 1500,
  salePrice: null,
  specs: {},
  variants: [],
  hasVariants: false,
  available: true,
  purchasableQuantity: 4,
  publishedAt: null,
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

describe("accessory resolution", () => {
  it("returns only explicit in-stock links and does not match by name", () => {
    const products = new Map<string, ErpProduct>([
      ["phone", product({ id: "phone", name: "Orbit Case Phone" })],
      ["case", product()],
      ["gone", product({ id: "gone", available: false, purchasableQuantity: 0 })],
    ]);
    const offers = resolveAccessoryOffers(
      [
        { sourceItemId: "phone", accessoryItemId: "case", kind: "BACK_COVER" },
        { sourceItemId: "phone", accessoryItemId: "case", kind: "CABLE" as AccessoryKind },
        { sourceItemId: "phone", accessoryItemId: "missing", kind: "CHARGER" },
        { sourceItemId: "phone", accessoryItemId: "gone", kind: "CABLE" },
        { sourceItemId: "phone", accessoryItemId: "phone", kind: "OTHER" },
      ],
      products,
    );
    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({ productId: "case", name: "Clear Case", canAdd: true, variantKey: "", unitPrice: 1500, kindLabel: "Back cover" });
  });

  it("adds a single available variant and refuses to guess among several", () => {
    const one = product({
      hasVariants: true,
      variants: [{ key: "black", label: "Black", price: 1500, salePrice: 1200, available: true, purchasableQuantity: 2 }],
    });
    const many = product({
      id: "cables",
      hasVariants: true,
      variants: [
        { key: "1m", label: "1 m", price: 900, salePrice: null, available: true, purchasableQuantity: 3 },
        { key: "2m", label: "2 m", price: 1100, salePrice: null, available: true, purchasableQuantity: 3 },
      ],
    });
    const products = new Map<string, ErpProduct>([
      ["case", one],
      ["cables", many],
    ]);
    const offers = resolveAccessoryOffers(
      [
        { sourceItemId: "phone", accessoryItemId: "case", kind: "BACK_COVER" },
        { sourceItemId: "phone", accessoryItemId: "cables", kind: "CABLE" },
      ],
      products,
    );
    expect(offers[0]).toMatchObject({ canAdd: true, variantKey: "black", unitPrice: 1200, priceFrom: false });
    expect(offers[1]).toMatchObject({ canAdd: false, variantKey: "", unitPrice: 900, priceFrom: true });
  });
});
