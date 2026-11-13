import { describe, expect, it } from "vitest";
import { createMockStack } from "../../src/mock/stack";
import { renderTemplate } from "../../src/router/templates";
import { route } from "../eval/harness";
import { run } from "../fixtures/pipeline-helpers";

/** M3-B: the scope guard (external sites and general requests), co-occurrence frames, and what the pipeline does with them. */
describe("external websites and search engines are refused, never turned into shopping tools", () => {
  it.each([
    "Open Google and search for this product",
    "go to daraz and check the price there",
    "check the price on another website for me",
    "search on amazon",
    "look it up on youtube",
    "ගූගල් එකේ සර්ච් කරලා බලන්න",
    "Google එකේ search කරලා බලන්න",
    "wena website ekakin mila balanna",
    "වෙනත් වෙබ් අඩවියක මිල බලන්න",
    "compare with other online stores",
  ])("%s", (message) => {
    const d = route(message);
    expect(d).toMatchObject({ intent: "external_site", action: "static", template: "external_site_refused", calls: [] });
  });

  it("a product that merely contains a site's name is still a product question", () => {
    for (const m of ["do you have the Google Pixel", "Google Pixel eka thiyenawada", "Nova X1 එක Amazon එකේ ඇති මිලටම ගන්න පුළුවන්ද"]) {
      expect(route(m).intent, m).not.toBe("external_site");
    }
  });

  it("the pipeline answers with the fixed refusal, runs no tool, shows no card, and flags Sinhala for native review", async () => {
    const s = createMockStack();
    const en = await run(s.pipeline, "Open Google and search for this product");
    expect(en.result.reply.text).toBe(renderTemplate("external_site_refused", "en").text);
    expect(en.result.cards).toEqual([]);
    expect(en.result.actions).toEqual([]);
    expect(en.result.needsNativeReview).toBe(false);
    const si = await run(s.pipeline, "ගූගල් එකේ සර්ච් කරලා බලන්න");
    expect(si.result.reply.text).toBe(renderTemplate("external_site_refused", "si").text);
    expect(si.result.needsNativeReview).toBe(true);
    for (const t of ["en", "si"] as const) expect(renderTemplate("external_site_refused", t).text).not.toMatch(/\d|https?:/);
  });
});

describe("general requests stay away from the shopping tools", () => {
  it.each(["What's the weather today?", "tell me a joke", "Can you explain how a database index works?", "Write a professional email for me", "Python වල loop එකක් කොහොමද ලියන්නේ", "mata birthday wish ekak liyala denna", "මට සුභ පැතුම් පණිවිඩයක් ලියලා දෙන්න"])("%s", (message) => {
    const d = route(message);
    expect(d.intent).toBe("general");
    expect(d.action).toBe("clarify");
    expect(d.calls).toEqual([]);
  });

  it("a catalogue anchor or a strong shopping cue keeps a message a shopping message", () => {
    expect(route("Explain the difference between the Nova X1 and the Orbit Pro").intent).toBe("compare_products");
    expect(route("what is the price of this phone").intent).toBe("get_product_details");
    expect(route("how do I pay").intent).toBe("checkout_handoff");
    expect(route("How do I reset my password").intent).not.toBe("general");
    expect(route("Show me phones under 100000 rupees and explain which is best").intent).toBe("search_products");
  });

  it("never plans a tool for external or general requests, whatever the wording (property check over generated sentences)", () => {
    const starts = ["write", "explain", "tell me", "teach me", "open google", "go to amazon", "search daraz", "check another website", "liyanna", "පැහැදිලි කරන්න"];
    const mids = ["about", "how", "why", "something", "for me", "please", "quickly", "ගැන", "eka"];
    const ends = ["a poem", "python", "an email", "the moon", "my homework", "sql joins", "a speech", "ජාවා", "history"];
    for (const a of starts) for (const b of mids) for (const c of ends) {
      const d = route(`${a} ${b} ${c}`);
      if (d.intent === "external_site" || d.intent === "general") expect(d.calls, `${a} ${b} ${c}`).toEqual([]);
    }
  });
});

describe("paraphrase frames", () => {
  it.each([
    ["my parcel still hasn't turned up", "order_status"],
    ["when will my package arrive", "order_status"],
    ["mage parcel eka koheda", "order_status"],
    ["මගේ ඇණවුම තාම ආවේ නෑ", "order_status"],
    ["I want to stop my order", "order_support"],
    ["I'm ready to pay", "checkout_handoff"],
    ["payment එක කරන්න ඕන", "checkout_handoff"],
    ["put this in my basket please", "cart_add"],
    ["මේක කරත්තයට දාන්න", "cart_add"],
    ["take that out of my cart", "cart_remove"],
    ["කරත්තයෙන් ඒක ඉවත් කරන්න", "cart_remove"],
    ["show me everything in my cart", "cart_view"],
    ["what have I got in my basket", "cart_view"],
    ["Do you sell cases that fit this phone?", "get_accessories"],
    ["මේ ෆෝන් එකට චාජර් එකක් තියෙනවද", "get_accessories"],
    ["is the red one available", "check_stock"],
    ["Can I buy this today or is it sold out?", "check_stock"],
    ["which of these two lasts longer", "compare_products"],
    ["how are they different", "compare_products"],
    ["what's just come in?", "search_products"],
    ["lowest priced headphones", "search_products"],
    ["how long is the warranty", "store_info"],
    ["how much do you charge for delivery", "store_info"],
    ["cheers, that's all", "smalltalk"],
  ])("%s -> %s", (message, intent) => expect(route(message).intent).toBe(intent));

  it("a quantity change without the word cart only counts when the cart has items", () => {
    expect(route("make it two instead of one").intent).not.toBe("cart_update_quantity");
    const withCart = route("make it two instead of one", { lastShownProductIds: [], cart: [{ productId: "p1", variantKey: "", quantity: 1 }] });
    expect(withCart.intent).toBe("cart_update_quantity");
  });

  it("Singlish long vowels meet: laabama, keeyada, and onee all match their short forms", () => {
    expect(route("laabama phone eka monawada").intent).toBe(route("labama phone eka monawada").intent);
    expect(route("eke mila keeyada").intent).toBe("get_product_details");
  });
});
