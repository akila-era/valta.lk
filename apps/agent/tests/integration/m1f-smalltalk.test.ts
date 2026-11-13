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
