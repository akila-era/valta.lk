import { describe, expect, it } from "vitest";
import { extractAmounts, fold, splitSentences, verifyAnswerV2 } from "../../src/verify/v2";
import { CALC_15_OF_2400, GALAXY, LUMEN, NOSPEC, ORBIT, codes, has, input } from "./verify-v2-fixtures";

const ev = [LUMEN, ORBIT, GALAXY, NOSPEC];
const v = (answerText: string, over: Parameters<typeof input>[0] extends infer T ? Partial<T> : never = {}) => verifyAnswerV2(input({ answerText, toolEvidence: ev, ...over }));

describe("text utilities", () => {
  it("folds Sinhala digits 1:1 and lower-cases ASCII without changing offsets", () => {
    const t = "රු. ෧෨,000 Lumen";
    expect(fold(t).length).toBe(t.length);
    expect(fold(t)).toBe("රු. 12,000 lumen");
  });
  it("does not split 'Rs. 110,000' or '6.7 inch' into sentences, but splits real ones", () => {
    expect(splitSentences("The Lumen P1 costs Rs. 110,000. It has a 6.7 inch screen!").map((s) => s.text)).toEqual(["The Lumen P1 costs Rs. 110,000.", "It has a 6.7 inch screen!"]);
    expect(splitSentences("line one\nline two").length).toBe(2);
  });
  it("extracts money in the forms shoppers write", () => {
    const m = (s: string) => extractAmounts(fold(s)).map((a) => a.minor);
    expect(m("Rs. 110,000")).toEqual([11_000_000]);
    expect(m("LKR 99900")).toEqual([9_990_000]);
    expect(m("රු. 85,000")).toEqual([8_500_000]);
    expect(m("රුපියල් 85000")).toEqual([8_500_000]);
    expect(m("85,000/=")).toEqual([8_500_000]);
    expect(m("110000 rupees")).toEqual([11_000_000]);
    expect(m("Rs. 50,000 - 70,000")).toEqual([5_000_000, 7_000_000]);
    expect(m("1.5 lakh")).toEqual([15_000_000]);
    expect(m("laksha dekak wage budget")).toEqual([20_000_000]);
    expect(m("ලක්ෂ 2")).toEqual([20_000_000]);
    expect(m("budget 150k")).toEqual([15_000_000]);
    expect(m("a 4k display")).toEqual([]); // not a price
  });
});

describe("(a) price grounding", () => {
  it("accepts prices that equal the list or the offer price, in any format", () => {
    expect(v("The Lumen P1 costs Rs. 110,000 right now.").ok).toBe(true);
    expect(v("Lumen P1 eke mila LKR 120000 (list price).").ok).toBe(true);
    expect(v("Lumen P1 එකේ මිල රු. 110,000 යි.").ok).toBe(true);
    expect(v("The Lumen P1 is priced at 110,000/=.").ok).toBe(true);
  });
  it("accepts the Sinhala-digit form of a true price", () => {
    expect(v("Lumen P1 එකේ මිල රු. ෧෧෦,෦෦෦ යි.").ok).toBe(true);
  });
  it("flags a price that differs from the evidence", () => {
    const r = v("The Lumen P1 costs Rs. 99,000 right now.");
    expect(r.ok).toBe(false);
    expect(has(r, "claim_price_mismatch")).toBe(true);
    expect(r.verdict).toBe("repairable");
  });
  it("inherits the product from the previous sentence", () => {
    expect(has(v("I recommend the Lumen P1. It costs Rs. 99,000."), "claim_price_mismatch")).toBe(true);
    expect(v("I recommend the Lumen P1. It costs Rs. 110,000.").ok).toBe(true);
  });
  it("accepts a difference or a sum of two listed prices, the user's own budget and a calculator result", () => {
    expect(v("The Lumen P1 (Rs. 110,000) is Rs. 25,000 more than the Orbit A7 Camera Edition (Rs. 85,000).").ok).toBe(true);
    expect(v("Lumen P1 and Orbit A7 Camera Edition together are Rs. 195,000.").ok).toBe(true);
    expect(v("Within your budget of Rs. 100,000, the Orbit A7 Camera Edition is Rs. 85,000.", { userMessage: "my budget is Rs. 100,000" }).ok).toBe(true);
    const calc = verifyAnswerV2(input({ answerText: "The discount is Rs. 360.", toolEvidence: [...ev, { tool: "calculate", kind: "calculation", calculation: { result: 360 } }] }));
    expect(calc.ok).toBe(true);
  });
  it("flags a store-looking price with no product evidence this turn", () => {
    const r = verifyAnswerV2(input({ answerText: "The Zenith Q9 costs Rs. 145,000 at our shop." }));
    expect(has(r, "ungrounded_price")).toBe(true);
  });
  it("accepts shorthand within 1 % of a listed price but not 'about 150k' for a 110,000 price", () => {
    expect(v("The Lumen P1 is about 110k.").ok).toBe(true);
    expect(has(v("The Lumen P1 is about 150k."), "claim_price_mismatch")).toBe(true);
  });
  it("does NOT flag numbers that are not store prices", () => {
    expect(v("The Lumen P1 was launched in 2023 and has a 6.7 inch screen.").ok).toBe(true);
    expect(verifyAnswerV2(input({ answerText: "About 2 lakh people attended the event in 2019, and it had 4k screens." })).ok).toBe(true);
    expect(verifyAnswerV2(input({ answerText: "The average smartphone costs about $999 in the US." })).ok).toBe(true);
    expect(verifyAnswerV2(input({ answerText: "Python 3.12 was released in October 2023 and has 5 new features." })).ok).toBe(true);
  });
});

describe("(a) stock claims", () => {
  it("accepts true stock statements in English, Singlish and Sinhala", () => {
    expect(v("The Lumen P1 is in stock.").ok).toBe(true);
    expect(v("Lumen P1 stock eka thiyenawa.").ok).toBe(true);
    expect(v("Lumen P1 තොගයේ ඇත.").ok).toBe(true);
    expect(v("The Orbit A7 Camera Edition is out of stock.").ok).toBe(true);
    expect(v("Orbit A7 Camera Edition stock eka nathi.").ok).toBe(true);
  });
  it("flags stock statements that contradict the evidence", () => {
    expect(has(v("The Orbit A7 Camera Edition is in stock."), "claim_stock_mismatch")).toBe(true);
    expect(has(v("Lumen P1 is out of stock."), "claim_stock_mismatch")).toBe(true);
    expect(has(v("Orbit A7 Camera Edition stock eka thiyenawa."), "claim_stock_mismatch")).toBe(true);
  });
  it("checks quantities exactly against the evidence", () => {
    expect(v("Only 5 units left of the Lumen P1.").ok).toBe(true);
    expect(has(v("Only 3 units left of the Lumen P1."), "claim_stock_mismatch")).toBe(true);
    expect(has(v("Only 2 units left of the Vega Z2."), "claim_ungrounded") || has(v("Only 2 units left of the Vega Z2."), "claim_stock_mismatch")).toBe(true);
  });
  it("flags a stock claim when the evidence has no stock information", () => {
    expect(has(v("The Vega Z2 is in stock."), "claim_ungrounded")).toBe(true);
  });
  it("does not flag 'available in black' or a product not in the evidence", () => {
    expect(v("The Lumen P1 is available in black and white.").ok).toBe(true);
    expect(verifyAnswerV2(input({ answerText: "Most shops have it in stock." })).ok).toBe(true);
  });
});

describe("(b) specification claims", () => {
  it("accepts specs that match, with unit normalisation (8GB = 8 GB = 8 ජීබී)", () => {
    expect(v("The Lumen P1 has 8GB RAM and 128 GB storage.").ok).toBe(true);
    expect(v("Lumen P1 එකේ RAM 8 ජීබී සහ 5000 mAh battery එකක් තියෙනවා.").ok).toBe(true);
    expect(v("The Lumen P1 comes with an 8GB/128GB configuration and a 50MP camera.").ok).toBe(true);
    expect(v("It runs on Snapdragon 8 Gen 2 with a 6.7-inch display. The Lumen P1 is a great choice.").ok).toBe(true);
  });
  it("flags a spec that differs or is not listed", () => {
    expect(has(v("The Lumen P1 has 12GB RAM."), "claim_spec_mismatch")).toBe(true);
    expect(has(v("The Lumen P1 has a 6000 mAh battery."), "claim_spec_mismatch")).toBe(true);
    expect(has(v("The Vega Z2 has 8GB RAM."), "claim_spec_mismatch")).toBe(true); // no spec listed for Vega
    expect(has(v("Lumen P1 has a 120Hz display."), "claim_spec_mismatch")).toBe(true); // refresh rate not listed
  });
  it("a bare number without a cue word is not a claim, and non-store devices are free", () => {
    expect(v("The Lumen P1 ships with a 25 GB cloud trial.").ok).toBe(true);
    expect(verifyAnswerV2(input({ answerText: "The iPhone 15 has 6GB RAM.", toolEvidence: ev })).ok).toBe(true);
  });
  it("accepts 'about' wording within 5 %", () => {
    expect(v("The Lumen P1 has about 5100 mAh of battery.").ok).toBe(true);
    expect(has(v("The Lumen P1 has a 5100 mAh battery."), "claim_spec_mismatch")).toBe(true);
  });
  it("accepts the 'not listed' wording", () => {
    expect(v("The camera of the Vega Z2 is not listed (I can't confirm 50MP).").ok).toBe(true);
  });
});

describe("arithmetic the answer states", () => {
  it("accepts correct and flags wrong arithmetic, with or without a calculator result", () => {
    expect(verifyAnswerV2(input({ answerText: "15% of 2400 is 360.", toolEvidence: [CALC_15_OF_2400] })).ok).toBe(true);
    expect(verifyAnswerV2(input({ answerText: "15% of 2400 is 360." })).ok).toBe(true);
    expect(has(verifyAnswerV2(input({ answerText: "15% of 2400 is 380." })), "claim_calculation_mismatch")).toBe(true);
    expect(has(verifyAnswerV2(input({ answerText: "12 × 12 = 140" })), "claim_calculation_mismatch")).toBe(true);
    expect(verifyAnswerV2(input({ answerText: "12 × 12 = 144" })).ok).toBe(true);
  });
});

describe("(c) exclusions", () => {
  const ex = { exclusions: { brands: ["Samsung"] } };
  it("flags an excluded brand presented as an option", () => {
    const r = v("I recommend the Samsung Galaxy A55 for you.", ex);
    expect(has(r, "excluded_item_recommended")).toBe(true);
  });
  it("accepts acknowledging the exclusion", () => {
    expect(v("Understood, I won't recommend Samsung. The Lumen P1 is a good alternative.", ex).ok).toBe(true);
    expect(v("Samsung epa kiyala kiwwa nisa, Lumen P1 eka balamu.", ex).ok).toBe(true);
    expect(v("Instead of Samsung, consider the Lumen P1.", ex).ok).toBe(true);
    expect(v("Samsung නැතුව Lumen P1 එක බලමු.", { exclusions: { brands: ["Samsung"] } }).ok).toBe(true);
  });
  it("does not trip on a different brand or an unrelated word", () => {
    expect(v("The Lumen P1 is a great phone.", ex).ok).toBe(true);
  });
  it("handles product and category exclusions", () => {
    expect(has(v("You might like the Orbit A7 Camera Edition.", { exclusions: { products: ["Orbit A7 Camera Edition"] } }), "excluded_item_recommended")).toBe(true);
    expect(has(v("A tablet could suit you.", { exclusions: { categories: ["tablet"] } }), "excluded_item_recommended")).toBe(true);
  });
});

describe("(g) explicitly not flagged", () => {
  it("passes ordinary grounded answers in three languages", () => {
    for (const t of [
      "The Lumen P1 is in stock at Rs. 110,000 with 8GB RAM and a 5000 mAh battery, so it should last a full day.",
      "Lumen P1 එකේ මිල රු. 110,000 යි, RAM 8 ජීබී, තොගයේ ඇත.",
      "Lumen P1 eka Rs. 110,000 yi, stock eka thiyenawa, RAM 8GB.",
      "The capital of France is Paris, and it has about 2.1 million residents.",
      "Sri Lanka has 25 districts and 9 provinces.",
      "Polite Sinhala without titles: ඔබට ස්තුතියි, තවත් මොනවා හරි දැනගන්න ඕනද?",
    ]) {
      const r = v(t);
      expect(r.issues.filter((i) => i.severity !== "warn" && i.severity !== "info"), t).toEqual([]);
    }
  });
});

it("returns stable issue shapes with spans inside the text", () => {
  const text = "Intro sentence. The Lumen P1 costs Rs. 99,000.";
  const r = v(text);
  const i = r.issues.find((x) => x.code === "claim_price_mismatch")!;
  expect(i.start).toBeGreaterThanOrEqual(0);
  expect(i.end).toBeLessThanOrEqual(text.length);
  expect(i.sentence).toBe("The Lumen P1 costs Rs. 99,000.");
  expect(i.sentenceIndex).toBe(1);
  expect(codes(r)).toContain("claim_price_mismatch");
});
