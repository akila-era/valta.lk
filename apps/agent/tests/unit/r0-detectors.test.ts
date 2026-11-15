import { describe, expect, it } from "vitest";
import { detectCorrection } from "../../src/router/corrections";
import { isNegatedAt } from "../../src/router/negation";
import { normalizeMatch, tokenize } from "../../src/router/normalize";
import { acknowledgementFor, detectPreferences } from "../../src/router/preferences";
import { extractEntities } from "../../src/router/entities";
import { detectLanguage } from "../../src/router/language";
import { parseAmounts, toPriceBounds } from "../../src/router/amounts";
import { addExclusions, filterOutcomes, hasExclusions, isExcluded, withdrawExclusions } from "../../src/reasoning/exclusions";
import { emptyExclusions } from "../../src/reasoning/profile";
import { MOCK_VOCAB } from "../fixtures/mock-vocab";
import type { ProductView } from "../../src/backend/types";
import type { ToolOutcome } from "../../src/tools/runner";

/**
 * R0 regression tests for the pure detectors: corrections (item 3), negation (4), conversation preferences (5), and the small router fixes (6).
 * Each rule has near-misses that must NOT fire.
 */
describe("R0.3 detectCorrection", () => {
  it.each([
    ["mama kiwwe eka nemei", ""],
    ["no, that's not what I asked", ""],
    ["that’s not what I said", ""],
    ["ehema nemei", ""],
    ["wrong", ""],
    ["that's wrong", ""],
    ["wrong answer", ""],
    ["no, that's the wrong one", ""],
    ["you misunderstood", ""],
    ["sorry, I actually wanted phones", "phones"],
    ["no I wanted a phone", "a phone"],
    ["I meant a laptop", "a laptop"],
    ["I meant phones", "phones"],
    ["mama kiwwe laptop ekak", "laptop ekak"],
    ["eka nemei mama kiwwe laptop ekak", "laptop ekak"],
    ["No, sorry, I meant a phone under 100000", "a phone under 100000"],
    ["මම කිව්වේ ඒක නෙමෙයි", ""],
    ["ඒක නෙමෙයි", ""],
    ["වැරදියි", ""],
  ])("%j -> remainder %j", (text, remainder) => {
    expect(detectCorrection(text)).toEqual({ remainder });
  });

  it.each([
    "not that one, show me another",
    "meka epa",
    "show me phones",
    "laptop ekak oni",
    "I don't like this one",
    "wrong number",
    "I want a phone",
    "I wanted to ask about delivery",
    "I need a laptop",
    "what is the wrong answer to this riddle",
    "hi",
    "සිංහලෙන් කියන්න",
  ])("is not a correction: %j", (text) => {
    expect(detectCorrection(text)).toBeNull();
  });

  it("never alters the text it is given and ignores very long messages", () => {
    const text = "I meant a laptop";
    detectCorrection(text);
    expect(text).toBe("I meant a laptop");
    expect(detectCorrection(`I meant ${"a".repeat(500)}`)).toBeNull();
  });
});

describe("R0.4 negation", () => {
  const neg = (text: string, word: string): boolean => {
    const tokens = tokenize(normalizeMatch(text));
    const at = tokens.indexOf(word);
    expect(at, `${word} in ${text}`).toBeGreaterThanOrEqual(0);
    return isNegatedAt(tokens, at, at + 1);
  };

  it.each([
    ["don't recommend samsung", "samsung"],
    ["do not recommend samsung", "samsung"],
    ["no apple", "apple"],
    ["without samsung", "samsung"],
    ["anything but samsung", "samsung"],
    ["I don't want samsung", "samsung"],
    ["not samsung please", "samsung"],
    ["avoid samsung", "samsung"],
    ["except samsung", "samsung"],
    ["samsung epa", "samsung"],
    ["samsung nathuwa phones", "samsung"],
    ["samsung walin pissu", "samsung"],
    ["samsung eka epa", "samsung"],
    ["samsung ona naha", "samsung"],
    ["Samsung එපා", "samsung"],
    ["Samsung නැතුව", "samsung"],
    ["not samsung or apple", "apple"],
    ["not samsung or apple", "samsung"],
    ["except samsung and kite", "kite"],
    ["don't recommend samsung or kite", "kite"],
    ["samsung or kite epa", "samsung"],
    ["samsung is not what I want", "samsung"],
    ["samsung hari epa", "samsung"],
    ["samsung eka naha", "samsung"],
  ])("negates: %j", (text, word) => {
    expect(neg(text, word)).toBe(true);
  });

  it.each([
    ["not sure about samsung", "samsung"],
    ["no budget, samsung phones", "samsung"],
    ["samsung phones but cheaper", "samsung"],
    ["I like samsung", "samsung"],
    ["is samsung good", "samsung"],
    ["samsung walin ekak", "samsung"],
    ["show me samsung", "samsung"],
    ["I have no idea which samsung", "samsung"],
    ["no, a samsung", "samsung"],
    ["no a laptop", "laptop"],
    ["no the samsung one", "samsung"],
    ["samsung or kite please", "kite"],
  ])("does not negate: %j", (text, word) => {
    expect(neg(text, word)).toBe(false);
  });

  it("entity extraction reports a negated brand as an exclusion and never as the brand asked for", () => {
    const vocab = { ...MOCK_VOCAB, brands: [...MOCK_VOCAB.brands, "Samsung", "Apple"] };
    const e = extractEntities("don't recommend Samsung", vocab);
    expect(e.brand).toBeUndefined();
    expect(e.exclusions?.brands).toEqual(["samsung"]);
    expect(e.unknownTerms).toEqual([]);
    const positive = extractEntities("Samsung phones", vocab);
    expect(positive.brand).toBe("Samsung");
    expect(positive.exclusions).toBeUndefined();
    const mixed = extractEntities("Apple phones, no Samsung", vocab);
    expect(mixed.brand).toBe("Apple");
    expect(mixed.exclusions?.brands).toEqual(["samsung"]);
  });

  it("a negated well-known brand the catalogue does not carry is still an exclusion and does not become a search by name", () => {
    const e = extractEntities("don't recommend Samsung", MOCK_VOCAB);
    expect(e.exclusions?.brands).toContain("samsung");
    expect(e.unknownTerms).toEqual([]);
  });

  it("budget exclusions are ceilings: 'not above', 'no more than', 'never over'", () => {
    for (const t of ["phones not above 60000", "phones no more than 60000", "phones never over 60000", "phones nothing above 60000"]) {
      expect(toPriceBounds(parseAmounts(normalizeMatch(t)).amounts), t).toEqual({ maxPriceLkr: 60000 });
    }
    // near-miss: "above" without the negation is still a floor
    expect(toPriceBounds(parseAmounts(normalizeMatch("phones above 60000")).amounts)).toEqual({ minPriceLkr: 60000 });
  });

  const product = (id: string, name: string, brand: string, cat = "mobile-phones"): ProductView =>
    ({ id, slug: id, name, brand, category: { slug: cat, name: cat === "mobile-phones" ? "Mobile Phones" : "Accessories" }, priceCents: 100, saleCents: null, available: true, maxQuantity: 5, variants: [], specs: [], updatedAt: "x" }) as ProductView;

  it("the exclusion set: add, withdraw, and match by brand, name, category, word and id", () => {
    const set = emptyExclusions();
    expect(hasExclusions(set)).toBe(false);
    expect(addExclusions(set, { brands: ["Samsung"], words: ["charger"], productIds: ["p9"] })).toBe(true);
    expect(addExclusions(set, { brands: ["samsung"] })).toBe(false); // already there (case-insensitive)
    expect(isExcluded(product("p1", "Samsung Galaxy", "Samsung"), set)).toBe(true);
    expect(isExcluded(product("p2", "Galaxy-like phone", "Other"), set)).toBe(false);
    expect(isExcluded(product("p3", "Fast Charger 20W", "Volt", "accessories"), set)).toBe(true);
    expect(isExcluded(product("p9", "Anything", "Nobody"), set)).toBe(true);
    expect(withdrawExclusions(set, { brand: "SAMSUNG" })).toBe(true);
    expect(isExcluded(product("p1", "Samsung Galaxy", "Samsung"), set)).toBe(false);
  });

  it("filterOutcomes removes excluded products from search and accessory results only, and keeps the totals honest", () => {
    const set = emptyExclusions();
    addExclusions(set, { brands: ["samsung"] });
    const items = [product("a", "A", "Samsung"), product("b", "B", "Lumen"), product("c", "C", "Samsung")];
    const outcomes: ToolOutcome[] = [
      { tool: "search_products", status: "ok", data: { kind: "search", total: 5, items } },
      { tool: "get_product_details", status: "ok", data: { kind: "details", product: items[0]! } },
    ];
    const r = filterOutcomes(outcomes, set);
    expect(r.removed).toBe(2);
    const search = r.outcomes[0] as { data: { total: number; items: ProductView[] } };
    expect(search.data.items.map((p) => p.id)).toEqual(["b"]);
    expect(search.data.total).toBe(3);
    // a product the shopper asked about by name is never hidden
    expect((r.outcomes[1] as { data: { product: ProductView } }).data.product.id).toBe("a");
    // everything excluded: the page is empty and says none
    const none = filterOutcomes([{ tool: "search_products", status: "ok", data: { kind: "search", total: 9, items: [items[0]!, items[2]!] } }], set);
    expect((none.outcomes[0] as { data: { total: number } }).data.total).toBe(0);
  });
});

describe("R0.5 conversation preferences", () => {
  it.each([
    ["reply in Sinhala", { replyLang: "si" }],
    ["from now on reply only in Sinhala", { replyLang: "si" }],
    ["sinhalen kiyanna", { replyLang: "si" }],
    ["සිංහලෙන් කියන්න", { replyLang: "si" }],
    ["English walin kiyanna", { replyLang: "en" }],
    ["reply in English please", { replyLang: "en" }],
    ["keep it short", { short: true }],
    ["kotin kiyanna", { short: true }],
    ["stop asking questions", { noQuestions: true }],
    ["just show me", { noQuestions: true }],
    ["ask karanna epa", { noQuestions: true }],
    ["from now on never ask me anything", { noQuestions: true }],
    ["don't ask my budget", { noBudgetQuestion: true }],
    ["budget eka asanna epa", { noBudgetQuestion: true }],
    ["stop asking about budget", { noBudgetQuestion: true }],
  ])("%j -> %j", (text, expected) => {
    expect(detectPreferences(text)).toEqual(expected);
  });

  it.each(["sinhalen katha karanna puluwanda", "can you speak Sinhala", "do you reply in English", "show me phones", "hi", "a short film", "ask a question"])("is not an instruction: %j", (text) => {
    expect(detectPreferences(text)).toBeNull();
  });

  it("acknowledges one preference per reply, language first", () => {
    expect(acknowledgementFor({ replyLang: "si", short: true })).toBe("pref_lang_si");
    expect(acknowledgementFor({ noQuestions: true, noBudgetQuestion: true })).toBe("pref_no_questions");
    expect(acknowledgementFor({ short: true })).toBe("pref_short");
  });
});

describe("R0.6 smaller router fixes", () => {
  it("'no budget' says there is no budget: it is not an amount that could not be read", () => {
    for (const t of ["no budget", "no budget samsung phones", "budget ekak nane", "without a budget"]) expect(parseAmounts(normalizeMatch(t)).unparsedCue, t).toBe(false);
    expect(parseAmounts(normalizeMatch("my budget is high")).unparsedCue).toBe(true); // near-miss: a budget cue with no amount still asks
  });

  it("short Singlish messages with no other marker are detected as Singlish (so they are answered in Sinhala style)", () => {
    for (const t of ["login wenna ba", "ehema nemei", "Samsung nathuwa", "kotin kiyanna", "password eka marala"]) expect(detectLanguage(t).language, t).toBe("mixed");
    // near-miss: ordinary English stays English
    for (const t of ["show me phones", "I meant a laptop", "that's not what I asked", "keep it short"]) expect(detectLanguage(t).language, t).toBe("en");
  });

  it("typos of everyday spec and usage words are normalised", () => {
    expect(normalizeMatch("batary eka hodama")).toContain("battery");
    expect(normalizeMatch("gamming laptop")).toContain("gaming");
  });
});
