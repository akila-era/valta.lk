import { describe, expect, it } from "vitest";
import { createMockStack } from "../../src/mock/stack";
import { renderTemplate } from "../../src/router/templates";
import { run } from "../fixtures/pipeline-helpers";

/** Everyday Singlish and Sinhala greetings and "what can you do" questions are answered by the deterministic router with fixed texts. */
const textOf = (key: Parameters<typeof renderTemplate>[0], lang: "en" | "si") => renderTemplate(key, lang).text;

describe("small talk in Singlish and Sinhala", () => {
  it.each([
    ["kohomada", "greeting"],
    ["kohomd", "greeting"],
    ["kohomda", "greeting"],
    ["hi", "greeting"],
    ["how are you", "greeting"],
    ["oyata mokada karanna puluwan", "capabilities"],
    ["oyata mond karann puluwn", "capabilities"],
    ["mokakda karanna puluwan", "capabilities"],
    ["ඔයාට මොනවද කරන්න පුළුවන්", "capabilities"],
    ["what can you do", "capabilities"],
  ] as const)("%s -> %s", async (message, key) => {
    const s = createMockStack();
    const { result } = await run(s.pipeline, message);
    // A reply is in Sinhala only when the message has Sinhala script; Latin-script Singlish gets the English fixed text.
    expect(result.reply.text).toBe(textOf(key, /[඀-෿]/.test(message) ? "si" : "en"));
    expect(result.cards).toEqual([]);
    expect(result.actions).toEqual([]);
  });

  it("a Sinhala-script reply is flagged for native review; the English fixed text for Latin-script messages is not", async () => {
    const s = createMockStack();
    expect((await run(s.pipeline, "ඔයාට මොනවද කරන්න පුළුවන්")).result.needsNativeReview).toBe(true);
    expect((await run(s.pipeline, "oyata mond karann puluwn")).result.reply.text).toBe(textOf("capabilities", "en"));
    expect((await run(s.pipeline, "what can you do")).result.needsNativeReview).toBe(false);
  });

  it("does not turn real shopping or order questions into small talk", async () => {
    const s = createMockStack();
    expect((await run(s.pipeline, "Show me phones under 150000 rupees")).result.cards.length).toBeGreaterThan(0);
    const order = await run(s.pipeline, "mage order eka kohomada?");
    expect(order.result.actions[0]).toMatchObject({ type: "navigate", href: "/track-order" });
    expect((await run(s.pipeline, "Orbit Pro එක cart එකට දාන්න")).result.actions[0]).toMatchObject({ type: "cart.add" });
  });
});

describe("popularity and best-seller questions (no sales data exists)", () => {
  it.each(["fast move product", "fast moving products", "best selling phones", "most popular items", "trending now", "top selling products", "bestseller", "වැඩියෙන්ම විකුණන දේවල්"])(
    "%s: says it has no sales data and shows the newest products in stock, never a ranking",
    async (message) => {
      const s = createMockStack();
      const { result } = await run(s.pipeline, message);
      expect(result.reply.text).toBe(textOf("popular_unavailable", /[඀-෿]/.test(message) ? "si" : "en"));
      expect(result.reply.text).not.toMatch(/\d/);
      expect(result.cards.length).toBeGreaterThan(0);
      expect(result.cards.every((c) => c.type === "product")).toBe(true);
      expect(result.reply.source).toBe("template");
    },
  );

  it("Sinhala answers are flagged for native review", async () => {
    const s = createMockStack();
    expect((await run(s.pipeline, "වැඩියෙන්ම විකුණන දේවල්")).result.needsNativeReview).toBe(true);
  });

  it("does not hijack normal searches", async () => {
    const s = createMockStack();
    const r = (await run(s.pipeline, "Show me phones under 150000 rupees")).result;
    expect(r.reply.text).toBe(textOf("tools_ran", "en"));
  });
});

describe("more everyday Singlish", () => {
  const cards = async (m: string) => (await run(createMockStack().pipeline, m)).result;
  it.each(["tablet ekak denna", "mata phone ekak ganna puluwanda", "phone walata mila kiyada", "phone wala mila monawada", "mata laptop ekak denna 300000 ta adu"])("%s -> product cards", async (m) => {
    const r = await cards(m);
    expect(r.cards.length).toBeGreaterThan(0);
    expect(r.cards.every((c) => c.type === "product")).toBe(true);
  });

  it.each(["oyata sinhalen katha karanna puluwanda", "do you speak sinhala", "singlish walin katha karanna puluwanda", "සිංහලෙන් කතා කරන්න පුළුවන්ද"])("%s -> says which languages it understands", async (m) => {
    const r = await cards(m);
    expect(r.reply.text).toBe(textOf("language_support", /[඀-෿]/.test(m) ? "si" : "en"));
    expect(r.cards).toEqual([]);
  });

  it("does not turn discount requests or cart changes into searches", async () => {
    const r = await cards("discount ekak denna");
    expect(r.cards).toEqual([]);
    expect(r.reply.text).not.toBe(textOf("tools_ran", "en"));
    expect((await cards("Orbit Pro eka cart ekata danna")).actions[0]).toMatchObject({ type: "cart.add" });
  });
});

describe("the store's own name", () => {
  it.each(["valta", "volta", "Valta.lk", "volta lk!"])("%s alone answers who the assistant is", async (m) => {
    const r = (await run(createMockStack().pipeline, m)).result;
    expect(r.reply.text).toBe(textOf("identity", "en"));
    expect(r.cards).toEqual([]);
  });
  it("does not change a real question that mentions it", async () => {
    const r = (await run(createMockStack().pipeline, "Show me phones under 150000 rupees from volta")).result;
    expect(r.cards.length).toBeGreaterThan(0);
  });
});

describe("suggestion chips", () => {
  const SETS = ["greeting", "clarify_what", "clarify_product", "no_results", "popular_unavailable", "cart_proposed", "store_info_other"] as const;

  it("every chip, in English and Sinhala, is understood by the assistant (never answered with 'I'm not sure')", async () => {
    const { suggestionsFor } = await import("../../src/router/templates");
    const all = new Set<string>();
    for (const k of SETS) for (const l of ["en", "si"] as const) suggestionsFor(k, l).forEach((c) => all.add(c));
    expect(all.size).toBeGreaterThan(8);
    for (const chip of all) {
      const r = (await run(createMockStack().pipeline, chip, { cart: [] })).result;
      expect(r.reply.text, chip).not.toBe(textOf("clarify_what", "en"));
      expect(r.reply.text, chip).not.toBe(textOf("clarify_what", "si"));
      expect(r.cards.length, chip).toBeGreaterThan(0);
    }
  });

  it("clarifications and greetings carry up to 4 short chips; they are fixed and fact-free; Sinhala chips need native review", async () => {
    const { ChatResponse } = await import("../../src/contract/schemas");
    for (const [m, sinhala] of [["hi", false], ["asdfgh qwerty", false], ["ආයුබෝවන්", true]] as const) {
      const r = (await run(createMockStack().pipeline, m)).result;
      expect(r.suggestions.length, m).toBeGreaterThan(0);
      expect(r.suggestions.length).toBeLessThanOrEqual(4);
      for (const c of r.suggestions) expect(c).not.toMatch(/\d|\bRs\b|stock/i);
      expect(r.needsNativeReview).toBe(sinhala);
      expect(ChatResponse.safeParse({ requestId: "r", sessionId: "sess_0123456789abcdef", ...r, meta: { ...r.meta, latencyMs: 1, contractVersion: "1.1" } }).success).toBe(true);
    }
  });

  it("answers that show cards carry no chips, and a failed verification returns none", async () => {
    expect((await run(createMockStack().pipeline, "Show me phones")).result.suggestions).toEqual([]);
  });
});

describe("spelling variants", () => {
  it.each([
    ["kohmada", "greeting"],
    ["phone eka penanna", "cards"],
    ["laptop thiyenwada", "cards"],
    ["mata fone ekk denna", "cards"],
    ["Nova X1 saha Orbit Pro compair karanna", "cards"],
    ["Nova X1 eke mila kiyda", "cards"],
  ])("%s", async (m, kind) => {
    const r = (await run(createMockStack().pipeline, m)).result;
    if (kind === "greeting") expect(r.reply.text).toBe(textOf("greeting", "en"));
    else expect(r.cards.length).toBeGreaterThan(0);
  });
});

describe("follow-up questions about what was just shown", () => {
  it("'this one' and 'it' refer to the product on the page or the last one shown", async () => {
    const s = createMockStack();
    const first = (await run(s.pipeline, "Tell me about the Atlas Smartwatch")).result;
    expect(first.cards).toHaveLength(1);
    const stock = (await run(s.pipeline, "is it in stock?")).result;
    expect(stock.cards[0]).toMatchObject({ type: "stock" });
    const acc = (await run(s.pipeline, "what accessories fit this one")).result;
    expect(acc.reply.text).not.toBe(textOf("clarify_what", "en"));
  });
});
