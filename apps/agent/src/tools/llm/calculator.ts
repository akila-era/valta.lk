/**
 * The safe calculator. A hand-written recursive-descent parser over exact rational numbers (BigInt numerator and denominator): no `eval`, no `Function`, no
 * variables, no I/O. It covers customer arithmetic ("15% of 2400" is written `15% * 2400`) and refuses everything else.
 *
 * Grammar:   expr   := term (('+'|'-') term)*
 *            term   := unary (('*'|'/') unary)*
 *            unary  := ('+'|'-') unary | power
 *            power  := postfix ('^' unary)?                      (right associative)
 *            postfix:= primary ('%')*                            (`%` after a value means "divide by 100"; it is never a remainder operator)
 *            primary:= number | '(' expr ')' | func '(' expr (',' expr)* ')'     func := abs | round | min | max | sqrt
 *
 * Bounds (all enforced, all tested): expression length, token count, nesting depth, operation count, size of any intermediate number, exponent size.
 */
export const CALC_LIMITS = Object.freeze({ maxChars: 200, maxTokens: 100, maxDepth: 20, maxOps: 400, maxBits: 2048, maxExponent: 64, maxDigits: 40, maxArgs: 8, resultDecimals: 10 });

export type CalcErrorCode = "EMPTY" | "TOO_LONG" | "BAD_CHARACTER" | "TOO_MANY_TOKENS" | "TOO_DEEP" | "TOO_MANY_OPERATIONS" | "SYNTAX" | "DIVISION_BY_ZERO" | "TOO_LARGE" | "BAD_EXPONENT" | "BAD_ARGUMENT" | "UNKNOWN_FUNCTION";

export class CalcError extends Error {
  constructor(readonly code: CalcErrorCode, message: string) {
    super(message);
    this.name = "CalcError";
  }
}

export interface CalcResult {
  /** Exact decimal text, for example "360" or "0.3333333333". */
  result: string;
  /** The same number as a JS number when it is safely representable, else null. */
  resultNumber: number | null;
  /** False when the true value needed rounding to `resultDecimals` places (for example 1/3, or a square root that is not exact). */
  exact: boolean;
  /** The parsed expression, fully parenthesised, so a reader can see how it was understood. */
  normalised: string;
}

// ---------- rationals ----------
interface Q {
  n: bigint;
  d: bigint; // > 0, lowest terms
}
const gcd = (a: bigint, b: bigint): bigint => {
  a = a < 0n ? -a : a;
  while (b) [a, b] = [b, a % b];
  return a;
};
const bits = (x: bigint): number => (x < 0n ? -x : x).toString(2).length;

function q(n: bigint, d: bigint, ctx: Ctx): Q {
  if (d === 0n) throw new CalcError("DIVISION_BY_ZERO", "Division by zero.");
  if (d < 0n) [n, d] = [-n, -d];
  const g = gcd(n, d) || 1n;
  const out = { n: n / g, d: d / g };
  if (bits(out.n) > CALC_LIMITS.maxBits || bits(out.d) > CALC_LIMITS.maxBits) throw new CalcError("TOO_LARGE", "The number is too large.");
  ctx.ops++;
  if (ctx.ops > CALC_LIMITS.maxOps) throw new CalcError("TOO_MANY_OPERATIONS", "The expression is too complex.");
  return out;
}

interface Ctx {
  ops: number;
}

const add = (a: Q, b: Q, c: Ctx) => q(a.n * b.d + b.n * a.d, a.d * b.d, c);
const sub = (a: Q, b: Q, c: Ctx) => q(a.n * b.d - b.n * a.d, a.d * b.d, c);
const mul = (a: Q, b: Q, c: Ctx) => q(a.n * b.n, a.d * b.d, c);
const div = (a: Q, b: Q, c: Ctx) => q(a.n * b.d, a.d * b.n, c);
const cmp = (a: Q, b: Q): number => {
  const l = a.n * b.d;
  const r = b.n * a.d;
  return l < r ? -1 : l > r ? 1 : 0;
};

function isqrt(n: bigint): bigint {
  if (n < 2n) return n;
  let x = 1n << BigInt((n.toString(2).length + 1) >> 1);
  for (;;) {
    const y = (x + n / x) >> 1n;
    if (y >= x) return x;
    x = y;
  }
}

function pow(base: Q, exp: Q, c: Ctx): Q {
  if (exp.d !== 1n) throw new CalcError("BAD_EXPONENT", "The exponent must be a whole number.");
  if (exp.n > BigInt(CALC_LIMITS.maxExponent) || exp.n < -BigInt(CALC_LIMITS.maxExponent)) throw new CalcError("BAD_EXPONENT", "The exponent is too large.");
  const e = Number(exp.n);
  const abs = Math.abs(e);
  if (Math.max(bits(base.n), bits(base.d)) * abs > CALC_LIMITS.maxBits) throw new CalcError("TOO_LARGE", "The number is too large.");
  const n = base.n ** BigInt(abs);
  const d = base.d ** BigInt(abs);
  if (e >= 0) return q(n, d, c);
  if (n === 0n) throw new CalcError("DIVISION_BY_ZERO", "Zero cannot be raised to a negative power.");
  return q(d, n, c);
}

const SCALE = 10n ** BigInt(CALC_LIMITS.resultDecimals);

/** Half-away-from-zero rounding of a rational to `places` decimals, returned as an integer scaled by 10^places. */
function scaled(x: Q, places: number): bigint {
  const s = 10n ** BigInt(places);
  const num = x.n * s;
  const half = x.d / 2n;
  return num >= 0n ? (num + half) / x.d : -((-num + half) / x.d);
}

function toDecimalString(x: Q): { text: string; exact: boolean } {
  // A fraction has a finite decimal form exactly when its denominator has only the prime factors 2 and 5.
  let rest = x.d;
  let twos = 0;
  let fives = 0;
  while (rest % 2n === 0n) {
    rest /= 2n;
    twos++;
  }
  while (rest % 5n === 0n) {
    rest /= 5n;
    fives++;
  }
  const exact = rest === 1n;
  const places = exact ? Math.max(twos, fives) : CALC_LIMITS.resultDecimals;
  const s = scaled(x, places);
  const negative = s < 0n;
  const digits = (negative ? -s : s).toString().padStart(places + 1, "0");
  let text = places > 0 ? `${digits.slice(0, -places)}.${digits.slice(-places)}` : digits;
  if (text.includes(".")) text = text.replace(/0+$/, "").replace(/\.$/, "");
  const isZero = /^0(\.0*)?$/.test(text);
  return { text: negative && !isZero ? `-${text}` : text, exact };
}

// ---------- tokens ----------
type Tok = { t: "num"; v: Q; src: string } | { t: "op"; v: "+" | "-" | "*" | "/" | "^" | "%" | "(" | ")" | "," } | { t: "id"; v: string };

function tokenize(input: string, c: Ctx): Tok[] {
  const joined = input
    .normalize("NFKC")
    .replace(/[−–—]/g, "-")
    .replace(/×/g, "*")
    // a letter x between two operands, with spaces on both sides, is a times sign ("7 x 3"); "7x3" and "0x10" are NOT: they are refused, never guessed
    .replace(/([\d)%])\s+[xX]\s+(?=[\d(.])/g, "$1 * ")
    .replace(/÷/g, "/")
    .replace(/\*\*/g, "^")
    ;
  // "1,234" is a thousands separator, unless the expression has a function call (then a comma separates arguments: max(1,200) means two values).
  const s = /\b(?:abs|round|min|max|sqrt)\b/i.test(joined) ? joined : joined.replace(/(\d),(?=\d{3}(?!\d))/g, "$1");
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i]!;
    if (ch === " " || ch === "\t") {
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      const m = /^(\d+\.?\d*|\.\d+)/.exec(s.slice(i));
      if (!m) throw new CalcError("SYNTAX", "Unreadable number.");
      const text = m[1]!;
      const [whole = "", frac = ""] = text.split(".");
      if (whole.length + frac.length > CALC_LIMITS.maxDigits) throw new CalcError("TOO_LARGE", "The number has too many digits.");
      if (frac.length > 12) throw new CalcError("TOO_LARGE", "Too many decimal places.");
      out.push({ t: "num", v: q(BigInt(`${whole || "0"}${frac}`), 10n ** BigInt(frac.length), c), src: text });
      i += text.length;
    } else if ("+-*/^%(),".includes(ch)) {
      out.push({ t: "op", v: ch as Extract<Tok, { t: "op" }>["v"] });
      i++;
    } else if (/[a-zA-Z]/.test(ch)) {
      const m = /^[a-zA-Z]+/.exec(s.slice(i))!;
      out.push({ t: "id", v: m[0].toLowerCase() });
      i += m[0].length;
    } else {
      throw new CalcError("BAD_CHARACTER", "Only numbers, + - * / ^ % ( ) , and the functions abs, round, min, max, sqrt are allowed.");
    }
    if (out.length > CALC_LIMITS.maxTokens) throw new CalcError("TOO_MANY_TOKENS", "The expression is too long.");
  }
  return out;
}

// ---------- parser / evaluator ----------
interface Node {
  v: Q;
  /** Fully parenthesised text. */
  s: string;
  /** True for an inexact value (a rounded square root): the result is then reported as not exact. */
  inexact?: boolean;
}

class Parser {
  private i = 0;
  private depth = 0;
  inexact = false;
  constructor(private readonly toks: Tok[], private readonly c: Ctx) {}

  private peek(): Tok | undefined {
    return this.toks[this.i];
  }
  private isOp(v: string): boolean {
    const t = this.peek();
    return t?.t === "op" && t.v === v;
  }
  private enter(): void {
    if (++this.depth > CALC_LIMITS.maxDepth) throw new CalcError("TOO_DEEP", "The expression is nested too deeply.");
  }
  private leave(): void {
    this.depth--;
  }

  parseAll(): Node {
    if (this.toks.length === 0) throw new CalcError("EMPTY", "There is nothing to calculate.");
    const n = this.expr();
    if (this.i < this.toks.length) throw new CalcError("SYNTAX", "Unexpected input after the expression.");
    return n;
  }

  private expr(): Node {
    this.enter();
    let left = this.term();
    while (this.isOp("+") || this.isOp("-")) {
      const op = (this.toks[this.i++] as Extract<Tok, { t: "op" }>).v;
      const right = this.term();
      left = { v: op === "+" ? add(left.v, right.v, this.c) : sub(left.v, right.v, this.c), s: `(${left.s} ${op} ${right.s})` };
    }
    this.leave();
    return left;
  }

  private term(): Node {
    let left = this.unary();
    while (this.isOp("*") || this.isOp("/")) {
      const op = (this.toks[this.i++] as Extract<Tok, { t: "op" }>).v;
      const right = this.unary();
      left = { v: op === "*" ? mul(left.v, right.v, this.c) : div(left.v, right.v, this.c), s: `(${left.s} ${op} ${right.s})` };
    }
    return left;
  }

  private unary(): Node {
    if (this.isOp("+") || this.isOp("-")) {
      this.enter();
      const op = (this.toks[this.i++] as Extract<Tok, { t: "op" }>).v;
      const inner = this.unary();
      this.leave();
      return op === "-" ? { v: q(-inner.v.n, inner.v.d, this.c), s: `(-${inner.s})` } : inner;
    }
    return this.power();
  }

  private power(): Node {
    const base = this.postfix();
    if (this.isOp("^")) {
      this.i++;
      const exp = this.unary();
      return { v: pow(base.v, exp.v, this.c), s: `(${base.s} ^ ${exp.s})` };
    }
    return base;
  }

  private postfix(): Node {
    let n = this.primary();
    while (this.isOp("%")) {
      this.i++;
      n = { v: q(n.v.n, n.v.d * 100n, this.c), s: `(${n.s}%)` };
    }
    return n;
  }

  private primary(): Node {
    const t = this.toks[this.i++];
    if (!t) throw new CalcError("SYNTAX", "The expression ends too early.");
    if (t.t === "num") return { v: t.v, s: t.src };
    if (t.t === "op" && t.v === "(") {
      const inner = this.expr();
      if (!this.isOp(")")) throw new CalcError("SYNTAX", "A bracket is not closed.");
      this.i++;
      return { v: inner.v, s: inner.s };
    }
    if (t.t === "id") return this.call(t.v);
    throw new CalcError("SYNTAX", "A number or bracket was expected.");
  }

  private call(name: string): Node {
    if (!["abs", "round", "min", "max", "sqrt"].includes(name)) throw new CalcError("UNKNOWN_FUNCTION", "Unknown function. Allowed: abs, round, min, max, sqrt.");
    if (!this.isOp("(")) throw new CalcError("SYNTAX", "A function needs brackets.");
    this.i++;
    this.enter();
    const args: Node[] = [this.expr()];
    while (this.isOp(",")) {
      this.i++;
      if (args.length >= CALC_LIMITS.maxArgs) throw new CalcError("BAD_ARGUMENT", "Too many arguments.");
      args.push(this.expr());
    }
    if (!this.isOp(")")) throw new CalcError("SYNTAX", "A bracket is not closed.");
    this.i++;
    this.leave();
    const text = `${name}(${args.map((a) => a.s).join(", ")})`;
    const one = () => {
      if (args.length !== 1) throw new CalcError("BAD_ARGUMENT", `${name} takes one argument.`);
      return args[0]!.v;
    };
    switch (name) {
      case "abs": {
        const x = one();
        return { v: q(x.n < 0n ? -x.n : x.n, x.d, this.c), s: text };
      }
      case "round": {
        if (args.length === 1) return { v: q(scaled(args[0]!.v, 0), 1n, this.c), s: text };
        if (args.length !== 2) throw new CalcError("BAD_ARGUMENT", "round takes a value and optionally the number of decimal places.");
        const places = args[1]!.v;
        if (places.d !== 1n || places.n < 0n || places.n > 10n) throw new CalcError("BAD_ARGUMENT", "round places must be a whole number from 0 to 10.");
        const p = Number(places.n);
        return { v: q(scaled(args[0]!.v, p), 10n ** BigInt(p), this.c), s: text };
      }
      case "min":
      case "max": {
        if (args.length < 2) throw new CalcError("BAD_ARGUMENT", `${name} needs at least two values.`);
        let best = args[0]!.v;
        for (const a of args.slice(1)) if (name === "min" ? cmp(a.v, best) < 0 : cmp(a.v, best) > 0) best = a.v;
        return { v: best, s: text };
      }
      default: {
        const x = one();
        if (x.n < 0n) throw new CalcError("BAD_ARGUMENT", "The square root of a negative number is not supported.");
        const rn = isqrt(x.n);
        const rd = isqrt(x.d);
        if (rn * rn === x.n && rd * rd === x.d) return { v: q(rn, rd, this.c), s: text };
        this.inexact = true;
        const root = isqrt((x.n * SCALE * SCALE) / x.d); // floor(sqrt(x) * 10^10)
        return { v: q(root, SCALE, this.c), s: text, inexact: true };
      }
    }
  }
}

export function calculate(expression: string): CalcResult {
  if (typeof expression !== "string") throw new CalcError("SYNTAX", "The expression must be text.");
  if (expression.trim() === "") throw new CalcError("EMPTY", "There is nothing to calculate.");
  if (expression.length > CALC_LIMITS.maxChars) throw new CalcError("TOO_LONG", `The expression is longer than ${CALC_LIMITS.maxChars} characters.`);
  const c: Ctx = { ops: 0 };
  const parser = new Parser(tokenize(expression, c), c);
  const node = parser.parseAll();
  const { text, exact } = toDecimalString(node.v);
  const asNumber = Number(text);
  return { result: text, resultNumber: Number.isFinite(asNumber) && Math.abs(asNumber) <= Number.MAX_SAFE_INTEGER ? asNumber : null, exact: exact && !parser.inexact, normalised: node.s };
}
