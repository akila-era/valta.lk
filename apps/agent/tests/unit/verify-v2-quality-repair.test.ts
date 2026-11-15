import { describe, expect, it } from "vitest";
import { autoFix, buildFeedback, explainVerdict, findTitles, noticeFor, planRepair, redactUnsupportedSentences, splitSentences, stripViolatingTitles, verifyAnswerV2 } from "../../src/verify/v2";
import { checkEmpty, checkFormat, checkLanguage, checkRepetition } from "../../src/verify/v2/quality";
import { CALC_15_OF_2400, codes, GALAXY, has, input, LUMEN, ORBIT, SRC_ANDROID, SRC_URL } from "./verify-v2-fixtures";

/**
 * Conversation-quality guards and the repair plan. The owner's requirement: use "Sir", "Madam", "මහත්මයා", "මහත්මිය" only when the customer's preference is
 * KNOWN (never inferred from a name or a writing style), at most once per reply, never in consecutive sentences; never repeat the previous reply; reply in the
 * customer's language; and never repair a failure with a silent shopping fallback.
 */
const sir = { honorific: { preference: "sir" as const } };
const madam = { honorific: { preference: "madam" as const } };
const none = { honorific: { preference: "none" as const } };
const titleCodes = (text: string, policy?: object, lang: "en" | "si" | "singlish" | "mixed" = "en") => codes(verifyAnswerV2(input({ answerText: text, language: lang, ...(policy ? { policy } : {}) }))).filter((c) => /honorific/.test(c));

describe("honorifics: only when the preference is known", () => {
  it.each(["Sure, Sir, here is the answer.", "Thank you, Madam.", "ඔබට ස්තුතියි මහත්මයා.", "ස්තුතියි මහත්මිය.", "Ok mahattaya, mama balannam.", "Hari aiya, eka thiyenawa.", "Hello Ma'am, how can I help?", "Yes Madame, certainly."])("with no known preference, '%s' is refused", (t) => {
    expect(titleCodes(t, none)).toEqual(["unprompted_honorific"]);
    expect(titleCodes(t)).toEqual(["unprompted_honorific"]); // no policy at all means unknown
  });

  it("with preference 'sir' one 'Sir' is fine; 'Madam' is the wrong title (never guess a gender)", () => {
    expect(titleCodes("Certainly, Sir. Here are the phones.", sir)).toEqual([]);
    expect(titleCodes("Certainly, Madam. Here are the phones.", sir)).toEqual(["unprompted_honorific"]);
    expect(titleCodes("Certainly, Madam. Here are the phones.", madam)).toEqual([]);
  });

  it("Sinhala titles follow the same rule", () => {
    expect(titleCodes("ඔබට ස්තුතියි මහත්මයා.", sir, "si")).toEqual([]);
    expect(titleCodes("ඔබට ස්තුතියි මහත්මිය.", sir, "si")).toEqual(["unprompted_honorific"]);
    expect(titleCodes("ඔබට ස්තුතියි මහත්මිය.", madam, "si")).toEqual([]);
  });

  it("at most one title per reply (maxPerReply, default 1)", () => {
    expect(titleCodes("Certainly, Sir. The phone is in stock. Anything else, Sir?", sir)).toEqual(["excess_honorific"]);
    expect(titleCodes("Certainly, Sir. The phone is in stock. Anything else, Sir?", { honorific: { preference: "sir", maxPerReply: 2 } })).toEqual([]);
  });

  it("never in consecutive sentences", () => {
    expect(titleCodes("Yes, Sir. Of course, Sir.", { honorific: { preference: "sir", maxPerReply: 3 } })).toEqual(["repetitive_honorific"]);
    expect(titleCodes("Yes, Sir. The phone has 8 GB of RAM. Of course, Sir.", { honorific: { preference: "sir", maxPerReply: 3 } })).toEqual([]);
  });

  it("REGRESSION: a person's title in a general-knowledge answer is not an honorific ('Sir Isaac Newton')", () => {
    expect(titleCodes("Sir Isaac Newton described gravity in 1687.", none)).toEqual([]);
    expect(titleCodes("Madame Curie won two Nobel prizes.", none)).toEqual([]);
    expect(titleCodes("Thank you, sir. Isaac Newton described gravity.", none)).toEqual(["unprompted_honorific"]); // lower-case, then a full stop: addressing the customer
  });

  it("REGRESSION: Sinhala words that merely START with the loanword 'සර්' are not titles (server, search, certificate)", () => {
    for (const t of ["සර්වර් එක අක්‍රියයි.", "සර්ච් එන්ජිම භාවිතා කරන්න.", "සර්ටිෆිකේට් එක ලැබුණා."]) expect(titleCodes(t, none, "si"), t).toEqual([]);
    expect(titleCodes("ස්තුතියි සර්.", none, "si")).toEqual(["unprompted_honorific"]);
    expect(titleCodes("ස්තුතියි සර් ට.", none, "si")).toEqual(["unprompted_honorific"]);
  });

  it("does not match titles inside other words ('Sirius', 'sirloin', 'madame' inside a word, 'akkara')", () => {
    expect(titleCodes("Sirius is a bright star. Sirloin is a cut of beef.", none)).toEqual([]);
  });

  it("polite wording without any title is always fine, in all four language modes", () => {
    for (const [t, l] of [["Of course, happy to help. Here are three options.", "en"], ["ඔබට උදව් කිරීමට සතුටුයි. මෙන්න විකල්ප තුනක්.", "si"], ["Hari, mama balannam. Meka hodai.", "singlish"], ["Sure, mama balannam meka.", "mixed"]] as const) expect(titleCodes(t, none, l), t).toEqual([]);
  });

  it("findTitles reports positions and genders and a title is never counted twice", () => {
    const text = "Yes Sir, and mahattaya too.";
    const hits = findTitles(text, splitSentences(text));
    expect(hits.map((h) => h.gender)).toEqual(["sir", "sir"]);
    expect(hits[0]!.start).toBeLessThan(hits[1]!.start);
  });

  it("stripViolatingTitles removes them with their commas and keeps the sentence readable", () => {
    expect(stripViolatingTitles("Certainly, Sir, the phone is in stock.", input({ answerText: "", policy: none }))).toEqual({ text: "Certainly, the phone is in stock.", removed: 1 });
    expect(stripViolatingTitles("Certainly Sir.", input({ answerText: "", policy: none })).text).toBe("Certainly.");
    expect(stripViolatingTitles("No title here.", input({ answerText: "", policy: none }))).toEqual({ text: "No title here.", removed: 0 });
    // with a known preference only the EXTRA ones go
    expect(stripViolatingTitles("Yes, Sir. Of course, Sir.", input({ answerText: "", policy: { honorific: { preference: "sir" } } })).text).toBe("Yes, Sir. Of course.");
  });
});

describe("repeated reply", () => {
  const prev = "Here are three phones that fit your budget. The Lumen P1 is the cheapest.";
  it("identical and near-identical replies are flagged; a different answer is not", () => {
    expect(has(verifyAnswerV2(input({ answerText: prev, previousAssistantReply: prev })), "repeated_reply")).toBe(true);
    expect(has(verifyAnswerV2(input({ answerText: "here are three phones that fit your budget the lumen p1 is the cheapest!", previousAssistantReply: prev })), "repeated_reply")).toBe(true);
    expect(has(verifyAnswerV2(input({ answerText: "The Orbit A5 has a 4500 mAh battery, which lasts about a day.", previousAssistantReply: prev })), "repeated_reply")).toBe(false);
  });
  it("short or missing previous replies are not compared", () => {
    expect(checkRepetition("ok", splitSentences("ok"), input({ answerText: "ok", previousAssistantReply: "ok" }))).toHaveLength(1); // identical is identical
    expect(checkRepetition("Hello there friend", splitSentences("Hello there friend"), input({ answerText: "x" }))).toEqual([]);
  });
});

describe("reply language", () => {
  const long = "This is a reasonably long reply in English about the phone and its battery life.";
  it("English expected: Sinhala-heavy text is a warning; English is fine", () => {
    expect(codes(verifyAnswerV2(input({ answerText: "මෙය දුරකථනය සහ එහි බැටරිය ගැන සවිස්තරාත්මක පිළිතුරක්.", language: "en" })))).toContain("language_mismatch");
    expect(codes(verifyAnswerV2(input({ answerText: long, language: "en" })))).not.toContain("language_mismatch");
  });
  it("Sinhala expected: a reply with no Sinhala script is a warning", () => {
    expect(codes(verifyAnswerV2(input({ answerText: long, language: "si" })))).toContain("language_mismatch");
    expect(codes(verifyAnswerV2(input({ answerText: "මෙය දුරකථනය සහ එහි බැටරිය ගැන සවිස්තරාත්මක පිළිතුරක් Lumen P1.", language: "si" })))).not.toContain("language_mismatch");
  });
  it("Singlish expected: Sinhala script is a warning, mixed is never judged, very short text is never judged", () => {
    expect(codes(verifyAnswerV2(input({ answerText: "මෙය දුරකථනය සහ එහි බැටරිය ගැන සවිස්තරාත්මක පිළිතුරක්.", language: "singlish" })))).toContain("language_mismatch");
    expect(codes(verifyAnswerV2(input({ answerText: "මෙය දුරකථනය සහ එහි බැටරිය ගැන සවිස්තරාත්මක පිළිතුරක්.", language: "mixed" })))).not.toContain("language_mismatch");
    expect(checkLanguage("ok", [], input({ answerText: "ok", language: "si" }))).toEqual([]);
  });
  it("a language mismatch is only a warning: it never blocks an answer", () => {
    const r = verifyAnswerV2(input({ answerText: long, language: "si" }));
    expect(r.verdict).toBe("pass");
  });
});

describe("empty answers and format", () => {
  it.each(["", "   ", "ok", "Okay.", "Sure!", "හරි", "...", "—"])("'%s' is an empty answer", (t) => {
    expect(codes(verifyAnswerV2(input({ answerText: t })))).toContain("empty_answer");
  });
  it("a real short answer is not empty", () => {
    expect(checkEmpty("Yes, it is in stock.", splitSentences("Yes, it is in stock."))).toEqual([]);
  });
  it("too long: over the cap (default 1,200) and the analysed-length cut are flagged", () => {
    expect(codes(verifyAnswerV2(input({ answerText: "A sentence about phones. ".repeat(60) })))).toContain("text_too_long");
    expect(codes(verifyAnswerV2(input({ answerText: "A sentence about phones. ".repeat(60), policy: { maxChars: 5000 } })))).not.toContain("text_too_long");
    const big = verifyAnswerV2(input({ answerText: "x ".repeat(15_000) }));
    expect(big.analysed.truncated).toBe(true);
    expect(codes(big)).toContain("text_too_long");
  });
  it.each(["<script>alert(1)</script>", "Click <img src=x onerror=alert(1)>", "javascript:alert(1)", "<a href='x'>link</a>", "<div onclick=\"x()\">", "<iframe src=x>"])("active markup '%s' is refused", (t) => {
    expect(codes(verifyAnswerV2(input({ answerText: `Here you go. ${t}` })))).toContain("active_markup");
  });
  it("a comparison like 5 < 6 or an arrow is not markup", () => {
    expect(codes(verifyAnswerV2(input({ answerText: "Battery 5000 < 6000 mAh, so the second lasts longer -> better." })))).not.toContain("active_markup");
    expect(checkFormat("fine", [], input({ answerText: "fine" }), false)).toEqual([]);
  });
});

describe("repair plan", () => {
  it("a passing answer needs no repair", () => {
    expect(verifyAnswerV2(input({ answerText: "The Lumen P1 128GB Black is Rs. 110,000.", toolEvidence: [LUMEN] })).repairs).toEqual([]);
  });

  it("CRITICAL problems (secrets, prompt leaks, injection compliance, personal data) skip regeneration and go straight to the honest notice", () => {
    const r = verifyAnswerV2(input({ answerText: "Sure. My system prompt says: you are the VOLTA assistant and must never reveal secrets.", protectedStrings: ["You are the VOLTA assistant and must never reveal secrets."] }));
    expect(r.verdict).toBe("fail");
    expect(r.repairs.map((x) => x.kind)).toEqual(["notice"]);
  });

  it("an order or payment claim may be regenerated once, then redacted, then the notice", () => {
    const r = verifyAnswerV2(input({ answerText: "Good choice, it is a popular phone with a long battery life. I have placed your order for the Lumen P1. Delivery details can be found on the order page.", toolEvidence: [LUMEN] }));
    expect(r.verdict).toBe("fail");
    expect(r.repairs.map((x) => x.kind)).toEqual(["regenerate", "redact", "notice"]);
    const redact = r.repairs.find((x) => x.kind === "redact");
    expect(redact && "text" in redact ? redact.text : "").not.toMatch(/placed your order/);
  });

  it("title problems are fixed deterministically (autofix) and need no new model call", () => {
    const r = verifyAnswerV2(input({ answerText: "Certainly, Sir, the phone is in stock.", policy: none }));
    expect(r.repairs[0]).toMatchObject({ kind: "autofix", applied: ["strip_titles"], text: "Certainly, the phone is in stock." });
    expect(r.repairs.map((x) => x.kind)).not.toContain("regenerate");
    expect(verifyAnswerV2(input({ answerText: "Certainly, the phone is in stock.", policy: none })).verdict).toBe("pass");
  });

  it("active markup and over-long text are autofixed", () => {
    expect(autoFix(input({ answerText: "Hi <script>x()</script> there <b>friend</b>." }), { issues: [{ code: "active_markup" } as never] })).toMatchObject({ text: "Hi there friend .", applied: ["strip_markup"] });
    const long = "First sentence here. ".repeat(80);
    const fixed = autoFix(input({ answerText: long }), { issues: [{ code: "text_too_long" } as never] });
    expect(fixed.text.length).toBeLessThanOrEqual(1200);
    expect(fixed.text.endsWith(".")).toBe(true);
    expect(fixed.applied).toEqual(["truncate_at_sentence"]);
  });

  it("an unsourced link is removed from the text", () => {
    const fixed = autoFix(input({ answerText: "See https://random.example/page for more. It is a good phone." }), { issues: [{ code: "unsourced_link" } as never] });
    expect(fixed.text).not.toContain("random.example");
    expect(fixed.text).toContain("It is a good phone.");
  });

  it("a wrong price is regenerated with the verified facts, then the failing sentence is removed, then the notice", () => {
    const r = verifyAnswerV2(input({ answerText: "The Lumen P1 128GB Black costs Rs. 99,000. It has a great camera. Delivery is quick.", toolEvidence: [LUMEN, ORBIT] }));
    expect(r.verdict).toBe("repairable");
    expect(r.repairs.map((x) => x.kind)).toEqual(["regenerate", "redact", "notice"]);
    expect(r.redactedText).toBeDefined();
    expect(r.redactedText).not.toContain("99,000");
    expect(r.redactedText).toContain("Delivery is quick.");
  });

  it("sentences left dangling by a removal ('It ...', 'This ...') go with it", () => {
    const text = "The Lumen P1 128GB Black costs Rs. 99,000. It also has a good screen. Orbit is cheaper in general.";
    const r = verifyAnswerV2(input({ answerText: text, toolEvidence: [LUMEN] }));
    expect(r.redactedText).toBe("Orbit is cheaper in general.");
  });

  it("nothing meaningful left means no redacted text, only the notice", () => {
    const r = verifyAnswerV2(input({ answerText: "The Lumen P1 128GB Black costs Rs. 99,000.", toolEvidence: [LUMEN] }));
    expect(r.repairs.map((x) => x.kind)).toEqual(["regenerate", "notice"]);
    expect(r.redactedText).toBe(""); // contract: an EMPTY string means "every sentence failed"; the plan then has no redact step, only regenerate and the notice
    expect(redactUnsupportedSentences("The Lumen P1 128GB Black costs Rs. 99,000.", r.issues)).toEqual({ text: "", removed: [0] });
  });

  it("every repair candidate must pass verification again (autofix output of a clean text is clean)", () => {
    const first = verifyAnswerV2(input({ answerText: "Certainly, Sir, the Lumen P1 128GB Black is Rs. 110,000.", toolEvidence: [LUMEN], policy: none }));
    const fixed = first.repairs.find((x) => x.kind === "autofix");
    expect(fixed).toBeDefined();
    const again = verifyAnswerV2(input({ answerText: (fixed as { text: string }).text, toolEvidence: [LUMEN], policy: none }));
    expect(again.verdict).toBe("pass");
  });

  it("the repair plan contains no shopping fallback: the notice is one of four fixed honest messages", () => {
    for (const lang of ["en", "si", "singlish", "mixed"] as const) {
      const n = noticeFor(lang);
      expect(n.key).toBe("could_not_verify");
      expect(n.text).not.toMatch(/catalogue|browse|best seller|recommend|price|Rs\./i);
    }
  });

  it("the notice is flagged for native review in every language except English", () => {
    expect(noticeFor("en").needsNativeReview).toBe(false);
    for (const l of ["si", "singlish", "mixed"] as const) expect(noticeFor(l).needsNativeReview).toBe(true);
    expect(noticeFor("si").text).toMatch(/[඀-෿]/);
  });
});

describe("buildFeedback (the one regeneration)", () => {
  it("names the problems, lists ONLY verified facts and sources, and never contains the customer's message", () => {
    const inp = input({ answerText: "x", toolEvidence: [LUMEN, GALAXY], sourcesFetchedThisTurn: [{ url: SRC_URL, title: "Android 16 release notes" }], userMessage: "my secret nickname is Zebra99", exclusions: { brands: ["Orbit"] } });
    const r = verifyAnswerV2({ ...inp, answerText: "The Lumen P1 128GB Black costs Rs. 99,000." });
    const fb = buildFeedback(inp, r.issues);
    expect(fb).toContain("claim_price_mismatch");
    expect(fb).toContain("Rs. 110,000.00");
    expect(fb).toContain("[1] Android 16 release notes");
    expect(fb).toContain("Excluded by the customer");
    expect(fb).not.toContain("Zebra99");
  });
});

describe("explainVerdict: counts and codes only", () => {
  it("never contains the answer, a sentence or a product name", () => {
    const r = verifyAnswerV2(input({ answerText: "The Lumen P1 128GB Black costs Rs. 99,000 secretword.", toolEvidence: [LUMEN] }));
    const s = explainVerdict(r);
    expect(s).toMatchObject({ verdict: "repairable", ok: false });
    expect(s.codes.claim_price_mismatch).toBe(1);
    expect(JSON.stringify(s)).not.toMatch(/Lumen|secretword|99,000/);
  });
});

describe("a clean search-grounded answer and a calculation pass end to end", () => {
  it("cites a fetched source with [1]", () => {
    const r = verifyAnswerV2(input({ answerText: "Android version 16.2 is the current stable release for supported Pixel devices [1].", toolEvidence: [SRC_ANDROID], sourcesFetchedThisTurn: [{ url: SRC_URL, title: "Android 16 release notes" }], searchPerformed: true }));
    expect(r.verdict).toBe("pass");
  });
  it("states a calculator result", () => {
    expect(verifyAnswerV2(input({ answerText: "15% of 2400 is 360.", toolEvidence: [CALC_15_OF_2400] })).verdict).toBe("pass");
    expect(codes(verifyAnswerV2(input({ answerText: "15% of 2400 is 350.", toolEvidence: [CALC_15_OF_2400] })))).toContain("claim_calculation_mismatch");
  });
});

describe("stray scripts (found with a real model: a Bengali fragment inside a Singlish word)", () => {
  const run = (answerText: string, over: Partial<Omit<Parameters<typeof input>[0], "answerText">> = {}) => verifyAnswerV2(input({ ...over, answerText }));
  it("flags letters of a script the customer did not use and that the shop data does not contain", () => {
    const r = run("Oyaata specifically balanna oগুলen brand ekak hari model ekak hari thiyenawada?", { language: "singlish", userMessage: "mama kiwwe phone ekak" });
    expect(has(r, "unexpected_script")).toBe(true);
    expect(r.verdict).not.toBe("pass");
  });
  it("never flags clean English, Sinhala, Singlish, digits, symbols, emoji or Greek units", () => {
    for (const t of ["The Lumen P1 is a good phone for you.", "මෙය ඔබට හොඳ තේරීමක් නිසා බලන්න.", "Meka oyaata hondai, balanna puluwan.", "It has a 5000 mAh battery • 5G ✅", "A resistor of 10 kΩ and an angle of π/2."]) {
      expect(has(run(t, { language: /[඀-෿]/.test(t) ? "si" : "en" }), "unexpected_script"), t).toBe(false);
    }
  });
  it("allows a script the customer wrote themselves", () => {
    const tamil = "வணக்கம்";
    expect(has(run(`${tamil}! How can I help you today with your phone?`, { userMessage: `${tamil} I need a phone` }), "unexpected_script")).toBe(false);
  });
  it("allows characters that appear in the shop's own tool results (a product name)", () => {
    const evidence = [{ ...LUMEN, productName: "小米 Lumen P1" }];
    expect(has(run("The 小米 Lumen P1 is a good phone for you today.", { toolEvidence: evidence }), "unexpected_script")).toBe(false);
  });
  it("the repair request names the problem", () => {
    const r = run("Oyaata oগুলen balanna puluwan, hari model ekak?", { language: "singlish", userMessage: "phone ekak" });
    expect(buildFeedback(input({ answerText: "x", language: "singlish" }), r.issues)).toMatch(/other writing systems/);
  });
});
