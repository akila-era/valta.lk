import { describe, expect, it } from "vitest";
import { MIN_MARGIN, MIN_SCORE } from "../../src/router/router";
import type { RouteContext } from "../../src/router/types";
import { route } from "../eval/harness";
import { itemId } from "../fixtures/mock-vocab";

const ctx = (over: Partial<RouteContext> = {}): RouteContext => ({ lastShownProductIds: [], cart: [], ...over });
const NOVA_X1 = itemId(1);
const ORBIT_PRO = itemId(2);

describe("tool plans (arguments are built by code, never by a model)", () => {
  it("builds a search from a Sinhala/English message", () => {
    const d = route("රුපියල් 100,000ට අඩු හොඳ phone එකක් පෙන්වන්න");
    expect(d).toMatchObject({ intent: "search_products", action: "tool" });
    expect(d.calls).toEqual([{ name: "search_products", arguments: { inStockOnly: true, category: "mobile-phones", maxPriceLkr: 100000 } }]);
  });

  it("uses a specific search word and a known brand", () => {
    expect(route("show me chargers").calls[0]?.arguments).toMatchObject({ category: "accessories", query: "charger" });
    expect(route("Nova phones පෙන්වන්න").calls[0]?.arguments).toMatchObject({ category: "mobile-phones", brand: "Nova" });
  });

  it("treats a named accessory product as a product, not as an accessories question", () => {
    expect(route("Volt charger එක ගැන කියන්න")).toMatchObject({ intent: "get_product_details", calls: [{ name: "get_product_details", arguments: { productId: itemId(5) } }] });
    expect(route("What accessories fit the Nova X1?").intent).toBe("get_accessories");
  });

  it("passes an unknown brand through as a search term instead of dropping it", () => {
    expect(route("Samsung phone එකක් තියෙනවද?").calls[0]?.arguments).toMatchObject({ query: "samsung", category: "mobile-phones" });
  });

  it("builds details, stock, accessories and compare calls from named products", () => {
    expect(route("Nova X1 එකේ camera එක කොහොමද?").calls).toEqual([{ name: "get_product_details", arguments: { productId: NOVA_X1 } }]);
    expect(route("Is the Nova X1 in stock?").calls).toEqual([{ name: "check_stock", arguments: { productId: NOVA_X1 } }]);
    expect(route("What accessories fit the Nova X1?").calls).toEqual([{ name: "get_accessories", arguments: { productId: NOVA_X1 } }]);
    expect(route("Compare Nova X1 and Orbit Pro").calls).toEqual([{ name: "compare_products", arguments: { productIds: [NOVA_X1, ORBIT_PRO] } }]);
  });

  it("resolves 'this one' from the page, then from the last shown product", () => {
    expect(route("මේ phone එකේ specs මොනවාද?", ctx({ contextProductId: ORBIT_PRO })).calls[0]?.arguments).toEqual({ productId: ORBIT_PRO });
    expect(route("මේක තොගේ තියෙනවද?", ctx({ lastShownProductIds: [NOVA_X1] })).calls[0]?.arguments).toEqual({ productId: NOVA_X1 });
    expect(route("මේ දෙකෙන් මොකක්ද හොඳ?", ctx({ lastShownProductIds: [NOVA_X1, ORBIT_PRO] })).calls[0]?.arguments).toEqual({ productIds: [NOVA_X1, ORBIT_PRO] });
  });

  it("picks the variant a colour or storage choice identifies, and asks when it is not unique", () => {
    const blue = route("Nova X1 blue එක cart එකට දාන්න");
    expect(blue.calls[0]).toEqual({ name: "add_to_cart", arguments: { productId: NOVA_X1, quantity: 1, variantKey: "256GB::Blue" } });
    const black = route("Nova X1 black එක cart එකට දාන්න");
    expect(black).toMatchObject({ action: "clarify", template: "clarify_variant", reason: "variant_required" }); // two black storage sizes
    expect(route("Nova X1 cart එකට දාන්න")).toMatchObject({ action: "clarify", template: "clarify_variant" });
    expect(route("Orbit Pro cart එකට දාන්න").calls[0]?.arguments).toEqual({ productId: ORBIT_PRO, quantity: 1 }); // single-variant product
  });

  it("resolves a cart removal from the cart contents", () => {
    const cart = [{ productId: itemId(5), variantKey: "", quantity: 1 }, { productId: itemId(8), variantKey: "", quantity: 1 }];
    expect(route("cart එකෙන් charger එක අයින් කරන්න", ctx({ cart })).calls).toEqual([{ name: "remove_from_cart", arguments: { productId: itemId(5), variantKey: "" } }]);
    expect(route("cart එකෙන් charger එක අයින් කරන්න", ctx())).toMatchObject({ intent: "cart_remove", action: "clarify" }); // empty cart: ask
  });

  it("reads a cart quantity change", () => {
    const cart = [{ productId: itemId(8), variantKey: "", quantity: 1 }];
    expect(route("change the quantity of the Atlas Smartwatch to 3", ctx({ cart })).calls).toEqual([{ name: "update_cart_quantity", arguments: { productId: itemId(8), variantKey: "", quantity: 3 } }]);
  });

  it("answers delivery-charge questions through the cart quote and other store questions with a fixed text", () => {
    expect(route("Delivery charge කීයද?")).toMatchObject({ action: "tool", calls: [{ name: "get_cart", arguments: {} }], topic: "delivery_charge" });
    expect(route("How many days for delivery")).toMatchObject({ action: "static", template: "store_info_other", topic: "other" });
  });

  it("passes a valid order reference to the order tool", () => {
    expect(route("where is my order VLK-261012-ABCDEFGHJK").calls).toEqual([{ name: "get_order_status", arguments: { ref: "VLK-261012-ABCDEFGHJK" } }]);
    expect(route("where is my order").calls).toEqual([{ name: "get_order_status", arguments: {} }]);
  });
});

describe("hand-offs: the assistant never places orders, takes payment or cancels", () => {
  it("sends checkout and payment to the checkout page", () => {
    for (const s of ["I want to place an order", "can I pay now", "ඇණවුමක් කරන්න ඕන", "checkout"]) {
      expect(route(s), s).toMatchObject({ intent: "checkout_handoff", action: "handoff", navigate: "/checkout", calls: [] });
    }
  });
  it("sends cancellations and refunds to Track order", () => {
    for (const s of ["cancel my order", "මට ඇණවුම අවලංගු කරන්න ඕන", "refund eka denna"]) {
      expect(route(s), s).toMatchObject({ intent: "order_support", action: "handoff", navigate: "/track-order", calls: [] });
    }
  });
});

describe("fail closed: abstain and ask rather than guess", () => {
  it("abstains when evidence is weak, with an explicit reason", () => {
    for (const s of ["ඒක", "asdf qwerty", "What's the weather today?", "මට 2 ක් ඕන", "", "   "]) {
      const d = route(s);
      expect(d, s).toMatchObject({ intent: "unknown", action: "clarify", template: "clarify_what", calls: [] });
      expect(["below_min_score", "below_min_margin"]).toContain(d.reason);
    }
  });

  it("asks which product when a name is ambiguous, and never picks one", () => {
    const d = route("Echo speaker එකේ battery කොච්චරද?");
    expect(d).toMatchObject({ intent: "get_product_details", action: "clarify", template: "clarify_ambiguous_product", calls: [] });
  });

  it("asks which product when none is named and no context exists", () => {
    expect(route("මේ phone එකේ specs මොනවාද?")).toMatchObject({ action: "clarify", template: "clarify_product", calls: [] });
    expect(route("compare these")).toMatchObject({ action: "clarify", template: "clarify_two_products", calls: [] });
  });

  it("asks for the budget as a number when the amount cannot be read", () => {
    expect(route("රුපියල් හැට දාහකට වඩා අඩු ෆෝන් එකක් තියෙනවද")).toMatchObject({ action: "clarify", template: "clarify_budget", calls: [] });
  });

  it("does not search without any constraint", () => {
    expect(route("show me")).toMatchObject({ action: "clarify", calls: [] });
  });

  it("requires a minimum score and a margin, and reports them", () => {
    expect(MIN_SCORE).toBe(3);
    expect(MIN_MARGIN).toBe(1);
    const d = route("Show me phones under 150000 rupees");
    expect(d.confidence.score).toBeGreaterThanOrEqual(MIN_SCORE);
    expect(d.confidence.margin).toBeGreaterThanOrEqual(MIN_MARGIN);
  });
});

describe("a read request is never turned into a cart change", () => {
  it("keeps ordinary shopping questions away from cart intents", () => {
    for (const s of ["Show me phones under 150000 rupees", "Compare Nova X1 and Orbit Pro", "Is the Nova X1 in stock?", "Tell me about the Atlas Smartwatch", "What accessories fit the Nova X1?", "Delivery charge කීයද?", "මේ දෙකෙන් මොකක්ද හොඳ?"]) {
      expect(route(s).intent.startsWith("cart_"), s).toBe(false);
    }
  });
});

describe("robustness", () => {
  it("never throws and always returns a decision, on odd input", () => {
    const odd = ["\u0000\u0000", "👍👍", "a".repeat(5000), "ශ්‍රී ".repeat(1000), "))))((((", "1 2 3 4 5", "\n\n\n", "<>&\"'", "null", "undefined", "NaN"];
    for (const s of odd) expect(() => route(s), s.slice(0, 20)).not.toThrow();
  });

  it("is fast", () => {
    const t0 = Date.now();
    for (let i = 0; i < 500; i++) route("Nova X1 සහ Orbit Pro අතර වෙනස මොකක්ද? රුපියල් 100,000ට අඩු");
    expect(Date.now() - t0).toBeLessThan(2000);
  });
});
