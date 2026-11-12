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
