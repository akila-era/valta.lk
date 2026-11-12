import { describe, expect, it } from "vitest";
import { normalizeMatch } from "../../src/router/normalize";
import { routeMessage } from "../../src/router/router";
import { createToolRegistry } from "../../src/tools/definitions";
import { MOCK_VOCAB } from "../fixtures/mock-vocab";
import { createStubBackend } from "../fixtures/stub-backend";
import { EMPTY_CONTEXT, evaluate, formatReport, route } from "./harness";
import { SET_A, SET_B, SET_C } from "./sinhala-sets";

/**
 * Regression tests over DEVELOPER-AUTHORED sets. All three are in-sample now (see FIRST_RUN_RECORD.md for the numbers recorded
 * before tuning: B 98 %, A 98 %, C 63 %). These tests protect known phrasings; they are NOT an evaluation of Sinhala quality.
 */
describe("developer-authored routing sets (regression, in-sample)", () => {
  for (const [name, set] of [["SET_A", SET_A], ["SET_B", SET_B], ["SET_C", SET_C]] as const) {
    it(`${name}: every labelled intent and entity still routes as labelled`, () => {
      const r = evaluate(set);
      if (r.mismatches.length || r.entityMisses.length) console.log(formatReport(name, r));
      expect(r.mismatches, JSON.stringify(r.mismatches)).toEqual([]);
      expect(r.entityMisses, JSON.stringify(r.entityMisses)).toEqual([]);
    });
  }

  it("covers all three scripts and every intent at least once", () => {
    const all = [...SET_A, ...SET_B, ...SET_C];
    expect(new Set(all.map((c) => c.tag))).toEqual(new Set(["si", "mixed", "singlish", "en", "abstain"]));
    const intents = new Set(all.map((c) => c.intent));
    for (const i of ["search_products", "get_product_details", "compare_products", "check_stock", "get_accessories", "cart_add", "cart_remove", "cart_update_quantity", "cart_view", "order_status", "order_support", "checkout_handoff", "store_info", "smalltalk", "unknown"]) {
      expect(intents.has(i as never), i).toBe(true);
    }
    expect(all.length).toBeGreaterThanOrEqual(140);
  });

  it("has no duplicated utterance across sets (so one case cannot be counted twice)", () => {
    const texts = [...SET_A, ...SET_B, ...SET_C].map((c) => c.text.toLowerCase());
    expect(new Set(texts).size).toBe(texts.length);
  });

  it("prints the summary", () => {
    for (const [n, s] of [["SET_A", SET_A], ["SET_B", SET_B], ["SET_C", SET_C]] as const) {
      const r = evaluate(s);
      console.log(`${n}: intent ${r.intentCorrect}/${r.total}, entity cases ${r.entityCorrect}/${r.entityChecked}, abstained ${r.abstained}`);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Properties that must hold for ANY input, not only the labelled sets.
// ---------------------------------------------------------------------------------------------------------------------

/** Small deterministic generator so failures are reproducible. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORDS = [
  "show", "me", "phone", "phones", "nova", "x1", "orbit", "pro", "pulse", "earbuds", "volt", "charger", "cart", "add", "remove", "this", "these", "compare", "vs", "under", "150000", "80k", "stock", "available", "order", "track",
  "where", "is", "my", "delivery", "charge", "hello", "thanks", "cancel", "refund", "pay", "checkout", "buy", "free", "discount", "ignore", "instructions", "price", "black", "blue", "256gb", "2", "to", "quantity", "the", "a", "and",
  "ekak", "eka", "ekata", "thiyenawada", "kiyada", "koheda", "ganna", "one", "danna", "ain", "karanna", "pennanna", "meka", "mage", "denna", "walata", "adu",
  "පෙන්වන්න", "තියෙනවද", "මේක", "දාන්න", "අයින්", "කරන්න", "තොගේ", "කීයද", "වෙනස", "ඇණවුම", "කොහෙද", "ඉවත්", "ගන්න", "ඕන", "මිල", "අඩු", "හොඳ", "cart", "එකට", "එකේ", "ප්‍රමාණය", "වට්ටම්", "ස්තූතියි", "ආයුබෝවන්",
  "xyzzy", "qwerty", "lorem", "ipsum",
];
const CART_WORDS = ["cart", "කාට්", "කාර්ට්", "basket", "buy", "take", "ගන්නම්", "quantity", "qty", "ප්‍රමාණය", "make it", "remove", "delete", "ain karanna", "අයින්", "ඉවත්", "ekathu", "එකතු", "add", "ganna"];

describe("router properties over random token soup", () => {
  const registry = createToolRegistry(createStubBackend().backend);
  const rand = mulberry32(20261112);
  const messages = Array.from({ length: 4000 }, () => Array.from({ length: 1 + Math.floor(rand() * 9) }, () => WORDS[Math.floor(rand() * WORDS.length)]).join(" "));

  it("never throws", () => {
    for (const m of messages) expect(() => routeMessage({ matchText: normalizeMatch(m), rawText: m, vocab: MOCK_VOCAB, context: EMPTY_CONTEXT }), m).not.toThrow();
  });

  it("every tool call the router builds is valid by construction (strict schema, allowed actor)", () => {
    let toolDecisions = 0;
    for (const m of messages) {
      const d = route(m);
      for (const c of d.calls) {
        toolDecisions++;
        const tool = registry.get(c.name);
        expect(tool, `${m} -> ${c.name}`).toBeDefined();
        const parsed = tool!.args.safeParse(c.arguments);
        expect(parsed.success, `${m} -> ${JSON.stringify(c)}`).toBe(true);
        if (parsed.success && tool!.check) expect(tool!.check(parsed.data as never), `${m} -> ${JSON.stringify(c)}`).toBeNull();
      }
    }
    expect(toolDecisions).toBeGreaterThan(200); // the property is exercised, not vacuous
  });

  it("only ever produces a cart change when the message contains a cart-related word", () => {
    let cartDecisions = 0;
    for (const m of messages) {
      const d = route(m);
      if (d.intent === "cart_add" || d.intent === "cart_remove" || d.intent === "cart_update_quantity") {
        cartDecisions++;
        const lower = normalizeMatch(m);
        expect(CART_WORDS.some((w) => lower.includes(normalizeMatch(w))), m).toBe(true);
      }
    }
    expect(cartDecisions).toBeGreaterThan(20);
  });

  it("never plans a product id that is not in the vocabulary", () => {
    const known = new Set(MOCK_VOCAB.products.map((p) => p.id));
    for (const m of messages) {
      for (const c of route(m).calls) {
        const a = c.arguments as { productId?: string; productIds?: string[] };
        if (a.productId) expect(known.has(a.productId), m).toBe(true);
        for (const id of a.productIds ?? []) expect(known.has(id), m).toBe(true);
      }
    }
  });

  it("never plans a tool for the intents that must hand off or stay static", () => {
    for (const m of messages) {
      const d = route(m);
      if (["checkout_handoff", "order_support", "smalltalk", "unknown"].includes(d.intent)) expect(d.calls, m).toEqual([]);
    }
  });

  it("abstains on gibberish", () => {
    for (const m of ["xyzzy qwerty lorem", "lorem ipsum xyzzy", "qwerty", "zzz yyy xxx"]) expect(route(m).intent, m).toBe("unknown");
  });
});
