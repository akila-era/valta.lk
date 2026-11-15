import { describe, expect, it } from "vitest";
import { CALC_LIMITS, CalcError, calculate } from "../../src/tools/llm/calculator";

const val = (e: string) => calculate(e).result;
const code = (e: string): string | null => {
  try {
    calculate(e);
    return null;
  } catch (err) {
    return err instanceof CalcError ? err.code : `NOT_A_CALC_ERROR: ${String(err)}`;
  }
};

describe("calculator: exact arithmetic", () => {
  it.each([
    ["15% * 2400", "360"],
    ["15%*2400", "360"],
    ["2400 * 15%", "360"],
    ["5%", "0.05"],
    ["100 - 15%", "99.85"],
    ["0.1 + 0.2", "0.3"],
    ["10 / 4", "2.5"],
    ["2 ^ 10", "1024"],
    ["2 ** 3", "8"],
    ["2 ^ -2", "0.25"],
    ["2 ^ 3 ^ 2", "512"],
    ["-(3 + 4) * 2", "-14"],
    ["(1 + 2) * (3 + 4)", "21"],
    ["1,234 + 1", "1235"],
    ["7 × 3", "21"],
    ["12 ÷ 4", "3"],
    ["7 x 3", "21"],
    ["10 − 4", "6"],
    ["sqrt(16)", "4"],
    ["sqrt(2.25)", "1.5"],
    ["abs(-4.5)", "4.5"],
    ["round(2.5)", "3"],
    ["round(-2.5)", "-3"],
    ["round(1.23456, 2)", "1.23"],
    ["min(3, 1, 2)", "1"],
    ["max(3, 1, 2)", "3"],
    ["--5", "5"],
    ["+7", "7"],
    ["0.5 * 0.5", "0.25"],
    ["1000000 * 1000000", "1000000000000"],
    ["15% * 2400 + 100", "460"],
    ["  12  +  3  ", "15"],
    ["0", "0"],
    ["-0", "0"],
    ["(2400 - 400) * 20%", "400"],
  ])("%s = %s", (e, expected) => {
    expect(val(e)).toBe(expected);
  });

  it("marks a repeating fraction as not exact and rounds it to 10 places", () => {
    const r = calculate("1/3");
    expect(r).toMatchObject({ result: "0.3333333333", exact: false });
    expect(calculate("2/3").result).toBe("0.6666666667");
    expect(calculate("1/4").exact).toBe(true);
  });

  it("marks a square root that is not exact", () => {
    const r = calculate("sqrt(2)");
    expect(r.result).toBe("1.4142135623");
    expect(r.exact).toBe(false);
    expect(calculate("sqrt(16)").exact).toBe(true);
  });

  it("returns the normalised, fully bracketed form so a reader can see how it was understood", () => {
    expect(calculate("1 + 2 * 3").normalised).toBe("(1 + (2 * 3))");
    expect(calculate("15% * 2400").normalised).toBe("((15%) * 2400)");
  });

  it("gives resultNumber only when it is a safe JS number", () => {
    expect(calculate("360").resultNumber).toBe(360);
    expect(calculate("10 ^ 30").resultNumber).toBeNull();
  });

  it("matches BigInt arithmetic on random integer expressions", () => {
    let seed = 12345;
    const rnd = (n: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    for (let i = 0; i < 300; i++) {
      const [a, b, c, d] = [rnd(1000), rnd(1000) + 1, rnd(1000), rnd(50) + 1];
      expect(val(`${a} + ${b} * ${c} - ${d}`)).toBe(String(BigInt(a) + BigInt(b) * BigInt(c) - BigInt(d)));
      expect(val(`(${a} - ${c}) * ${d}`)).toBe(String((BigInt(a) - BigInt(c)) * BigInt(d)));
    }
  });
});

describe("calculator: everything else is refused with a stable code", () => {
  it.each([
    ["", "EMPTY"],
    ["   ", "EMPTY"],
    ["1/0", "DIVISION_BY_ZERO"],
    ["5 / (3 - 3)", "DIVISION_BY_ZERO"],
    ["0 ^ -1", "DIVISION_BY_ZERO"],
    ["2 ^ 0.5", "BAD_EXPONENT"],
    ["2 ^ 100", "BAD_EXPONENT"],
    ["2 ^ 3 ^ 4", "BAD_EXPONENT"],
    ["5 % 3", "SYNTAX"], // % is "per cent", never a remainder
    ["1 + ", "SYNTAX"],
    ["(1 + 2", "SYNTAX"],
    ["1 + 2)", "SYNTAX"],
    ["1 2", "SYNTAX"],
    ["* 3", "SYNTAX"],
    ["abc", "UNKNOWN_FUNCTION"],
    ["alert(1)", "UNKNOWN_FUNCTION"],
    ["process", "UNKNOWN_FUNCTION"],
    ["constructor", "UNKNOWN_FUNCTION"],
    ["__proto__", "BAD_CHARACTER"],
    ["sqrt(-4)", "BAD_ARGUMENT"],
    ["sqrt(1, 2)", "BAD_ARGUMENT"],
    ["min(1)", "BAD_ARGUMENT"],
    ["round(1.5, 20)", "BAD_ARGUMENT"],
    ["1; 2", "BAD_CHARACTER"],
    ["`1`", "BAD_CHARACTER"],
    ["1 + $x", "BAD_CHARACTER"],
    ["1 & 2", "BAD_CHARACTER"],
    ["1 = 1", "BAD_CHARACTER"],
    ["0x10", "SYNTAX"],
    ["1e5", "SYNTAX"],
    ["7x3", "SYNTAX"],
    ["min(1,200,", "SYNTAX"],
    ["1\u0000+1", "BAD_CHARACTER"],
    ["Infinity", "UNKNOWN_FUNCTION"],
  ])("%j is refused with %s", (e, expected) => {
    expect(code(e)).toBe(expected);
  });

  it("refuses a dot with no digits", () => {
    expect(code("1 + .")).not.toBeNull();
    expect(code("process.exit(1)")).not.toBeNull();
  });

  it("enforces the bounds", () => {
    expect(code("1".repeat(CALC_LIMITS.maxChars + 1))).toBe("TOO_LONG");
    expect(code("(".repeat(25) + "1" + ")".repeat(25))).toBe("TOO_DEEP");
    expect(code("1+".repeat(60) + "1")).toBe("TOO_MANY_TOKENS");
    expect(code("1".repeat(41))).toBe("TOO_LARGE");
    expect(code("0." + "1".repeat(13))).toBe("TOO_LARGE");
    expect(code("(10^60)*".repeat(12) + "1")).toBe("TOO_LARGE");
    expect(code("9^64")).toBeNull(); // within bounds
    expect(val("max(1,200)")).toBe("200"); // a comma inside a function call separates arguments; it is not a thousands separator
    expect(val("1,200 + 1")).toBe("1201");
  });

  it("the length and token caps keep every accepted expression far below the operation budget", () => {
    // the largest expression the caps allow still evaluates quickly (the operation budget in the module is a second, defensive limit)
    expect(code("1+".repeat(49) + "1")).toBeNull(); // 99 tokens
    expect(code("1+".repeat(60) + "1")).toBe("TOO_MANY_TOKENS");
    // Contract: more than maxChars characters is TOO_LONG; more than maxTokens tokens is TOO_MANY_TOKENS. This string is 181 characters (under the 200
    // character cap) but 181 tokens (over the 100 token cap), so the TOKEN cap is the one that refuses it. Neither cap is weakened.
    const dense = "(1+1)*".repeat(30) + "1";
    expect(dense.length).toBeLessThanOrEqual(CALC_LIMITS.maxChars);
    expect(code(dense)).toBe("TOO_MANY_TOKENS");
    // a long string of few tokens is refused by the LENGTH cap, before it is even tokenised
    expect(code(" ".repeat(CALC_LIMITS.maxChars) + "1")).toBe("TOO_LONG");
  });
});

describe("calculator: never executes anything and never throws anything but CalcError (fuzz)", () => {
  it("survives 4000 random strings quickly", () => {
    let seed = 99;
    const rnd = (n: number) => {
      seed = (seed * 1664525 + 1013904223) & 0x7fffffff;
      return seed % n;
    };
    const alphabet = "0123456789+-*/^%()., sqrtabsminmaxround×÷xX\t".split("");
    const started = Date.now();
    let ok = 0;
    let refused = 0;
    for (let i = 0; i < 4_000; i++) {
      const len = 1 + rnd(60);
      let s = "";
      for (let j = 0; j < len; j++) s += alphabet[rnd(alphabet.length)];
      try {
        calculate(s);
        ok++;
      } catch (e) {
        expect(e, s).toBeInstanceOf(CalcError);
        refused++;
      }
    }
    expect(ok + refused).toBe(4_000);
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it("survives hostile Unicode and long garbage", () => {
    const inputs = ["‮1+1", "１＋１", "１２×３", "1​+​1", "😀", "𝟏+𝟏", "\uD800", "a".repeat(5_000), "(".repeat(5_000), "1".repeat(5_000), "0".repeat(200) + "1"];
    for (const s of inputs) {
      try {
        calculate(s);
      } catch (e) {
        expect(e, s.slice(0, 20)).toBeInstanceOf(CalcError);
      }
    }
  });

  it("does not use eval, Function or dynamic code anywhere in the module", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../../src/tools/llm/calculator.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/\beval\s*\(/);
    expect(src).not.toMatch(/\bnew\s+Function\b|\bFunction\s*\(/);
    expect(src).not.toMatch(/\brequire\s*\(|\bimport\s*\(/);
  });
});
