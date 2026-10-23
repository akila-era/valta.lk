import { describe, expect, it } from "vitest";
import { offerMatchesSelection, preferSpecificOffers, resolveAccessoryOffers } from "@/lib/accessories/resolve";
import { queryProducts } from "@/lib/erp/query";
import { mapProduct } from "@/lib/erp/product-mapper";
import { matchesSearch, productOffer, quantityCap, variantChoiceRequired } from "@/lib/erp/product-utils";
import { rawProductSchema, type ErpProduct } from "@/lib/erp/types";

const item = (over: Partial<ErpProduct> = {}): ErpProduct => ({
  id: "p1",
  slug: "phone-p1",
  name: "Nova X1",
  description: "",
  brand: "Nova",
  sku: "NX1",
  category: { slug: "phones", name: "Phones" },
  images: [],
  price: 1000,
  salePrice: null,
  specs: { Model: "X1" },
  variants: [],
  hasVariants: false,
  available: true,
  purchasableQuantity: 4,
  publishedAt: "2026-02-01T00:00:00.000Z",
  updatedAt: "2026-02-01T00:00:00.000Z",
  ...over,
});

describe("product search", () => {
  const products = [
    item(),
    item({ id: "case", slug: "case", name: "Clear Case", brand: "Orbit", sku: "CASE-1", specs: { Barcode: "9551234567890" }, category: { slug: "accessories", name: "Accessories" }, price: 1500 }),
    item({ id: "cable", slug: "cable", name: "USB Cable", brand: "Nova", sku: "CBL", specs: {}, category: { slug: "accessories", name: "Accessories" }, price: 900, content: { displayTitle: "USB Cable", subtitle: "", shortDescription: "", descriptionHtml: "", gallery: [], features: [], specs: [{ group: "", name: "EAN", value: "4006381333931", unit: "" }], badges: [], promoLabel: "", warranty: { duration: "", description: "", terms: "", provider: "", notes: "" }, delivery: { estimate: "", pickup: "", notes: "" }, seo: { title: "", description: "", noindex: false, ogImageId: null }, related: [] } }),
  ];

  it("matches name, brand, model, category, SKU and barcode fields that exist", () => {
    expect(queryProducts(products, { q: "nova" }).total).toBe(2);
    expect(queryProducts(products, { q: "x1" }).items.map((p) => p.id)).toEqual(["p1"]);
    expect(queryProducts(products, { q: "phones" }).items.map((p) => p.id)).toEqual(["p1"]);
    expect(queryProducts(products, { q: "CASE-1" }).items.map((p) => p.id)).toEqual(["case"]);
    expect(queryProducts(products, { q: "9551234567890" }).items.map((p) => p.id)).toEqual(["case"]);
    expect(queryProducts(products, { q: "4006381333931" }).items.map((p) => p.id)).toEqual(["cable"]);
    expect(queryProducts(products, { q: "zzzz" }).total).toBe(0);
    expect(matchesSearch(item(), "")).toBe(true);
  });

  it("does not treat an ordinary spec as a search identifier", () => {
    const colored = item({ specs: { Color: "Midnight" } });
    expect(matchesSearch(colored, "midnight")).toBe(false);
  });
});

describe("listing filters", () => {
  const products = [
    item({ id: "a", name: "A", brand: "Nova", price: 300, publishedAt: "2026-03-01T00:00:00.000Z" }),
    item({ id: "b", name: "B", brand: "Orbit", price: 100, salePrice: 80, publishedAt: "2026-01-01T00:00:00.000Z" }),
    item({ id: "c", name: "C", brand: "Nova", price: 200, available: false, purchasableQuantity: 0, publishedAt: "2026-02-01T00:00:00.000Z" }),
  ];

  it("filters by brand and stock, and sorts by price", () => {
    expect(queryProducts(products, { brand: "nova" }).items.map((p) => p.id)).toEqual(["a", "c"]);
    expect(queryProducts(products, { brand: "missing" }).total).toBe(0);
    expect(queryProducts(products, { inStockOnly: true }).total).toBe(2);
    expect(queryProducts(products, { onSale: true }).items.map((p) => p.id)).toEqual(["b"]);
    expect(queryProducts(products, { sort: "price-asc" }).items.map((p) => p.id)).toEqual(["b", "c", "a"]);
    expect(queryProducts(products, { sort: "name" }).items.map((p) => p.name)).toEqual(["A", "B", "C"]);
  });

  it("pages results and keeps brand counts for the current category", () => {
    const page = queryProducts(products, { page: 2, pageSize: 2, sort: "name" });
    expect(page.items.map((p) => p.id)).toEqual(["c"]);
    expect(page.pageCount).toBe(2);
    expect(page.brands).toEqual([
      { name: "Nova", count: 2 },
      { name: "Orbit", count: 1 },
    ]);
  });
});

describe("variant purchase rules", () => {
  it("requires an explicit choice only when more than one variant exists", () => {
    expect(variantChoiceRequired(0)).toBe(false);
    expect(variantChoiceRequired(1)).toBe(false);
    expect(variantChoiceRequired(2)).toBe(true);
  });

  it("caps quantity at live stock and at least 1", () => {
    expect(quantityCap(3, 10)).toBe(3);
    expect(quantityCap(40, 10)).toBe(10);
    expect(quantityCap(0, 10)).toBe(1);
  });
});

describe("accessory variant links", () => {
  const phone = item({ id: "phone", variants: [{ key: "black", label: "Black", price: 1000, salePrice: null, available: true, purchasableQuantity: 2 }], hasVariants: true });
  const cover = item({ id: "cover", name: "Cover", slug: "cover", price: 500 });

  it("keeps a variant-specific link off other configurations", () => {
    const offers = resolveAccessoryOffers(
      [
        { sourceItemId: "phone", accessoryItemId: "cover", kind: "BACK_COVER", sourceVariantKey: "black" },
        { sourceItemId: "phone", accessoryItemId: "cover", kind: "BACK_COVER", sourceVariantKey: "" },
      ],
      new Map([["phone", phone], ["cover", cover]]),
    );
    expect(offers).toHaveLength(2);
    const selected = preferSpecificOffers(offers.filter((o) => offerMatchesSelection(o, [{ productId: "phone", variantKey: "black" }])));
    const other = preferSpecificOffers(offers.filter((o) => offerMatchesSelection(o, [{ productId: "phone", variantKey: "blue" }])));
    const unset = preferSpecificOffers(offers.filter((o) => offerMatchesSelection(o, [{ productId: "phone", variantKey: "" }])));
    expect(selected.map((o) => o.sourceVariantKey)).toEqual(["black"]);
    expect(other.map((o) => o.sourceVariantKey)).toEqual([""]);
    expect(unset.map((o) => o.sourceVariantKey)).toEqual([""]);
  });
});

describe("catalogue barcode mapping", () => {
  it("stores a barcode only when the ERP payload includes one", () => {
    const raw = rawProductSchema.parse({
      id: "cm0item00000001", name: "Phone", price: "10.00", availability: "IN_STOCK", purchasableQuantity: 1, updatedAt: "2026-01-01T00:00:00Z",
      barcode: " 955000 ",
      images: [
        { url: "https://cdn.example/a.jpg" },
        { url: "https://cdn.example/b.jpg" },
      ],
    });
    const mapped = mapProduct(raw, null);
    expect(mapped.barcode).toBe("955000");
    expect(mapped.specs.Barcode).toBe("955000");
    expect(mapped.images).toHaveLength(2);
  });
});

describe("product structured data", () => {
  it("uses one offer when every variant has the same price", () => {
    const offer = productOffer({ available: true, price: 100, variants: [{ price: 100 }, { price: 100 }] });
    expect(offer).toMatchObject({ "@type": "Offer", price: 100, availability: "https://schema.org/InStock" });
  });

  it("publishes a price range when variants differ, and out of stock when unavailable", () => {
    const offer = productOffer({ available: false, price: 100, salePrice: 80, variants: [{ price: 100, salePrice: 90 }, { price: 150 }] });
    expect(offer).toEqual({
      "@type": "AggregateOffer",
      priceCurrency: "LKR",
      lowPrice: 90,
      highPrice: 150,
      offerCount: 2,
      availability: "https://schema.org/OutOfStock",
    });
  });
});
