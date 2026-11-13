import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createMockStack } from "../../src/mock/stack";
import { conversationIntent, isNeutralMessage } from "../../src/router/conversation";
import { normalizeMatch } from "../../src/router/normalize";
import { renderTemplate } from "../../src/router/templates";
import { hasSinhala } from "../../src/util/script";
import { accuracyByLanguage, evaluate } from "../bench/m4-conversation/evaluate";
import { DEV } from "../bench/m4-conversation/dev";
import { HOLDOUT } from "../bench/m4-conversation/holdout";
import { run } from "../fixtures/pipeline-helpers";

/** A stack that records which tools ran, so "no product search" can be asserted instead of guessed from the reply. */
function stack() {
  const tools: string[] = [];
  const s = createMockStack({ metrics: { tool: (name) => void tools.push(name), toolBatchMs: () => undefined } });
  return { ...s, tools };
}
const textOf = (key: Parameters<typeof renderTemplate>[0], lang: "en" | "si") => renderTemplate(key, lang).text;
const prices = (r: { cards: { type: string }[] }) => r.cards.map((c) => (c as unknown as { price?: { amount: number } }).price?.amount ?? 0);

describe("the brief's examples", () => {
  it("greetings are answered conversationally: no product search, no cards", async () => {
    for (const m of ["kohomada oyata", "kohomd oyata", "hi", "hello", "ayubowan"]) {
      const s = stack();
      const { result } = await run(s.pipeline, m);
      expect(s.tools, m).toEqual([]);
      expect(result.cards, m).toEqual([]);
    }
    const sinhala = (await run(stack().pipeline, "kohomd oyata")).result;
    expect(sinhala.reply.text).toBe("මට හොඳින් ඉන්නවා! 😊 ඔයාට කොහොමද? අද මොනවද හොයන්නේ?");
    expect(sinhala.needsNativeReview).toBe(true);
    const english = (await run(stack().pipeline, "hi")).result;
    expect(english.reply.text).toBe("Hi! Welcome to VOLTA.LK. How can I help you today?");
    expect(english.needsNativeReview).toBe(false);
  });

  it("'monada product' asks what kind of product, without searching", async () => {
    const s = stack();
    const { result } = await run(s.pipeline, "monada product");
    expect(result.reply.text).toBe(textOf("browse_categories", "si"));
    expect(s.tools).toEqual([]);
    expect(result.cards).toEqual([]);
  });

  it("'power bank ekak thiyenawada' and the typo 'power banak nadd' both search the catalogue", async () => {
    for (const m of ["power bank ekak thiyenawada", "power banak nadd", "powerbank ekak nadda"]) {
      const s = stack();
      const { result } = await run(s.pipeline, m);
      expect(s.tools, m).toEqual(["search_products"]);
      expect(result.cards.length, m).toBeGreaterThan(0);
      expect(result.cards.every((c) => /power bank/i.test((c as unknown as { name?: string }).name ?? "")), m).toBe(true);
    }
  });

  it("'thank you' and 'oyata puluwanda udaw karanna' are conversation, not searches", async () => {
    const s = stack();
    expect((await run(s.pipeline, "thank you")).result.reply.text).toBe(textOf("thanks", "en"));
    expect((await run(s.pipeline, "oyata puluwanda udaw karanna")).result.reply.text).toBe(textOf("help_yes", "si"));
    expect(s.tools).toEqual([]);
  });

  it("'ok' and 'hari hari' acknowledge instead of searching", async () => {
    const s = stack();
    expect((await run(s.pipeline, "ok")).result.reply.text).toBe(textOf("acknowledged", "en"));
    expect((await run(s.pipeline, "hari hari")).result.reply.text).toBe(textOf("acknowledged", "si"));
    expect(s.tools).toEqual([]);
  });
});

describe("conversation context", () => {
  it("'Show me laptops' then a budget searches laptops within that budget", async () => {
    const s = stack();
    await run(s.pipeline, "Show me laptops.");
    const { result } = await run(s.pipeline, "300000");
    expect(result.cards.length).toBeGreaterThan(0);
    expect(result.cards.every((c) => /laptop/i.test((c as unknown as { name?: string }).name ?? ""))).toBe(true);
    expect(Math.max(...prices(result))).toBeLessThanOrEqual(300000);
  });

  it("'Samsung phones' then '100000 ta adu' keeps Samsung: the catalogue has none, so it says so and offers other phones, never passing them off as Samsung", async () => {
    const s = stack();
    const first = (await run(s.pipeline, "Samsung phones show me.")).result;
    expect(first.reply.text).toBe(textOf("no_match_alternatives", "en"));
    expect(first.cards.length).toBeGreaterThan(0);
    expect(first.cards.every((c) => /smartphone/i.test((c as unknown as { name?: string }).name ?? ""))).toBe(true);
    expect(first.cards.some((c) => /samsung/i.test(JSON.stringify(c)))).toBe(false);
    const second = (await run(s.pipeline, "100000 ta adu")).result;
    expect(second.reply.text).toBe(textOf("no_match_alternatives", "si"));
    expect(Math.max(...prices(second))).toBeLessThanOrEqual(100000);
  });

  it("a budget after phones refines phones, and a new topic does not inherit the old one", async () => {
    const s = stack();
    await run(s.pipeline, "mata phone ekak oni");
    const phones = (await run(s.pipeline, "100000 ta adu")).result;
    expect(phones.cards.length).toBeGreaterThan(0);
    expect(phones.cards.every((c) => /smartphone/i.test((c as unknown as { name?: string }).name ?? ""))).toBe(true);
    expect(Math.max(...prices(phones))).toBeLessThanOrEqual(100000);
    await run(s.pipeline, "show me laptops");
    const laptops = (await run(s.pipeline, "400000")).result;
    expect(laptops.cards.every((c) => /laptop/i.test((c as unknown as { name?: string }).name ?? ""))).toBe(true);
  });

  it("a bare amount with nothing to refine asks what to search for, instead of listing everything under that price", async () => {
    const s = stack();
    const { result } = await run(s.pipeline, "150000");
    expect(result.reply.text).toBe(textOf("clarify_budget_what", "en"));
    expect(s.tools).toEqual([]);
    expect(result.cards).toEqual([]);
  });

  it("'meka hondada?' refers to the product just shown and answers with its details, never an invented opinion", async () => {
    const s = stack();
    await run(s.pipeline, "tell me about Orbit Pro");
    const { result } = await run(s.pipeline, "is this good?");
    expect(result.reply.text).toBe(textOf("opinion_facts", "en"));
    expect(result.cards.map((c) => (c as unknown as { name?: string }).name)).toEqual(["Orbit Pro Smartphone"]);
    expect(result.reply.text).not.toMatch(/\d|excellent|great|recommend/i);
  });

  it("with no product in the conversation, 'eka hondada' asks which product", async () => {
    const { result } = await run(stack().pipeline, "eka hondada");
    expect(result.reply.text).toBe(textOf("clarify_product", "si"));
  });

  it("'show the cheapest' after a search keeps the category", async () => {
    const s = stack();
    await run(s.pipeline, "show me laptops");
    const { result } = await run(s.pipeline, "show the cheapest");
    expect(result.cards.length).toBeGreaterThan(0);
    expect(result.cards.every((c) => /laptop/i.test((c as unknown as { name?: string }).name ?? ""))).toBe(true);
  });
});

describe("language of the reply", () => {
  it("Auto: Singlish gets the Sinhala-style reply (and the review flag); plain English gets English", async () => {
    const sl = (await run(stack().pipeline, "oyata mokada karanna puluwan")).result;
    expect(hasSinhala(sl.reply.text)).toBe(true);
    expect(sl.needsNativeReview).toBe(true);
    const en = (await run(stack().pipeline, "what can you do")).result;
    expect(hasSinhala(en.reply.text)).toBe(false);
  });

  it("an explicit choice in the page wins over what Auto would detect", async () => {
    const forcedEn = (await run(stack().pipeline, "kohomada oyata", { locale: "en" })).result;
    expect(forcedEn.reply.text).toBe(textOf("how_are_you", "en"));
    const forcedSi = (await run(stack().pipeline, "hello", { locale: "si" })).result;
    expect(forcedSi.reply.text).toBe(textOf("greeting", "si"));
  });

  it("a neutral message ('ok', a bare amount) keeps the language of the conversation instead of switching to English", async () => {
    const s = stack();
    await run(s.pipeline, "mata laptop ekak oni");
    const ack = (await run(s.pipeline, "ok")).result;
    expect(ack.reply.text).toBe(textOf("acknowledged", "si"));
    const eng = stack();
    await run(eng.pipeline, "show me laptops");
    expect((await run(eng.pipeline, "ok")).result.reply.text).toBe(textOf("acknowledged", "en"));
  });
});

describe("general questions and not-found", () => {
  it("general knowledge, creative and live-information requests never call a shopping tool", async () => {
    for (const m of ["who is the president of france", "write a poem about the sea", "what is the weather today", "explain how a battery works"]) {
      const s = stack();
      const { result } = await run(s.pipeline, m);
      expect(s.tools, m).toEqual([]);
      expect(result.cards, m).toEqual([]);
    }
  });

  it("a search with no match says so and offers chips, and a greeting never gets the not-found text", async () => {
    const miss = (await run(stack().pipeline, "Show me Zyxel gadgets")).result;
    expect(miss.reply.text).toBe(textOf("no_results", "en"));
    expect(miss.suggestions.length).toBeGreaterThan(0);
    for (const m of ["hi", "kohomada", "thank you", "ok"]) {
      expect((await run(stack().pipeline, m)).result.reply.text, m).not.toBe(textOf("no_results", "en"));
    }
  });

  it("empty or meaningless input gets a short clarification, not a search", async () => {
    for (const m of [" ", "👍", "asdfgh"]) {
      const s = stack();
      const { result } = await run(s.pipeline, m);
      expect(s.tools, m).toEqual([]);
      expect(result.cards, m).toEqual([]);
    }
  });
});

describe("pieces", () => {
  it("spelling variants map to one word", () => {
    expect(normalizeMatch("power banak nadd")).toBe("power bank nadda");
    expect(normalizeMatch("kohomadaaa oyata")).toContain("kohomada");
    expect(normalizeMatch("monada product")).toBe("monawada product");
  });

  it("isNeutralMessage is true only for fillers, digits and amount words", () => {
    for (const m of ["ok", "hari hari", "200000", "rs 150000", "100000 ta adu"]) expect(isNeutralMessage(m), m).toBe(true);
    for (const m of ["show me phones", "kohomada", "thank you", ""]) expect(isNeutralMessage(m), m).toBe(false);
  });

  it("conversationIntent names router decisions without changing them", () => {
    const d = (intent: string, template?: string, reason = "x") => ({ intent: intent as never, action: "static" as const, template: template as never, reason });
    expect(conversationIntent(d("smalltalk", "greeting"), "hi")).toBe("greeting");
    expect(conversationIntent(d("smalltalk", "thanks"), "thanks")).toBe("general_conversation");
    expect(conversationIntent(d("smalltalk", "browse_categories"), "x")).toBe("clarification");
    expect(conversationIntent(d("general"), "x")).toBe("general_knowledge");
    expect(conversationIntent(d("get_product_details"), "how much is it")).toBe("price_inquiry");
    expect(conversationIntent(d("get_product_details", undefined, "opinion"), "is it good")).toBe("general_conversation");
    expect(conversationIntent(d("cart_view"), "x")).toBe("cart_query");
    expect(conversationIntent(d("unknown", "clarify_what"), "x")).toBe("unknown");
  });
});

describe("intent accuracy (per language)", () => {
  it("DEV (tuned on): at least 95% in every language", async () => {
    const acc = accuracyByLanguage(await evaluate(DEV));
    expect(DEV.length).toBeGreaterThanOrEqual(100);
    for (const l of ["si", "singlish", "en", "mixed"] as const) expect(acc[l].pct, `${l}: ${acc[l].correct}/${acc[l].total}`).toBeGreaterThanOrEqual(95);
  });

  it("HOLDOUT (never tuned on): regression floor of 85% overall and 75% in each language", async () => {
    const acc = accuracyByLanguage(await evaluate(HOLDOUT));
    expect(acc.all.pct, `${acc.all.correct}/${acc.all.total}`).toBeGreaterThanOrEqual(85);
    for (const l of ["si", "singlish", "en", "mixed"] as const) expect(acc[l].pct, `${l}: ${acc[l].correct}/${acc[l].total}`).toBeGreaterThanOrEqual(75);
  });

  it("HOLDOUT has not changed since it was frozen", () => {
    const dir = join(__dirname, "..", "bench", "m4-conversation");
    const recorded = JSON.parse(readFileSync(join(dir, "frozen-hashes.json"), "utf8")) as { files: Record<string, string> };
    const hash = createHash("sha256").update(readFileSync(join(dir, "holdout.ts"), "utf8").replace(/\r\n/g, "\n")).digest("hex");
    expect(hash, "holdout.ts is frozen: change it only as a documented correction and update frozen-hashes.json in the same commit").toBe(recorded.files["holdout.ts"]);
  });
});
