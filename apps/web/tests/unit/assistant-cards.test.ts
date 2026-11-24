import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AssistantCards, AssistantEmpty, AssistantError, AssistantLoading, CartProposalConfirm, ProductCardView } from "@/components/assistant/cards";
import { labels } from "@/components/assistant/labels";
import type { CartAction, ComparisonCardData, ProductCardData } from "@/components/assistant/types";

const money = (amount: number, text: string) => ({ amount, text });
const phone: ProductCardData = {
  type: "product",
  id: "cm0item00000001",
  name: "Nova X1 Smartphone",
  brand: "Nova",
  price: money(129_900, "Rs. 129,900.00"),
  available: true,
  url: "/products/nova-x1",
  specs: [{ name: "Display", value: "6.7-inch AMOLED" }],
};
const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

describe("assistant product cards", () => {
  it("shows name, LKR price, the specs given, a demo label and a placeholder when there is no image", () => {
    const out = html(createElement(ProductCardView, { card: phone }));
    expect(out).toContain("Nova X1 Smartphone");
    expect(out).toContain("Rs. 129,900.00");
    expect(out).toContain("6.7-inch AMOLED");
    expect(out).toContain("Demo data");
    expect(out).toContain("In stock (demo)");
    expect(out).toContain('role="img"'); // the placeholder
    expect(out).not.toContain("<img");
  });

  it("marks availability as demo, and never shows a stock number or a warranty the data did not give", () => {
    const out = html(createElement(ProductCardView, { card: { ...phone, available: false } }));
    expect(out).toContain("Out of stock (demo)");
    expect(out).not.toMatch(/warranty|\d+ (units|left|in stock)/i);
  });

  it("uses the image and list price when the backend gives them, and escapes hostile text", () => {
    const out = html(createElement(ProductCardView, { card: { ...phone, name: '<script>alert(1)</script>', imageUrl: "/uploads/a.svg", listPrice: money(149_900, "Rs. 149,900.00"), offerName: "Launch offer" } }));
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
    expect(out).toContain('src="/uploads/a.svg"');
    expect(out).toContain("Rs. 149,900.00");
  });

  it("uses the blue primary and no storefront orange", () => {
    const out = html(createElement(CartProposalConfirm, { action: add(), productName: "Nova X1", onConfirm: vi.fn(), onCancel: vi.fn() }));
    expect(out).toContain("#2563EB");
  });
});

describe("comparison and dispatcher", () => {
  const cmp: ComparisonCardData = {
    type: "comparison",
    products: [phone, { ...phone, id: "cm0item00000002", name: "Orbit Pro Smartphone" }],
    rows: [
      { label: "Memory", values: ["16 GB", null], differs: true },
      { label: "Brand", values: ["Nova", "Orbit"], differs: true },
    ],
    priceDelta: money(70_000, "Rs. 70,000.00"),
  };
  it("shows a missing specification as unavailable, never a value", () => {
    const out = html(createElement(AssistantCards, { cards: [cmp] }));
    expect(out).toContain("Not available");
    expect(out).toContain("Rs. 70,000.00");
    expect(out).toContain("<table");
    expect(out).toContain('scope="row"');
  });

  it.each([2, 3, 4])("renders a comparison of %i products with a column each", (n) => {
    const products = Array.from({ length: n }, (_, i) => ({ ...phone, id: `p${i}`, name: `Product ${i}` }));
    const card: ComparisonCardData = { type: "comparison", products, rows: [{ label: "Brand", values: products.map(() => "Nova"), differs: false }] };
    const out = html(createElement(AssistantCards, { cards: [card] }));
    for (const p of products) expect(out).toContain(p.name);
    expect(out.match(/<th scope="col"/g)).toHaveLength(n);
  });

  it("renders each card type it knows and ignores the ones it does not own", () => {
    const out = html(createElement(AssistantCards, { cards: [phone, { type: "stock", productId: "x", available: false }, { type: "accessory", forProductId: "x", kind: "CHARGER", product: { ...phone, name: "Volt Charger" } }, { type: "order", ref: "VLK-1" }] }));
    expect(out).toContain("Volt Charger");
    expect(out).toContain('data-testid="stock-card"');
    expect(out).not.toContain("VLK-1");
  });
});

function add(over: Partial<Extract<CartAction, { type: "cart.add" }>> = {}): CartAction {
  return { type: "cart.add", actionId: "act_00000001", productId: "cm0item00000001", variantKey: "", quantity: 2, confirm: "ask", ...over };
}

describe("cart proposal confirmation", () => {
  it("asks first: shows the change, Confirm and Cancel, and calls nothing on render", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const out = html(createElement(CartProposalConfirm, { action: add(), productName: "Nova X1 Smartphone", onConfirm, onCancel }));
    expect(out).toContain("Please confirm this cart change");
    expect(out).toContain("Nothing changes in your cart until you confirm.");
    expect(out).toContain("Nova X1 Smartphone");
    expect(out).toContain("Confirm");
    expect(out).toContain("Cancel");
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("describes remove without a quantity, and set-quantity with it", () => {
    const rm = html(createElement(CartProposalConfirm, { action: { type: "cart.remove", actionId: "act_00000002", productId: "p", variantKey: "", confirm: "ask" }, productName: "Atlas Smartwatch", onConfirm: vi.fn(), onCancel: vi.fn() }));
    expect(rm).toContain("Remove from cart");
    expect(rm).not.toContain("Quantity");
    const set = html(createElement(CartProposalConfirm, { action: { type: "cart.setQuantity", actionId: "act_00000003", productId: "p", variantKey: "", quantity: 3, confirm: "ask" }, productName: "Atlas Smartwatch", onConfirm: vi.fn(), onCancel: vi.fn() }));
    expect(set).toContain("Change quantity");
    expect(set).toContain("<strong>3</strong>");
  });
});

describe("states and language", () => {
  it("has accessible loading, empty and error states", () => {
    expect(html(createElement(AssistantLoading, {}))).toContain('role="status"');
    expect(html(createElement(AssistantEmpty, {}))).toContain("No matching products");
    const err = html(createElement(AssistantError, { onRetry: vi.fn() }));
    expect(err).toContain('role="alert"');
    expect(err).toContain("Try again");
  });

  it("has a Sinhala label for every English label, with the demo notice kept", () => {
    const en = labels("en");
    const si = labels("si");
    for (const k of Object.keys(en) as (keyof typeof en)[]) {
      expect(si[k], k).toBeTruthy();
      // the brand name and the names of the languages are written the same in every language
      if (!["assistantName", "langEn", "langSi"].includes(k)) expect(si[k], k).not.toBe(en[k]);
    }
    expect(html(createElement(ProductCardView, { card: phone, lang: "si" }))).toContain(si.mock);
  });
});
