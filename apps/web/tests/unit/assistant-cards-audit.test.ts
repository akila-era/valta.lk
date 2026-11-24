import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AssistantCards, ComparisonView, ProductCardView } from "@/components/assistant/cards";
import { labels } from "@/components/assistant/labels";
import type { ComparisonCardData, ProductCardData } from "@/components/assistant/types";

/** Audit of the recommendation cards and the comparison view (contract 1.1: up to 4 products; 1.2: `fit` chips). Static markup only: no browser. */
const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);
const product = (over: Partial<ProductCardData> = {}): ProductCardData => ({ type: "product", id: "p1", name: "Lumen P2 Pro Smartphone", price: { amount: 149000, text: "Rs. 149,000.00" }, available: true, url: "/products/lumen-p2-pro", ...over });
const cmp = (n: number, over: Partial<ComparisonCardData> = {}): ComparisonCardData => ({
  type: "comparison",
  products: Array.from({ length: n }, (_, i) => product({ id: `p${i}`, name: `Product ${i}` })),
  rows: [{ label: "Price", values: Array.from({ length: n }, (_, i) => `Rs. ${i}`), differs: true }],
  ...over,
});

describe("product card", () => {
  it("shows name, price, stock and a link, and survives a very long name and missing optional data", () => {
    const longName = "Ultra-Extended-Edition-Gaming-Laptop-".repeat(8) + "X";
    const out = html(createElement(ProductCardView, { card: product({ name: longName }), demo: false }));
    expect(out).toContain("break-words"); // the title wraps instead of overflowing a 26rem panel
    expect(out).toContain('href="/products/lumen-p2-pro"');
    expect(out).toContain("Rs. 149,000.00");
    expect(out).toContain("In stock");
    expect(out).toContain('role="img"'); // no imageUrl: the labelled placeholder, not a broken image
  });

  it("announces the original price of a discounted product instead of leaving a bare struck-through number", () => {
    const out = html(createElement(ProductCardView, { card: product({ listPrice: { amount: 169000, text: "Rs. 169,000.00" }, offerName: "Launch offer" }), demo: false }));
    expect(out).toContain("Original price: ");
    expect(out).toContain("<s ");
    expect(out).toContain("Launch offer");
  });

  it("names its list of fit reasons for assistive technology and shows only codes it has words for", () => {
    const out = html(createElement(ProductCardView, { card: product({ fit: { reasons: ["within_budget", "made_up_code"], tradeoffs: ["over_budget"] } }), demo: false }));
    expect(out).toContain('aria-label="Why this product may suit you"');
    expect(out).toContain("Within your budget");
    expect(out).toContain("Above your budget");
    expect(out).not.toContain("made_up_code");
    expect(html(createElement(ProductCardView, { card: product({ fit: { reasons: [], tradeoffs: [] } }), demo: false }))).not.toContain('data-testid="fit-codes"');
    expect(html(createElement(ProductCardView, { card: product(), demo: false }))).not.toContain('data-testid="fit-codes"');
  });

  it("has Sinhala wording for the new labels", () => {
    const si = labels("si");
    expect(si.originalPrice).not.toBe(labels("en").originalPrice);
    expect(si.fitWhy).not.toBe(labels("en").fitWhy);
    expect(si.compareFeature).not.toBe(labels("en").compareFeature);
  });
});

describe("comparison view", () => {
  it("renders 2, 3 and 4 products with one column each, a labelled corner cell and scoped headers", () => {
    for (const n of [2, 3, 4]) {
      const out = html(createElement(ComparisonView, { card: cmp(n), demo: false }));
      expect(out.match(/<th scope="col"/g), `n=${n}`).toHaveLength(n);
      expect(out).toContain('<span class="sr-only">Feature</span>'); // the empty top-left cell now has a name for screen readers
      expect(out).toContain('<th scope="row"');
    }
  });

  it("gives 3 and 4 products a wider scrollable table on a phone than 2", () => {
    expect(html(createElement(ComparisonView, { card: cmp(2), demo: false }))).toContain("min-w-[20rem]");
    expect(html(createElement(ComparisonView, { card: cmp(3), demo: false }))).toContain("min-w-[26rem]");
    expect(html(createElement(ComparisonView, { card: cmp(4), demo: false }))).toContain("min-w-[26rem]");
    expect(html(createElement(ComparisonView, { card: cmp(4), demo: false }))).toContain("overflow-x-auto");
  });

  it("tells a phone shopper to swipe when there are 3 or 4 products (a hidden column was found in the visual review), and not for 2", () => {
    expect(html(createElement(ComparisonView, { card: cmp(2), demo: false }))).not.toContain("comparison-scroll-hint");
    for (const n of [3, 4]) {
      const out = html(createElement(ComparisonView, { card: cmp(n), demo: false }));
      expect(out).toContain('data-testid="comparison-scroll-hint"');
      expect(out).toContain("Swipe sideways to see every product");
      expect(out).toContain("sm:hidden"); // only on a phone: on a wide panel the whole table fits
    }
    expect(html(createElement(ComparisonView, { card: cmp(3), lang: "si", demo: false }))).toContain(labels("si").compareScrollHint);
  });

  it("wraps long product names and long values instead of overflowing", () => {
    const long = "Ultra-Extended-Edition-Gaming-Laptop-".repeat(6);
    const c = cmp(2, { products: [product({ id: "a", name: long }), product({ id: "b", name: "B" })], rows: [{ label: "Notes", values: [long, null], differs: true }] });
    const out = html(createElement(ComparisonView, { card: c, demo: false }));
    expect(out).toContain("break-words");
    expect(out).toContain("Not available"); // a missing value is words, not an empty cell
  });

  it("does not break when two rows share a label (no duplicate React keys)", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const c = cmp(2, { rows: [{ label: "Colour", values: ["Black", "Blue"], differs: true }, { label: "Colour", values: ["Black", "Blue"], differs: true }] });
    html(createElement(ComparisonView, { card: c, demo: false }));
    expect(err.mock.calls.flat().join(" ")).not.toContain("same key");
    err.mockRestore();
  });

  it("is reached through the card dispatcher, and unknown card types render nothing", () => {
    const out = html(createElement(AssistantCards, { cards: [cmp(2), { type: "cart" } as never, { type: "order" } as never], demo: false }));
    expect(out).toContain('data-testid="comparison-card"');
    expect(out.match(/data-testid="/g)).toHaveLength(1);
  });
});
