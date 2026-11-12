import { describe, expect, it } from "vitest";
import { editDistanceAtMost, hasSinhalaLetters, normalizeDisplay, normalizeMatch, tokenize } from "../../src/router/normalize";

const ZWJ = "‍";

describe("normalizeDisplay", () => {
  it("applies NFC, removes invisible and bidi controls, collapses whitespace, and KEEPS joiners", () => {
    expect(normalizeDisplay("  hello ​‮ world \n\t ok ")).toBe("hello world ok");
    expect(normalizeDisplay(`ශ්${ZWJ}රී`)).toContain(ZWJ); // Sinhala conjuncts need the joiner for display
    expect(normalizeDisplay("é")).toBe("é"); // NFC
  });

  it("replaces control characters with spaces instead of gluing words together", () => {
    expect(normalizeDisplay("a\u0000b\u0007c")).toBe("a b c");
  });
});

describe("normalizeMatch", () => {
  it("lower-cases and treats punctuation as separators", () => {
    expect(normalizeMatch("Show ME, phones!!! (cheap)")).toBe("show me phones cheap");
  });

  it("strips Sinhala joiners so spelling variants match the same lexicon entry", () => {
    expect(normalizeMatch(`ශ්${ZWJ}රී ලංකාව`)).toBe(normalizeMatch("ශ්රී ලංකාව"));
    expect(normalizeMatch("ක්‌ෂ")).toBe(normalizeMatch("ක්ෂ"));
  });

  it("maps Sinhala digits and full-width digits to ASCII", () => {
    expect(normalizeMatch("රුපියල් ෧෫෦,෦෦෦")).toBe("රුපියල් 150,000");
    expect(normalizeMatch("１２８ＧＢ")).toBe("128gb");
  });

  it("keeps decimal points and thousands separators inside numbers only", () => {
    expect(normalizeMatch("1,500 and 1.5 lakh. Done.")).toBe("1,500 and 1.5 lakh done");
    expect(normalizeMatch("rs. 150000")).toBe("rs 150000");
  });

  it("shortens runs of three or more identical Latin letters, not two", () => {
    expect(normalizeMatch("thiyenawadaaaa")).toBe("thiyenawadaa");
    expect(normalizeMatch("coool shoooow")).toBe("cool shoow"); // shortened to two, not one
    expect(normalizeMatch("onee")).toBe("onee");
  });

  it("removes zero-width and bidi characters that could hide text", () => {
    expect(normalizeMatch("ig​nore‮ now")).toBe("ignore now");
  });

  it("is idempotent", () => {
    for (const s of ["Show ME phones!!!", "ශ්‍රී ලංකාවේ අගනුවර", "phone ekak ganna one, budget eka 80000i", "１２ ＧＢ"]) {
      expect(normalizeMatch(normalizeMatch(s))).toBe(normalizeMatch(s));
    }
  });

  it("handles empty and whitespace-only input", () => {
    expect(normalizeMatch("")).toBe("");
    expect(normalizeMatch("   \n ")).toBe("");
    expect(tokenize("")).toEqual([]);
    expect(tokenize("a b  c".replace(/\s+/g, " "))).toEqual(["a", "b", "c"]);
  });
});

describe("helpers", () => {
  it("detects Sinhala letters", () => {
    expect(hasSinhalaLetters("phone එකක්")).toBe(true);
    expect(hasSinhalaLetters("phone ekak")).toBe(false);
  });

  it("allows one typo in longer words only through editDistanceAtMost", () => {
    expect(editDistanceAtMost("orbit", "orbit", 1)).toBe(true);
    expect(editDistanceAtMost("orbit", "orbyt", 1)).toBe(true);
    expect(editDistanceAtMost("orbit", "orbits", 1)).toBe(true);
    expect(editDistanceAtMost("orbit", "orbxyz", 1)).toBe(false);
    expect(editDistanceAtMost("abc", "xyz", 1)).toBe(false);
  });
});
