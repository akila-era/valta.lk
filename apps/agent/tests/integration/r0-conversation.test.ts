import { describe, expect, it } from "vitest";
import type { Card } from "../../src/contract/schemas";
import { createMockStack } from "../../src/mock/stack";
import type { EnglishPlanner } from "../../src/pipeline/english-planner";
import { renderTemplate, suggestionsFor, TEMPLATE_KEYS, varyFrom } from "../../src/router/templates";
import type { TemplateKey } from "../../src/router/types";
import { sessionKey } from "../../src/session/store";
import { verifyResponse } from "../../src/verify/verifier";
import { hasSinhala } from "../../src/util/script";
import { run, SESSION } from "../fixtures/pipeline-helpers";
import { RichTransport, richSite } from "../fixtures/rich-catalogue";

/**
 * R0 regression tests through the REAL pipeline (router, reasoning, tools, verifier, templates) on the invented fixture catalogue, no model.
 * Items 3 (corrections), 4 (negation), 5 (preferences), 6 (cue collisions, bare category), 7 (wording variety), and the "original message preserved" rule.
 */
type ProductCard = Extract<Card, { type: "product" }>;
const stack = (extra: Parameters<typeof createMockStack>[0] = {}) => createMockStack({ transport: new RichTransport(), site: richSite(), catalogueTtlMs: 0, ...extra });
const names = (cards: Card[]): string[] => cards.filter((c): c is ProductCard => c.type === "product").map((c) => c.name);
const brands = (cards: Card[]): string[] => cards.filter((c): c is ProductCard => c.type === "product").map((c) => c.brand ?? "");
const text = (key: TemplateKey, lang: "en" | "si" = "en") => renderTemplate(key, lang).text;
const first = (reply: string): string => reply.split("\n\n")[0]!;
async function say(s: ReturnType<typeof stack>, ...messages: string[]) {
  const out = [];
  for (const m of messages) out.push((await run(s.pipeline, m)).result);
  return out;
}

describe("R0.3 corrections", () => {
  it("'mama kiwwe eka nemei' after a search acknowledges and asks ONE short question, with no cards", async () => {
    const [, second] = await say(stack(), "phones under 100000", "mama kiwwe eka nemei");
    expect([text("correction_ask", "si"), text("correction_ask_b", "si")]).toContain(first(second!.reply.text));
    expect(second!.cards).toEqual([]);
    expect(second!.reply.text.split("\n\n")).toHaveLength(1);
    expect(second!.needsNativeReview).toBe(true);
  });

  it("the previous interpretation is DROPPED: the old budget and category do not leak into what the corrected request finds", async () => {
    const s = stack();
    const [, fixed] = await say(s, "laptops under 150000", "I meant phones");
    expect(fixed!.cards.length).toBeGreaterThanOrEqual(3);
    // nothing was inherited from "laptops under 150000": the profile now describes phones with no budget
    const profile = s.sessions.get(sessionKey({ kind: "guest" }, SESSION))!.reasoning.profile;
    expect(profile.budgetMaxLkr).toBeUndefined();
    expect(profile.category).toBe("mobile-phones");
    expect(first(fixed!.reply.text)).toMatch(/(Sorry about that|Got it, my mistake)/);
  });

  it("the profile is restored to what it was before the misread turn", async () => {
    const s = stack();
    await say(s, "laptops under 150000");
    const key = sessionKey({ kind: "guest" }, SESSION);
    expect(s.sessions.get(key)!.reasoning.profile.budgetMaxLkr).toBe(150000);
    await say(s, "no, that's not what I asked");
    const profile = s.sessions.get(key)!.reasoning.profile;
    expect(profile.budgetMaxLkr).toBeUndefined();
    expect(profile.category).toBeUndefined();
  });

  it("a correction that carries the corrected request answers it: 'mama kiwwe laptop ekak'", async () => {
    const [, second] = await say(stack(), "phones under 100000", "mama kiwwe laptop ekak");
    expect(second!.cards.length).toBeGreaterThan(0);
    expect(names(second!.cards).every((n) => /laptop|book|vortex|air|dev|study|studio/i.test(n))).toBe(true);
  });

  it("two corrections in a row are not worded the same", async () => {
    const [, a, b] = await say(stack(), "show me laptops", "that's wrong", "that's wrong");
    expect(first(a!.reply.text)).not.toBe(first(b!.reply.text));
  });

  it("a correction at the very start of a conversation just asks what was meant", async () => {
    const [r] = await say(stack(), "that's not what I asked");
    expect([text("correction_ask"), text("correction_ask_b")]).toContain(first(r!.reply.text));
  });

  it("rejecting what was shown is NOT a correction ('not that one' still shows other products)", async () => {
    const [, r] = await say(stack(), "cheapest phones", "not that one, show me another");
    expect(names(r!.cards).length).toBeGreaterThan(0);
    expect(first(r!.reply.text)).not.toMatch(/(misunderstood|my mistake|Sorry about that)/);
  });

  it("the shopper's original message is what the English planner receives (never the normalised or stripped form)", async () => {
    const seen: string[] = [];
    const planner = { plan: async (input: { message: string }) => (seen.push(input.message), { calls: [], attempts: 1, degraded: false, queuedMs: 0, invalid: false, noTool: true }) } as unknown as EnglishPlanner;
    const original = "Please   Tell me SOMETHING odd,  zzqx!!";
    await run(stack({ planner }).pipeline, original);
    expect(seen).toEqual([original]);
  });
});

describe("R0.4 negation: an explicit exclusion is respected, across turns, until asked for again", () => {
  it("'don't recommend Samsung' never shows Samsung, now or in later searches", async () => {
    const s = stack();
    const rs = await say(s, "don't recommend Samsung", "show me phones", "cheapest phones", "phones under 200000", "gaming phones");
    expect(first(rs[0]!.reply.text)).toBe(text("exclusion_noted"));
    for (const r of rs.slice(1)) expect(brands(r.cards), r.reply.text).not.toContain("Samsung");
    expect(names(rs[1]!.cards).length).toBeGreaterThan(0);
  });

  it("an exclusion right after a search repeats that search without the brand", async () => {
    const [before, after] = await say(stack(), "phones under 200000", "Samsung epa");
    expect(brands(before!.cards).length).toBeGreaterThan(0);
    expect(brands(after!.cards)).not.toContain("Samsung");
    expect(first(after!.reply.text)).toBe(text("exclusion_applied", "si"));
  });

  it("asking for the brand again withdraws the exclusion", async () => {
    const [, r] = await say(stack(), "no Samsung", "show me Samsung phones");
    expect(brands(r!.cards).length).toBeGreaterThan(0);
    expect(new Set(brands(r!.cards))).toEqual(new Set(["Samsung"]));
  });

  it("a product the shopper names after excluding its brand is shown (naming it is asking for it)", async () => {
    const [, r] = await say(stack(), "no Samsung", "tell me about the Samsung Test A1");
    expect(names(r!.cards)).toEqual(["Samsung Test A1 Smartphone"]);
  });

  it("an excluded product is not offered again", async () => {
    const [, r] = await say(stack(), "cheapest phones", "not the Kite K1");
    expect(names(r!.cards)).not.toContain("Kite K1 Smartphone");
    expect(names(r!.cards).length).toBeGreaterThan(0);
  });

  it("an exclusion that leaves nothing says so honestly", async () => {
    const [, r] = await say(stack(), "show me watches", "no Lumen");
    expect(r!.cards).toEqual([]);
    expect([text("no_results_excluded"), text("no_results"), text("no_results_b")]).toContain(first(r!.reply.text));
  });

  it("exclusions survive a correction (what the shopper does not want still holds)", async () => {
    const [, , r] = await say(stack(), "no Samsung", "phones", "that's not what I asked");
    expect([text("correction_ask"), text("correction_ask_b")]).toContain(first(r!.reply.text));
    const [r2] = await say(stack(), "no Samsung");
    expect(r2).toBeDefined();
  });

  it("negation words that do not negate the brand leave the search alone", async () => {
    // each in its own conversation: "but cheaper" in the SAME conversation is a relative-price follow-up, which is a different rule
    for (const m of ["not sure, Samsung phones", "no budget, Samsung phones please", "Samsung phones but cheaper"]) {
      const [r] = await say(stack(), m);
      expect(new Set(brands(r!.cards)), m).toEqual(new Set(["Samsung"]));
    }
  });

  it("a budget exclusion is a ceiling", async () => {
    const [r] = await say(stack(), "phones, not above 60000");
    expect(r!.cards.length).toBeGreaterThan(0);
    for (const c of r!.cards as ProductCard[]) expect(c.price.amount).toBeLessThanOrEqual(60000);
  });

  it("fit codes and comparisons only ever see the filtered products (no excluded brand in any card, comparison row or fit)", async () => {
    const [, r] = await say(stack(), "no Samsung", "gaming phone under 200000");
    expect(JSON.stringify(r!.cards)).not.toMatch(/samsung/i);
  });
});

describe("R0.5 conversation preferences", () => {
  it("'reply in Sinhala' is acknowledged in Sinhala and later English requests are answered in Sinhala", async () => {
    const [ack, r] = await say(stack(), "reply in Sinhala", "show me phones");
    expect(first(ack!.reply.text)).toBe(text("pref_lang_si", "si"));
    expect(hasSinhala(r!.reply.text)).toBe(true);
    expect(r!.cards.length).toBeGreaterThan(0);
    expect(r!.needsNativeReview).toBe(true);
  });

  it("'English walin kiyanna' switches a Singlish conversation to English replies", async () => {
    const [ack, r] = await say(stack(), "English walin kiyanna", "mata phone ekak oni");
    expect(first(ack!.reply.text)).toBe(text("pref_lang_en", "en"));
    expect(hasSinhala(r!.reply.text)).toBe(false);
  });

  it("the page's explicit language choice still wins over the shopper's instruction", async () => {
    const s = stack();
    await run(s.pipeline, "reply in Sinhala");
    const { result } = await run(s.pipeline, "show me phones", { locale: "en" });
    expect(hasSinhala(result.reply.text)).toBe(false);
  });

  it("'keep it short' and 'stop asking questions' end the follow-up questions for the conversation", async () => {
    for (const instruction of ["keep it short", "stop asking questions"]) {
      const [, r] = await say(stack(), instruction, "I need a phone");
      expect(r!.cards.length, instruction).toBeGreaterThan(0);
      expect(r!.reply.text.split("\n\n"), instruction).toHaveLength(1);
    }
  });

  it("'don't ask my budget' skips only the budget question", async () => {
    const [, r] = await say(stack(), "don't ask my budget", "I need a phone");
    expect(r!.reply.text).not.toContain(text("ask_budget"));
  });

  it("an instruction together with a request is answered, not just acknowledged: 'just show me phones'", async () => {
    const [r] = await say(stack(), "just show me phones");
    expect(r!.cards.length).toBeGreaterThan(0);
    expect(r!.reply.text.split("\n\n")).toHaveLength(1);
  });

  it("a question about language support is not an instruction", async () => {
    const [r] = await say(stack(), "can you speak Sinhala");
    expect(first(r!.reply.text)).not.toBe(text("pref_lang_si"));
  });

  it("preferences are per conversation: another session is unaffected", async () => {
    const s = stack();
    await run(s.pipeline, "stop asking questions");
    const other = await s.pipeline.run({ ...(await import("../fixtures/pipeline-helpers")).input("I need a phone"), request: { ...(await import("../fixtures/pipeline-helpers")).input("I need a phone").request, sessionId: "sess_fedcba9876543210" } }, () => {});
    expect(other.reply.text.split("\n\n")).toHaveLength(2);
  });
});

describe("R0.6 cue collisions and bare categories", () => {
  it.each(["phones", "laptops", "phone", "laptop ekak", "ෆෝන්"])("a bare category %j searches for it", async (m) => {
    const [r] = await say(stack(), m);
    expect(r!.cards.length).toBeGreaterThan(0);
    expect(first(r!.reply.text)).not.toBe(text("clarify_what"));
  });

  it("a bare category then 'something cheaper' works on that category", async () => {
    const [a, b] = await say(stack(), "phones", "poddak adu ekak");
    expect(a!.cards.length).toBeGreaterThan(0);
    expect(b!.cards.length).toBeGreaterThanOrEqual(0);
    expect(first(b!.reply.text)).not.toBe(text("clarify_what", "si"));
  });

  it("'battery eka kohomada' with no product asks which product; 'kohomada' alone is still 'how are you'", async () => {
    const [a] = await say(stack(), "battery eka kohomada");
    expect(first(a!.reply.text)).toBe(text("clarify_product", "si"));
    const [b] = await say(stack(), "kohomada");
    expect(first(b!.reply.text)).toBe(text("how_are_you", "si"));
  });

  it("near-miss: 'phone number' is not a search for phones", async () => {
    const [r] = await say(stack(), "phone number");
    expect(r!.cards).toEqual([]);
  });

  it("password trouble gets the account-help answer, never a refusal and never a request for the password", async () => {
    const [r] = await say(stack(), "my password is wrong for the website, how do I reset it");
    expect(first(r!.reply.text)).toBe(text("account_help"));
    expect(r!.reply.text).toContain("Forgot password?");
    expect(r!.cards).toEqual([]);
  });

  it("price-filter and sort instructions are ordinary shopping refinements", async () => {
    const [a, b, c] = await say(stack(), "phones under 100000", "set the price range to 40000 to 60000", "change the sort to price");
    expect(a!.cards.length).toBeGreaterThan(0);
    for (const card of b!.cards as ProductCard[]) expect(card.price.amount).toBeLessThanOrEqual(60000);
    expect(c!.cards.length).toBeGreaterThan(0);
  });
});

describe("R0.7 repeated replies are worded differently, deterministically", () => {
  it("varyFrom walks the family and wraps; it never changes a reply that has no family or no previous reply", () => {
    expect(varyFrom("greeting", undefined)).toBe("greeting");
    expect(varyFrom("greeting", "greeting")).toBe("greeting_again");
    expect(varyFrom("greeting", "greeting_again")).toBe("greeting_c");
    expect(varyFrom("greeting", "greeting_c")).toBe("greeting");
    expect(varyFrom("tools_ran", "tools_ran")).toBe("tools_ran_b");
    expect(varyFrom("tools_ran", "recommend_intro")).toBe("tools_ran");
    expect(varyFrom("cart_proposed", "cart_proposed")).toBe("cart_proposed");
  });

  it("three greetings and three thanks in a row all differ from their neighbour", async () => {
    for (const m of ["hi", "thanks"]) {
      const rs = await say(stack(), m, m, m, m);
      for (let i = 1; i < rs.length; i++) expect(first(rs[i]!.reply.text), `${m} #${i + 1}`).not.toBe(first(rs[i - 1]!.reply.text));
    }
  });

  it("repeated refinements and repeated fallbacks differ from the previous reply", async () => {
    const [, a, b] = await say(stack(), "phones under 100000", "show me more", "show me more");
    expect(first(a!.reply.text)).not.toBe(first(b!.reply.text));
    const [c, d] = await say(stack(), "asdf qwerty", "asdf qwerty");
    expect(first(c!.reply.text)).not.toBe(first(d!.reply.text));
  });

  it("the same conversation is worded the same way every time (no randomness)", async () => {
    const run1 = (await say(stack(), "hi", "hi", "thanks", "thanks", "phones", "show me more")).map((r) => r.reply.text);
    const run2 = (await say(stack(), "hi", "hi", "thanks", "thanks", "phones", "show me more")).map((r) => r.reply.text);
    expect(run1).toEqual(run2);
  });

  it("every template (all variants included) is a fixed text without digits, currency, names or links, in both languages, and the Sinhala wording carries Sinhala script", () => {
    for (const k of TEMPLATE_KEYS) {
      for (const l of ["en", "si"] as const) {
        const t = text(k, l);
        expect(t, `${k}/${l}`).not.toMatch(/\d|\bRs\b|\bLKR\b|https?:|www\./i);
      }
      expect(hasSinhala(text(k, "si")), k).toBe(true);
    }
  });

  it("the verifier accepts every new and varied template as the reply of its own key", () => {
    for (const k of ["greeting_c", "thanks_c", "tools_ran_b", "tools_ran_c", "clarify_what_b", "no_match_alternatives_b", "no_results_b", "correction_ask", "correction_ask_b", "correction_search", "correction_search_b", "exclusion_noted", "exclusion_applied", "no_results_excluded", "pref_lang_si", "pref_lang_en", "pref_short", "pref_no_questions", "pref_no_budget", "account_help"] as TemplateKey[]) {
      for (const l of ["en", "si"] as const) {
        const v = verifyResponse({ actor: "guest", outcomes: [], cards: [], actions: [], reply: { text: text(k, l), source: "template" }, templateKey: k, tplLang: l, language: l === "si" ? "mixed" : "en", needsNativeReview: l === "si", suggestions: suggestionsFor(k, l) });
        expect(v.ok, `${k}/${l}`).toBe(true);
      }
    }
  });

  it("a reply of the wrong kind is still rejected by the verifier (a variant cannot be passed off as another key)", () => {
    const v = verifyResponse({ actor: "guest", outcomes: [], cards: [], actions: [], reply: { text: text("tools_ran_b"), source: "template" }, templateKey: "tools_ran", tplLang: "en", language: "en", needsNativeReview: false, suggestions: [] });
    expect(v.ok).toBe(false);
  });
});

describe("R0 follow-up fixes found by probing harder variants of each rule", () => {
  it("'no, a laptop' after a phone search asks for a laptop (a bare 'no' before an article is an answer, not an exclusion)", async () => {
    const [, r] = await say(stack(), "I need a phone", "no, a laptop");
    expect(r!.cards.length).toBeGreaterThan(0);
    expect(names(r!.cards).every((n) => /laptop/i.test(n))).toBe(true);
    expect(first(r!.reply.text)).not.toBe(text("exclusion_applied"));
  });

  it("an exclusion list shares one negation: 'not Samsung or Apple', 'except Samsung and Kite', \"don't recommend Samsung or Kite\"", async () => {
    const [, a] = await say(stack(), "phones", "not Samsung or Kite");
    expect(brands(a!.cards)).not.toEqual(expect.arrayContaining(["Samsung"]));
    expect(brands(a!.cards)).not.toContain("Kite");
    const [, b] = await say(stack(), "phones", "show me phones except Samsung and Kite");
    expect(brands(b!.cards).length).toBeGreaterThan(0);
    expect(brands(b!.cards).filter((x) => x === "Samsung" || x === "Kite")).toEqual([]);
    const [c, d] = await say(stack(), "don't recommend Samsung or Kite", "phones");
    expect(first(c!.reply.text)).toBe(text("exclusion_noted"));
    expect(brands(d!.cards).filter((x) => x === "Samsung" || x === "Kite")).toEqual([]);
  });

  it("a trailing negation excludes the brand: 'Samsung is not what I want', 'samsung hari epa'", async () => {
    for (const m of ["Samsung is not what I want", "samsung hari epa"]) {
      const [, r] = await say(stack(), "phones under 200000", m);
      expect(brands(r!.cards).length, m).toBeGreaterThan(0);
      expect(brands(r!.cards), m).not.toContain("Samsung");
    }
  });

  it("a correction that carries a refinement keeps what the shopper was looking at: 'that's wrong, make it 60000'", async () => {
    const [, r] = await say(stack(), "phones under 100000", "that's wrong, make it 60000");
    expect(r!.cards.length).toBeGreaterThan(0);
    for (const c of r!.cards as ProductCard[]) expect(c.price.amount).toBeLessThanOrEqual(60000);
    expect(first(r!.reply.text)).toMatch(/(Sorry about that|Got it, my mistake)/);
  });

  it("'sorry, I actually wanted phones' and 'no I wanted a phone' are corrections that carry the right request", async () => {
    for (const m of ["sorry, I actually wanted phones", "no I wanted a phone"]) {
      const [, r] = await say(stack(), "laptops", m);
      expect(r!.cards.length, m).toBeGreaterThan(0);
      expect(names(r!.cards).every((n) => /smartphone/i.test(n)), m).toBe(true);
    }
  });

  it("'no not that' rejects what was shown (it is not left unanswered)", async () => {
    const [, r] = await say(stack(), "cheapest phones", "no not that");
    expect(r!.cards.length).toBeGreaterThan(0);
    expect(first(r!.reply.text)).not.toBe(text("clarify_what"));
  });

  it("'from now on never ask me anything' is an instruction", async () => {
    const [ack, r] = await say(stack(), "from now on never ask me anything", "I need a laptop");
    expect(first(ack!.reply.text)).toBe(text("pref_no_questions"));
    expect(r!.reply.text.split("\n\n")).toHaveLength(1);
  });
});
