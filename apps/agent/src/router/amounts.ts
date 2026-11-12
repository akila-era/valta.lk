import type { AmountInfo } from "./types";

/**
 * Reads prices from MATCH-FORM text (already lower-cased, Sinhala digits turned into ASCII).
 *
 * Plain numbers are read as prices only when it is safe: a currency marker next to them, a "k" or "lakh" suffix, or a
 * value of 1,000 or more. Small bare numbers ("iPhone 15", "Redmi Note 13") and numbers followed by units (8gb, 5000mah,
 * 6.7 inch) are never prices. Spoken forms the parser does not understand set `unparsedCue`, so the router asks instead
 * of guessing a budget.
 */
export interface AmountResult {
  amounts: AmountInfo[];
  /** A budget or number word was present but no amount could be read. */
  unparsedCue: boolean;
}

const NUMBER = /(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)/g;
const UNIT_AFTER = /^\s?(gb|tb|mb|mp|mah|inch|inches|w|watt|hz|mm|cm|kg|g|pcs|pieces|units|x)\b/;
const LAKH_WORDS = /^\s?(lakh|lakhs|lak|laks|ලක්ෂ|ලක්ෂය|ලක්ෂයක්|ලක්ශ|ලක්ෂයකට)/;
const CURRENCY_BEFORE = /(?:rs|lkr|rupees?|රු|රුපියල්|රුපියල)\s*$/;
const CURRENCY_AFTER = /^\s?(?:rs|lkr|rupees?|රු|රුපියල්|රුපියල)/;

const MAX_CUES = [/\b(under|below|less than|upto|up to|within|at most|max|maximum|budget|cheaper than|not more than)\b/, /(ට අඩු|ට වඩා අඩු|ඇතුළත|දක්වා|බජට්|\badu\b|walata adu|ට වඩා අඩුවෙන්|ටත් අඩු)/];
const MIN_CUES = [/\b(above|over|more than|at least|min|minimum|starting from|from)\b/, /(ට වැඩි|ට වඩා වැඩි|ඉදන්|සිට|\bwadi\b|walata wadi)/];
const AROUND_CUES = [/\b(around|about|approximately|roughly|approx)\b/, /(විතර|ආසන්න|පමණ)/];
const RANGE_CUES = [/\b(between|to|and)\b/, /(අතර|සිට|දක්වා)/];

const test = (list: RegExp[], s: string) => list.some((r) => r.test(s));

function readOne(text: string, match: RegExpExecArray): AmountInfo | null {
  const raw = match[1]!;
  const start = match.index;
  const end = start + raw.length;
  const before = text.slice(Math.max(0, start - 12), start);
  const after = text.slice(end, end + 14);

  if (UNIT_AFTER.test(after) && !CURRENCY_BEFORE.test(before)) return null;

  let value = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(value)) return null;

  let multiplier = 1;
  let explicit = false;
  const kSuffix = /^\s?k\b/.exec(after) ?? /^k(?=[^a-z]|$)/.exec(after);
  if (kSuffix) {
    multiplier = 1_000;
    explicit = true;
  } else if (LAKH_WORDS.test(after)) {
    multiplier = 100_000;
    explicit = true;
  }
  if (CURRENCY_BEFORE.test(before) || CURRENCY_AFTER.test(after)) explicit = true;
  value *= multiplier;

  if (!explicit && value < 1_000) return null;
  if (!explicit && /\d{9,}/.test(raw.replace(/[,.]/g, ""))) return null; // phone-number sized
  if (value <= 0 || value > 50_000_000) return null;
  return { value: Math.round(value), role: "unknown", raw };
}

function roleFor(text: string, a: { start: number; end: number }): AmountInfo["role"] {
  const window = text.slice(Math.max(0, a.start - 28), Math.min(text.length, a.end + 28));
  if (test(AROUND_CUES, window)) return "around";
  if (test(MAX_CUES, window)) return "max";
  if (test(MIN_CUES, window)) return "min";
  return "unknown";
}

export function parseAmounts(text: string): AmountResult {
  const found: (AmountInfo & { start: number; end: number })[] = [];
  const cleaned = text.replace(/vlk-\d{6}-[a-z0-9]{10}/g, " "); // order references contain digit runs
  NUMBER.lastIndex = 0;
  for (let m = NUMBER.exec(cleaned); m; m = NUMBER.exec(cleaned)) {
    const one = readOne(cleaned, m);
    if (one) found.push({ ...one, start: m.index, end: m.index + m[1]!.length });
  }

  // "ලක්ෂයක්" on its own means one lakh.
  if (found.length === 0 && /ලක්ෂයක්|ලක්ෂයකට|ඉලක්ෂයක්/.test(cleaned)) {
    const idx = cleaned.indexOf("ලක්ෂ");
    found.push({ value: 100_000, role: "unknown", raw: "ලක්ෂයක්", start: idx, end: idx + 5 });
  }

  const amounts: AmountInfo[] = found.map((f) => ({ value: f.value, role: roleFor(cleaned, f), raw: f.raw }));

  // Two amounts joined by a range cue are a range: the lower is the minimum, the higher the maximum.
  if (amounts.length === 2 && test(RANGE_CUES, cleaned)) {
    const [lo, hi] = amounts[0]!.value <= amounts[1]!.value ? [amounts[0]!, amounts[1]!] : [amounts[1]!, amounts[0]!];
    lo.role = "min";
    hi.role = "max";
  }

  // Number words the parser does not read (thousands as words) must trigger a question, not a default.
  const spokenNumber = /(දහස|දාහ|දහසක්|දාහක්|hajar|dahasak|thousand|hundred|hari soo|ලක්ෂ දෙක)/.test(cleaned);
  const budgetCue = /(budget|බජට්|බජෙට්)/.test(cleaned);
  const unparsedCue = amounts.length === 0 && (spokenNumber || budgetCue);

  return { amounts, unparsedCue };
}

/** Collapses parsed amounts into the min and max the search tool understands. */
export function toPriceBounds(amounts: AmountInfo[]): { minPriceLkr?: number; maxPriceLkr?: number } {
  const out: { minPriceLkr?: number; maxPriceLkr?: number } = {};
  for (const a of amounts) {
    if (a.role === "min") out.minPriceLkr = Math.max(out.minPriceLkr ?? 0, a.value);
    else if (a.role === "max" || a.role === "around") out.maxPriceLkr = Math.min(out.maxPriceLkr ?? Infinity, a.value);
  }
  // A single amount with no cue next to a price context is read as a ceiling ("budget eka 80000"), never a floor.
  if (out.minPriceLkr === undefined && out.maxPriceLkr === undefined && amounts.length === 1 && amounts[0]!.role === "unknown") {
    out.maxPriceLkr = amounts[0]!.value;
  }
  return out;
}
