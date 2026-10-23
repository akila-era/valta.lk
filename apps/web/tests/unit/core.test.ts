import { describe, expect, it } from "vitest";
import { addMoney, formatLkr, multiplyMoney, toCents } from "@/lib/utils/money";
import { addLine, clampQty, itemCount, lineKey, MAX_LINE_QTY, removeLine, setQuantity, subtotal, type CartLine } from "@/lib/utils/cart-math";
import { generateOrderRef, isValidOrderRef } from "@/lib/utils/order-ref";
import { normalizeLkPhone, placeOrderSchema } from "@/lib/validation/checkout";
import { ErpError, mapErpError } from "@/lib/erp/errors";

const line = (o: Partial<CartLine> = {}): CartLine => ({
  productId: "p1", variantKey: "", slug: "p1", name: "P1", unitPrice: 100, quantity: 1, ...o,
});

describe("money", () => {
  it("avoids floating point drift", () => {
    expect(addMoney(0.1, 0.2)).toBe(0.3);
    expect(multiplyMoney(19.99, 3)).toBe(59.97);
    expect(toCents(1.005)).toBe(101);
  });
  it("formats LKR", () => {
    expect(formatLkr(129900)).toBe("LKR 129,900");
    expect(formatLkr(450.5)).toBe("LKR 450.5");
  });
});

describe("cart math", () => {
  it("merges same product+variant and keeps different variants apart", () => {
    let c: CartLine[] = [];
    c = addLine(c, line({ variantKey: "128GB" }));
    c = addLine(c, line({ variantKey: "128GB", quantity: 2 }));
    c = addLine(c, line({ variantKey: "256GB" }));
    expect(c).toHaveLength(2);
    expect(c[0].quantity).toBe(3);
    expect(lineKey(c[1])).toBe("p1::256GB");
  });
  it("clamps quantity and removes at zero", () => {
    expect(clampQty(999)).toBe(MAX_LINE_QTY);
    expect(clampQty(NaN)).toBe(1);
    let c = addLine([], line());
    c = setQuantity(c, "p1::", 5);
    expect(c[0].quantity).toBe(5);
    expect(setQuantity(c, "p1::", 0)).toEqual([]);
    expect(removeLine(c, "p1::")).toEqual([]);
  });
  it("computes subtotal and item count", () => {
    const c = [line({ unitPrice: 19.99, quantity: 3 }), line({ productId: "p2", unitPrice: 5, quantity: 2 })];
    expect(subtotal(c)).toBe(69.97);
    expect(itemCount(c)).toBe(5);
  });
});

describe("order reference", () => {
  it("is valid, unique, and rejects junk", () => {
    const a = generateOrderRef();
    expect(isValidOrderRef(a)).toBe(true);
    expect(generateOrderRef()).not.toBe(a);
    expect(isValidOrderRef("VLK-000000-0OIL")).toBe(false);
    expect(isValidOrderRef("../etc/passwd")).toBe(false);
  });
});

describe("phone + checkout validation", () => {
  it.each([
    ["0771234567", "+94771234567"],
    ["+94 77 123 4567", "+94771234567"],
    ["94771234567", "+94771234567"],
    ["0112345678", "+94112345678"],
  ])("normalises %s", (input, out) => expect(normalizeLkPhone(input)).toBe(out));
  it.each(["12345", "077123456", "0991234567890", "abc", "+9477123"])("rejects %s", (v) => expect(normalizeLkPhone(v)).toBeNull());

  const valid = () => ({
    externalRef: generateOrderRef(),
    lines: [{ productId: "p1", variantKey: "", quantity: 1 }],
    customer: { name: "Kasun Perera", phone: "0771234567", email: "" },
    delivery: { address: "12 Galle Road", city: "Colombo", district: "Colombo", postalCode: "00300" },
    expectedTotal: 1000,
    acceptTerms: true as const,
  });
  it("accepts a valid order and normalises the phone", () => {
    const r = placeOrderSchema.safeParse(valid());
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.customer.phone).toBe("+94771234567");
  });
  it("rejects bad input", () => {
    expect(placeOrderSchema.safeParse({ ...valid(), acceptTerms: false }).success).toBe(false);
    expect(placeOrderSchema.safeParse({ ...valid(), lines: [] }).success).toBe(false);
    expect(placeOrderSchema.safeParse({ ...valid(), lines: [{ productId: "p1", variantKey: "", quantity: 11 }] }).success).toBe(false);
    expect(placeOrderSchema.safeParse({ ...valid(), delivery: { ...valid().delivery, district: "Atlantis" } }).success).toBe(false);
    expect(placeOrderSchema.safeParse({ ...valid(), delivery: { ...valid().delivery, postalCode: "12" } }).success).toBe(false);
    expect(placeOrderSchema.safeParse({ ...valid(), externalRef: "bad" }).success).toBe(false);
  });
});

describe("error mapping", () => {
  it("maps documented ERP codes to safe responses", () => {
    expect(mapErpError(new ErpError("PRICE_CHANGED", 409, "x")).code).toBe("PRICE_CHANGED");
    expect(mapErpError(new ErpError("TOTAL_MISMATCH", 409, "x")).status).toBe(409);
    expect(mapErpError(new ErpError("INSUFFICIENT_STOCK", 409, "x")).code).toBe("INSUFFICIENT_STOCK");
    expect(mapErpError(new ErpError("REFERENCE_REUSED", 409, "x")).code).toBe("REFERENCE_REUSED");
    expect(mapErpError(new ErpError("RATE_LIMITED", 429, "x")).status).toBe(429);
    expect(mapErpError(new ErpError("NOT_CONFIGURED", 503, "secret-bearing detail")).message).not.toMatch(/secret/);
    expect(mapErpError(new Error("boom")).status).toBe(500);
  });
});

import { parseDecimal, toDecimalString } from "@/lib/utils/money";
import { mapProduct, productSlug, slugify } from "@/lib/erp/product-mapper";
import { rawProductSchema, erpOrderSchema, erpSettingsSchema } from "@/lib/erp/types";

describe("ERP decimal strings", () => {
  it("parses and formats without float drift", () => {
    expect(parseDecimal("1250.50")).toBe(1250.5);
    expect(parseDecimal("900")).toBe(900);
    expect(parseDecimal("0.07")).toBe(0.07);
    expect(toDecimalString(1250.5)).toBe("1250.50");
    expect(toDecimalString(19.99 * 3)).toBe("59.97");
    expect(toDecimalString(900)).toBe("900.00");
  });
});

describe("ERP wire schemas", () => {
  it("rejects non-string money and malformed settings", () => {
    expect(erpSettingsSchema.safeParse({ currency: "LKR", ordersEnabled: true, deliveryCharge: 250 }).success).toBe(false);
    const ok = erpSettingsSchema.parse({ currency: "LKR", ordersEnabled: true, paymentMethods: { COD: true, ONLINE: false }, deliveryCharge: "250.00" });
    expect(ok.deliveryCharge).toBe(250);
  });
  it("normalises orders: null variantKey becomes empty, flat tracking fields are read", () => {
    const o = erpOrderSchema.parse({
      externalRef: "VLK-1", status: "DISPATCHED", paymentMethod: "COD", paymentStatus: "COD_PENDING", currency: "LKR",
      subtotal: "100.00", deliveryCharge: "50.00", total: "150.00", unknownFutureField: 1, trackingNumber: "T1", carrierName: "C1",
      lines: [{ itemId: "i1", variantKey: null, quantity: 1, unitPrice: "100.00", lineTotal: "100.00" }],
    });
    expect(o.lines[0].variantKey).toBe("");
    expect(o.total).toBe(150);
    expect(o.trackingNumber).toBe("T1");
    expect(o.paymentStatus).toBe("COD_PENDING");
  });
});

describe("catalogue mapping", () => {
  const raw = (over: Record<string, unknown> = {}) =>
    rawProductSchema.parse({
      id: "cm0item00000001", sku: "S1", name: "Nova X1 Phone!", brand: "Nova", category: "Mobile Phones", price: "1000.00",
      salePrice: "900.00", discountActive: true, images: [{ url: "/uploads/a.jpg", relative: true }], availability: "IN_STOCK",
      purchasableQuantity: 5, updatedAt: "2026-10-01T00:00:00Z", ...over,
    });
  it("builds stable slugs and category slugs", () => {
    expect(slugify("  Nova X1 -- Phone! ")).toBe("nova-x1-phone");
    expect(productSlug("Nova X1", "CM0Item1")).toBe("nova-x1-cm0item1");
    expect(mapProduct(raw(), null).category).toEqual({ slug: "mobile-phones", name: "Mobile Phones" });
  });
  it("applies the sale price only while the discount is active", () => {
    expect(mapProduct(raw(), null).salePrice).toBe(900);
    expect(mapProduct(raw({ discountActive: false }), null).salePrice).toBeNull();
    expect(mapProduct(raw({ salePrice: "1200.00" }), null).salePrice).toBeNull();
  });
  it("resolves relative images against the ERP origin and drops unsafe schemes", () => {
    expect(mapProduct(raw(), "https://erp.example").images).toEqual(["https://erp.example/uploads/a.jpg"]);
    expect(mapProduct(raw({ images: [{ url: "/uploads/b.jpg" }] }), "https://erp.example").images).toEqual(["https://erp.example/uploads/b.jpg"]);
    expect(mapProduct(raw(), null).images).toEqual([]);
    expect(mapProduct(raw({ images: [{ url: "javascript:alert(1)" }] }), null).images).toEqual([]);
  });
  it("treats only IN_STOCK with quantity as purchasable and labels variants", () => {
    expect(mapProduct(raw({ availability: "UNKNOWN" }), null).available).toBe(false);
    expect(mapProduct(raw({ availability: "NOT_FULFILLABLE" }), null).available).toBe(false);
    const p = mapProduct(
      raw({ hasVariants: true, variants: [
        { key: "128GB::Black", storage: "128GB", color: "Black", price: "1000.00", availability: "IN_STOCK", purchasableQuantity: 2 },
        { key: "256GB::Blue", storage: "256GB", color: "Blue", price: "1200.00", availability: "OUT_OF_STOCK", purchasableQuantity: 0 },
      ] }),
      null,
    );
    expect(p.variants.map((v) => [v.label, v.available])).toEqual([["128GB / Black", true], ["256GB / Blue", false]]);
    expect(p.available).toBe(true);
  });
});

import { discountPercent } from "@/lib/erp/product-utils";
import { parseBanners } from "@/lib/home-config";
import { resolveBanners } from "@/lib/home-data";

describe("discount badge", () => {
  it("is derived from real prices and floors to whole percent", () => {
    expect(discountPercent({ price: 219900, salePrice: 199900 })).toBe(9);
    expect(discountPercent({ price: 1000, salePrice: 1000 })).toBeNull();
    expect(discountPercent({ price: 1000, salePrice: 1200 })).toBeNull();
    expect(discountPercent({ price: 1000, salePrice: null })).toBeNull();
    expect(discountPercent({ price: 1000, salePrice: 999.9 })).toBeNull(); // < 1%: no badge
  });
});

describe("homepage banners", () => {
  const cats = [
    { slug: "mobile-phones", name: "Mobile Phones", count: 3, image: "https://x/p.jpg", subs: [] },
    { slug: "accessories", name: "Accessories", count: 5, subs: [] },
    { slug: "tablets", name: "Tablets", count: 1, subs: [] },
  ];
  const withEnv = (v: string | undefined, fn: () => void) => {
    const prev = process.env.HOME_BANNERS;
    if (v === undefined) delete process.env.HOME_BANNERS; else process.env.HOME_BANNERS = v;
    try { fn(); } finally { if (prev === undefined) delete process.env.HOME_BANNERS; else process.env.HOME_BANNERS = prev; }
  };
  it("derives neutral banners from real categories, with no offer or discount wording", () => {
    withEnv(undefined, () => {
      const b = resolveBanners(cats);
      expect(b.map((x) => [x.variant, x.href])).toEqual([["dark", "/categories/mobile-phones"], ["light", "/categories/accessories"]]);
      expect(JSON.stringify(b)).not.toMatch(/%|off|sale|free|warranty|official/i);
    });
  });
  it("hides banners whose category does not exist and never invents missing ones", () => {
    withEnv(undefined, () => expect(resolveBanners([{ slug: "tablets", name: "Tablets", count: 1, subs: [] }])).toEqual([]));
    withEnv(JSON.stringify([{ variant: "dark", headline: "Gaming", ctaLabel: "Shop gaming", href: "/categories/gaming", categorySlug: "gaming" }]), () =>
      expect(resolveBanners(cats)).toEqual([]),
    );
  });
  it("accepts configured banners, rejects external hrefs and malformed config", () => {
    const ok = { variant: "light", headline: "Tablets", ctaLabel: "Shop tablets", href: "/categories/tablets", categorySlug: "tablets" };
    withEnv(JSON.stringify([ok]), () => expect(resolveBanners(cats)).toHaveLength(1));
    expect(parseBanners(JSON.stringify([{ ...ok, href: "https://evil.example" }]))).toEqual([]);
    expect(parseBanners(JSON.stringify([{ ...ok, href: "//evil.example" }]))).toEqual([]);
    expect(parseBanners("not json")).toEqual([]);
    expect(parseBanners(undefined)).toBeNull();
  });
});

import { budgetBands } from "@/lib/erp/catalogue";
import { faqItems } from "@/components/home/more-sections";

describe("budget bands", () => {
  it("derives distinct tidy thresholds from real prices", () => {
    const prices = [990, 1500, 3900, 5900, 7900, 8900, 11900, 14900, 24900, 34900, 64900, 89900, 199900];
    const b = budgetBands(prices)!;
    expect(b.under).toBeGreaterThan(0);
    expect(b.over).toBeGreaterThan(b.under);
    expect(b.under % 500).toBe(0);
    // every band must contain products so no tile leads to an empty page
    expect(prices.filter((p) => p <= b.under).length).toBeGreaterThan(0);
    expect(prices.filter((p) => p > b.under && p <= b.over).length).toBeGreaterThan(0);
    expect(prices.filter((p) => p >= b.over).length).toBeGreaterThan(0);
  });
  it("returns null for tiny or flat catalogues", () => {
    expect(budgetBands([1000, 2000, 3000])).toBeNull();
    expect(budgetBands([1000, 1000, 1000, 1000, 1000, 1000])).toBeNull();
  });
});

describe("FAQ copy", () => {
  it("uses live settings and makes no unsupported promises", () => {
    const text = JSON.stringify(faqItems({ cod: true, deliveryCharge: 450 }));
    expect(text).toContain("LKR 450");
    expect(text).toContain("cash on delivery");
    expect(text).not.toMatch(/same[- ]day|next[- ]day|free|guarantee[d]? (delivery|refund)|nationwide|warranty|within \d+/i);
    expect(JSON.stringify(faqItems({ cod: false, deliveryCharge: null }))).not.toContain("LKR");
  });
});

import { isNewArrival } from "@/lib/erp/product-utils";

describe("new arrival badge", () => {
  const now = Date.parse("2026-10-19T00:00:00Z");
  it("is true only for products published within the last 30 days", () => {
    expect(isNewArrival("2026-10-10T00:00:00Z", now)).toBe(true);
    expect(isNewArrival("2026-09-19T00:00:00Z", now)).toBe(true);
    expect(isNewArrival("2026-09-18T00:00:00Z", now)).toBe(false);
    expect(isNewArrival("2026-11-01T00:00:00Z", now)).toBe(false); // future dates are not "new"
    expect(isNewArrival(null, now)).toBe(false);
    expect(isNewArrival("garbage", now)).toBe(false);
  });
});

import { safeNext } from "@/lib/auth/safe-next";

describe("post-login redirect", () => {
  it("allows same-site paths only", () => {
    expect(safeNext("/checkout")).toBe("/checkout");
    expect(safeNext("/products?q=a&sort=name")).toBe("/products?q=a&sort=name");
    for (const bad of ["https://evil.example", "//evil.example", String.raw`/\evil.example`, "javascript:alert(1)", "/api/account/logout", "", null, undefined]) {
      expect(safeNext(bad)).toBe("/account");
    }
  });
});

import { parseVideos } from "@/lib/home-config";

describe("homepage videos config", () => {
  const ok = { id: "dQw4w9WgXcQ", title: "A real video title" };
  it("shows nothing unless real videos are configured", () => {
    expect(parseVideos(undefined)).toEqual([]);
    expect(parseVideos("")).toEqual([]);
    expect(parseVideos("not json")).toEqual([]);
    expect(parseVideos("[]")).toEqual([]);
  });
  it("accepts valid videos and optional channel/thumbnail", () => {
    expect(parseVideos(JSON.stringify([ok]))).toHaveLength(1);
    expect(parseVideos(JSON.stringify([{ ...ok, channel: "Us", thumbnail: "/images/t.jpg" }]))).toHaveLength(1);
    expect(parseVideos(JSON.stringify([{ ...ok, thumbnail: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg" }]))).toHaveLength(1);
  });
  it("rejects anything unsafe or malformed (whole list is dropped)", () => {
    for (const bad of [
      { ...ok, id: "short" },
      { ...ok, id: "dQw4w9WgXcQ/../x" },
      { ...ok, title: "x" },
      { ...ok, thumbnail: "https://evil.example/t.jpg" },
      { ...ok, thumbnail: "//evil.example/t.jpg" },
      { ...ok, thumbnail: "javascript:alert(1)" },
    ]) {
      expect(parseVideos(JSON.stringify([bad]))).toEqual([]);
    }
    expect(parseVideos(JSON.stringify(Array.from({ length: 5 }, (_, i) => ({ ...ok, id: `dQw4w9WgXc${i}` }))))).toEqual([]); // more than 4
  });
});
