import { describe, expect, it } from "vitest";
import { formatLkr, money, RawOrder, RawProduct, RawSettings, toCents } from "../../src/backend/wire";

describe("money is integer cents", () => {
  it("converts decimal strings exactly", () => {
    expect(toCents("129900.00")).toBe(12_990_000);
    expect(toCents("1500")).toBe(150_000);
    expect(toCents("0.5")).toBe(50);
    expect(toCents("0.05")).toBe(5);
    expect(toCents("19.99")).toBe(1999);
    expect(toCents("0.30")).toBe(30); // a classic float trap: 0.1 + 0.2 style errors cannot happen with cents
  });

  it("formats rupees with thousands separators and two decimals", () => {
    expect(formatLkr(12_990_000)).toBe("Rs. 129,900.00");
    expect(formatLkr(45_000)).toBe("Rs. 450.00");
    expect(formatLkr(5)).toBe("Rs. 0.05");
    expect(formatLkr(0)).toBe("Rs. 0.00");
    expect(formatLkr(123_456_789)).toBe("Rs. 1,234,567.89");
  });

  it("builds the contract Money object from cents", () => {
    expect(money(19_990_000)).toEqual({ amount: 199900, text: "Rs. 199,900.00" });
  });
});

describe("wire schemas", () => {
  const product = { id: "p1", name: "X", price: "100.00", updatedAt: "2026-01-01T00:00:00Z" };

  it("accepts a minimal product and ignores unknown fields (the contract allows additive changes)", () => {
    const p = RawProduct.parse({ ...product, somethingNew: { a: 1 } });
    expect(p).toMatchObject({ id: "p1", discountActive: false, variants: [], images: [], availability: "UNKNOWN" });
  });

  it("rejects money that is not a decimal string", () => {
    for (const price of [100, "1e3", "-5", "12.345", "", "Rs. 5"]) expect(RawProduct.safeParse({ ...product, price }).success, String(price)).toBe(false);
  });

  it("requires the settings and order fields the assistant reads", () => {
    expect(RawSettings.safeParse({ currency: "LKR", ordersEnabled: true, deliveryCharge: "450.00" }).success).toBe(true);
    expect(RawSettings.safeParse({ currency: "LKR", ordersEnabled: true }).success).toBe(false);
    expect(RawOrder.safeParse({ externalRef: "r", status: "WEIRD", currency: "LKR", paymentMethod: "COD", lines: [], deliveryCharge: "1.00", total: "1.00" }).success).toBe(false);
    expect(RawOrder.safeParse({ externalRef: "r", status: "PLACED", currency: "LKR", paymentMethod: "COD", lines: [{ itemId: "i", quantity: 1, unitPrice: "1.00" }], deliveryCharge: "1.00", total: "2.00" }).success).toBe(true);
  });
});
