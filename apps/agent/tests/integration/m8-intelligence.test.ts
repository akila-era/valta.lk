import { describe, expect, it } from "vitest";
import { createToolRegistry, toOllamaTools } from "../../src/tools/definitions";
import { detectLanguage } from "../../src/router/language";
import { normalizeMatch } from "../../src/router/normalize";
import { routeMessage } from "../../src/router/router";
import { pickVariant, renderTemplate, TEMPLATE_KEYS } from "../../src/router/templates";
import type { RouteContext } from "../../src/router/types";
import { rankProducts } from "../../src/reasoning/ranking";
import { extractUsages } from "../../src/reasoning/usage";
import { createMockStack } from "../../src/mock/stack";
import { M8_DEV_SET } from "../bench/m8-intelligence/dev-set";
import { METRICS, runAll, summarise } from "../bench/m8-intelligence/evaluate";
import { createStubBackend } from "../fixtures/stub-backend";
import { MOCK_VOCAB } from "../fixtures/mock-vocab";
import { RichTransport, richSite } from "../fixtures/rich-catalogue";

const ctx = (c: Partial<RouteContext> = {}): RouteContext => ({ lastShownProductIds: [], cart: [], ...c });
const route = (text: string, c: Partial<RouteContext> = {}) => routeMessage({ matchText: normalizeMatch(text), rawText: text, vocab: MOCK_VOCAB, context: ctx(c) });

describe("M8: the DEV set must not regress (DEV only: it was tuned on, so this guards behaviour, it is not held-out evidence)", () => {
  it("holds every measured metric except wording variety at 100%", async () => {
    const res = await runAll(M8_DEV_SET);
    const rep = summarise(res);
    const failing = res.filter((r) => Object.entries(r.checks).some(([m, ok]) => ok === false && m !== "variety")).map((r) => `${r.scenario}#${r.turn}: ${r.failures.join(" | ")}`);
    expect(failing).toEqual([]);
    for (const m of METRICS.filter((x) => x !== "variety")) expect(rep[m].passed, m).toBe(rep[m].applicable);
    // Wording variety needs the pipeline to say what the last reply was (RouteContext.lastTemplate); until it does, repetition is measured, not hidden.
    expect(rep.variety.applicable).toBe(6);
  });
});

describe("M8: language detection no longer counts ordinary English words as Singlish", () => {
  it("keeps English requests English", () => {
    for (const t of ["tell me about the third one", "I don't like this one, show me another phone", "show me the one under 50000", "ok show me phones"]) expect(detectLanguage(t).script, t).toBe("en");
  });
  it("still recognises Singlish, including words it used to miss", () => {
    for (const t of ["bohoma sthuthiyi", "mama wadiyenma photo gahanawa", "meka epa", "thawa pennanna", "labtop ekak oni"]) expect(detectLanguage(t).script, t).toBe("si-latin");
  });
});

describe("M8: a misspelled use is still understood, a different word is not mistaken for one", () => {
  it("reads one-letter misspellings of long usage words", () => {
    expect(extractUsages("labtop for gamming")).toEqual(["gaming"]);
    expect(extractUsages("good batary phone")).toEqual(["battery"]);
    expect(extractUsages("for photograpy")).toEqual(["camera"]);
  });
  it("does not read unrelated words", () => {
    for (const t of ["show me phones", "samsung phones", "something for camping", "a phone for my sister", "studio lights"]) expect(extractUsages(t), t).toEqual([]);
  });
});

describe("M8: follow-up rules (router level, fixed context)", () => {
  const shown: Partial<RouteContext> = { lastShownProductIds: ["a", "b"], lastResultIds: ["a", "b"], lastIntent: "search_products", slots: { category: "mobile-phones", budgetMaxLkr: 100000 } };
  it("'cheaper' means cheaper than the top product shown, asked of the catalogue, and keeps the category", () => {
    const d = route("something cheaper please", { ...shown });
    expect(d.reason).toBe("relative_price");
    expect(d.calls[0]!.arguments).toMatchObject({ category: "mobile-phones", cheaperThanId: "a" });
  });
  it("'show me more' leaves out what was shown and keeps the search", () => {
    const d = route("show me more", { ...shown });
    expect(d.reason).toBe("other_results");
    expect(d.calls[0]!.arguments).toMatchObject({ category: "mobile-phones", maxPriceLkr: 100000, excludeIds: ["a", "b"] });
  });
  it("a rule that needs context does nothing without it", () => {
    expect(route("something cheaper please").reason).not.toBe("relative_price");
    expect(route("show me more").reason).not.toBe("other_results");
  });
  it("a spec question about the one product shown is its details, not a greeting", () => {
    const d = route("battery eka kohomada", { lastShownProductIds: ["a"] });
    expect(d.reason).toBe("spec_question");
    expect(d.calls[0]).toEqual({ name: "get_product_details", arguments: { productId: "a" } });
    // R0: with no product in front of the shopper "battery eka kohomada" is a question about a product, not "how are you": the assistant asks which product.
    const noProduct = route("battery eka kohomada");
    expect(noProduct.intent).toBe("get_product_details");
    expect(noProduct.template).toBe("clarify_product");
  });
  it("'I want to buy a phone' is a search; an explicit cart word still adds to the cart", () => {
    expect(route("hello, I want to buy a phone").intent).toBe("search_products");
    expect(route("add a charger to my cart").intent).toBe("cart_add");
  });
  it("a bare position means that product; 'the first one I mentioned' is the earliest discussed", () => {
    expect(route("the second one", { lastShownProductIds: ["a", "b"], lastResultIds: ["a", "b"] }).calls[0]).toEqual({ name: "get_product_details", arguments: { productId: "b" } });
    expect(route("mulinma kiyapu eka", { lastShownProductIds: ["c"], discussedIds: ["c", "b", "a"] }).calls[0]).toEqual({ name: "get_product_details", arguments: { productId: "a" } });
  });
  it("'compare the first and the last one' compares those two positions", () => {
    const d = route("compare the first and the last one", { lastShownProductIds: ["a", "b", "c"], lastResultIds: ["a", "b", "c"] });
    expect(d.calls[0]).toEqual({ name: "compare_products", arguments: { productIds: ["a", "c"] } });
  });
  it("a changed budget is a refinement of the last search", () => {
    const d = route("actually make it 60000", { lastIntent: "search_products", slots: { category: "mobile-phones", budgetMaxLkr: 100000 } });
    expect(d.reason).toBe("budget_follow_up");
    expect(d.calls[0]!.arguments).toMatchObject({ category: "mobile-phones", maxPriceLkr: 60000 });
  });
  it("greeting and thanks are worded differently the second time in a row, when the previous reply is known", () => {
    expect(route("thanks").template).toBe("thanks");
    expect(route("thanks again", { lastTemplate: "thanks" }).template).toBe("thanks_again");
    expect(route("hello", { lastTemplate: "greeting" }).template).toBe("greeting_again");
    expect(route("hello", { lastTemplate: "thanks" }).template).toBe("greeting");
  });
});

describe("M8: refinement search arguments are internal, bounded and hidden from the model", () => {
  it("does not show cheaperThanId, pricierThanId or excludeIds to the model", () => {
    const tools = toOllamaTools(createToolRegistry(createStubBackend().backend), "guest");
    const search = tools.find((t) => t.function.name === "search_products")!;
    const props = Object.keys((search.function.parameters as { properties: Record<string, unknown> }).properties);
    expect(props.sort()).toEqual(["brand", "category", "inStockOnly", "limit", "maxPriceLkr", "minPriceLkr", "onSale", "query", "sort"].sort());
  });
  it("still validates them strictly", () => {
    const def = createToolRegistry(createStubBackend().backend).get("search_products")!;
    expect(def.args.safeParse({ category: "mobile-phones", cheaperThanId: "ph01", excludeIds: ["ph02"] }).success).toBe(true);
    expect(def.args.safeParse({ excludeIds: Array.from({ length: 13 }, (_, i) => `p${i}`) }).success).toBe(false);
    expect(def.args.safeParse({ cheaperThanId: "bad id with spaces" }).success).toBe(false);
  });
});

describe("M8: template variants are registered, fact-free and rotate", () => {
  it("rotates through registered variants with different wording", () => {
    const keys = [0, 1, 2].map((n) => pickVariant("recommend_intro", n));
    expect(new Set(keys).size).toBe(3);
    expect(pickVariant("recommend_intro", 3)).toBe(keys[0]);
    expect(pickVariant("recommend_intro", -1)).toBe(keys[2]);
    expect(pickVariant("browse_categories", 5)).toBe("browse_categories");
    for (const k of ["recommend_intro", "recommend_intro_b", "recommend_intro_c", "greeting", "greeting_again", "thanks", "thanks_again"] as const) {
      expect(TEMPLATE_KEYS).toContain(k);
      for (const l of ["en", "si"] as const) expect(renderTemplate(k, l).text).not.toMatch(/\d|Rs\b|LKR/);
    }
    expect(new Set(keys.map((k) => renderTemplate(k, "en").text)).size).toBe(3);
  });
});

describe("M8: storage is a weak tie-breaker for uses with no deciding number, and does nothing without data", () => {
  const base = async () => (await createMockStack({ transport: new RichTransport(), site: richSite(), catalogueTtlMs: 0 }).catalogue.listing("guest")).find((v) => v.id === "lp01")!;
  const profile = { usage: ["office" as const] };
  it("prefers the larger listed storage when everything else is equal", async () => {
    const lp = await base();
    const a = { ...lp, id: "x-small", name: "A laptop", specs: [{ name: "Storage", value: "256 GB" }] };
    const b = { ...lp, id: "x-big", name: "B laptop", specs: [{ name: "Storage", value: "512 GB" }] };
    expect(rankProducts([a, b], profile).ranked.map((r) => r.product.id)).toEqual(["x-big", "x-small"]);
  });
  it("changes nothing when sizes are not listed, or only one product lists one", async () => {
    const lp = await base();
    const a = { ...lp, id: "y1", name: "A laptop", specs: [] };
    const b = { ...lp, id: "y2", name: "B laptop", specs: [] };
    const c = { ...lp, id: "y3", name: "C laptop", specs: [{ name: "Storage", value: "512 GB" }] };
    expect(rankProducts([a, b], profile).ranked.map((r) => r.product.id)).toEqual(["y1", "y2"]);
    expect(rankProducts([a, c], profile).ranked.map((r) => r.product.id)).toEqual(["y1", "y3"]);
  });
  it("makes no fit claim about storage (the fit code set is unchanged)", async () => {
    const lp = await base();
    const a = { ...lp, id: "z1", name: "A laptop", specs: [{ name: "Storage", value: "256 GB" }] };
    const b = { ...lp, id: "z2", name: "B laptop", specs: [{ name: "Storage", value: "512 GB" }] };
    for (const r of rankProducts([a, b], profile).ranked) expect([...r.fit.reasons, ...r.fit.tradeoffs].join(" ")).not.toMatch(/storage/);
  });
});
