import { describe, expect, it } from "vitest";
import { extractAmounts, fold, planRepair, splitSentences, verifyAnswerV2, type VerifyV2Input } from "../../src/verify/v2";
import { CASES } from "./verify-v2-compare-data";
import { GALAXY, LUMEN, ORBIT, SRC_ANDROID, SRC_URL } from "./verify-v2-fixtures";

/** Verifier v2 is pure, deterministic and fast: it must never throw, never mutate its input, never take long, and always return the same answer for the same input. */
let seed = 20261114;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;

const ALPHABETS = ["abcdefghijklmnopqrstuvwxyz ", "ABC 0123456789.,%/-+", "අආඉඊඋඌ්ා ිීු ෙ.", "RsLKR රු.0123456789, ", "!@#$%^&*()<>[]{}\"'`~|\\/", "​‮⁦­﻿ \u{E0041}", "😀🙂👍 \n\t\r"];
const randomText = (len: number): string => {
  const a = pick(ALPHABETS);
  let s = "";
  for (let i = 0; i < len; i++) s += rnd() < 0.15 ? pick(ALPHABETS)[Math.floor(rnd() * 5)]! : a[Math.floor(rnd() * a.length)]!;
  return s;
};
const base = (text: string, over: Partial<VerifyV2Input> = {}): VerifyV2Input => ({ answerText: text, language: "en", toolEvidence: [LUMEN, ORBIT, GALAXY, SRC_ANDROID], sourcesFetchedThisTurn: [{ url: SRC_URL, title: "t" }], searchPerformed: true, userMessage: "budget 100000", ...over });

const deepFreeze = <T,>(o: T): T => {
  if (o && typeof o === "object") {
    Object.freeze(o);
    for (const v of Object.values(o as object)) deepFreeze(v);
  }
  return o;
};

describe("never throws, never mutates", () => {
  it("survives 1,500 random strings of random length in every language mode", () => {
    const langs = ["en", "si", "singlish", "mixed"] as const;
    for (let i = 0; i < 1_500; i++) {
      const text = randomText(Math.floor(rnd() * 600));
      expect(() => verifyAnswerV2(base(text, { language: pick(langs) }))).not.toThrow();
    }
  });

  it("survives mutated realistic answers (character swaps, deletions, doubled punctuation)", () => {
    for (const c of CASES) {
      for (let k = 0; k < 12; k++) {
        const chars = [...c.text];
        for (let m = 0; m < 3; m++) {
          const i = Math.floor(rnd() * chars.length);
          const r = rnd();
          if (r < 0.34) chars.splice(i, 1);
          else if (r < 0.67) chars.splice(i, 0, pick([".", "!", "​", "9", " ", "Rs.", "<"]));
          else chars[i] = pick(["0", "x", "Ω", "ක", "\n"]);
        }
        expect(() => verifyAnswerV2(base(chars.join("")))).not.toThrow();
      }
    }
  });

  it("does not modify its input (deep-frozen input, including the evidence)", () => {
    const input = deepFreeze(base("The Lumen P1 128GB Black costs Rs. 99,000. Certainly, Sir. I searched online [1] https://fake.example/x"));
    expect(() => verifyAnswerV2(input)).not.toThrow();
    expect(() => planRepair(verifyAnswerV2(input), input)).not.toThrow();
  });

  it("is deterministic: the same input gives the same result", () => {
    for (const c of CASES.slice(0, 20)) {
      const a = JSON.stringify(verifyAnswerV2(base(c.text)));
      const b = JSON.stringify(verifyAnswerV2(base(c.text)));
      expect(a).toBe(b);
    }
  });

  it("handles empty or odd inputs without throwing", () => {
    expect(verifyAnswerV2(base("")).verdict).toBe("repairable");
    expect(() => verifyAnswerV2({ ...base("x"), toolEvidence: [] , sourcesFetchedThisTurn: [] })).not.toThrow();
    expect(() => verifyAnswerV2(base(undefined as never))).not.toThrow();
    expect(() => verifyAnswerV2(base("x", { toolEvidence: [{ tool: "t", kind: "product" } as never, { tool: "t", kind: "weird" } as never] }))).not.toThrow();
    expect(() => verifyAnswerV2(base("x", { policy: { honorific: { preference: "sir", maxPerReply: -5 } } }))).not.toThrow();
  });
});

describe("bounded time", () => {
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
  const time = (fn: () => void): number => {
    const t0 = performance.now();
    fn();
    return performance.now() - t0;
  };

  it("a typical 4,000-character answer takes well under 50 ms (median of 40 runs)", () => {
    const text = CASES.map((c) => c.text).join(" ").slice(0, 4_000).padEnd(4_000, " More words about phones.");
    const times = Array.from({ length: 40 }, () => time(() => verifyAnswerV2(base(text))));
    expect(median(times)).toBeLessThan(50);
    expect(Math.max(...times)).toBeLessThan(500);
  });

  it("a 100 kB answer is cut for analysis (20,000 characters) and still finishes quickly", () => {
    const t = time(() => {
      const r = verifyAnswerV2(base("The Lumen P1 128GB Black has 8GB RAM. ".repeat(3_000)));
      expect(r.analysed.truncated).toBe(true);
    });
    expect(t).toBeLessThan(1_500);
  });

  it.each([
    ["digits", "1".repeat(20_000)],
    ["money-like runs", "Rs. 1,".repeat(3_000)],
    ["dots", ".".repeat(20_000)],
    ["urls", "http://a.b/ ".repeat(1_500)],
    ["brackets", "[1]".repeat(6_000)],
    ["titles", "Sir, ".repeat(3_000)],
    ["spec cues", "8GB RAM 128GB storage ".repeat(800)],
    ["product names", "Lumen P1 128GB Black ".repeat(800)],
    ["percent of", "15% of 2400 is 360. ".repeat(900)],
    ["newlines", "line\n".repeat(10_000)],
    ["combining marks", "a" + "́".repeat(15_000)],
    ["sinhala", "අ".repeat(15_000)],
  ])("hostile input stays fast: %s", (_n, text) => {
    expect(time(() => verifyAnswerV2(base(text)))).toBeLessThan(1_500);
  });

  it("the small utilities are linear on long input", () => {
    expect(time(() => extractAmounts(fold("Rs. 1,000 ".repeat(5_000))))).toBeLessThan(1_000);
    expect(time(() => splitSentences("A sentence. ".repeat(10_000)))).toBeLessThan(500);
  });
});
