import { calculations, maskProductNames, mentions, productsInSentence, type ProductFacts } from "./evidence";
import { extractAmounts, numbersIn, type Amount } from "./money";
import { extractSpecClaims, specMatches, type SpecClaim } from "./specs";
import { fold, makeIssue } from "./text";
import type { Issue, SentenceSpan, VerifyV2Input } from "./types";

/**
 * Claim grounding for STORE facts in free-form text: prices, stock, specifications, arithmetic and exclusions. A claim is only judged when the
 * sentence (or the one before it) is about a product the server returned this turn; numbers about anything else (dates, general knowledge,
 * versions, the customer's own budget, calculator results) are never flagged here.
 */
export interface GroundingContext {
  text: string;
  folded: string;
  spans: readonly SentenceSpan[];
  input: VerifyV2Input;
  products: ProductFacts[];
}

const MONEY_CUE = /(price|cost|costs|priced|budget|\brs\b|lkr|rupee|මිල|වටිනා|ගාන|wage|worth|pay\b|ගෙවන)/u;

const NEGATIVE_STOCK: RegExp[] = [
  /\b(?:out of stock|sold out|not (?:currently )?(?:in stock|available)|unavailable|no longer available)\b/u,
  /stock\s*(?:eka\s*)?(?:nathi|naha|nehe|nane|iwarai|iwara|nethi)/u,
  /(?:තොග\S*|stock)\s*(?:නැත|නැහැ|නෑ|අවසන්)/u,
];
const POSITIVE_STOCK: RegExp[] = [
  /\b(?:in stock|(?:is|are|currently|now|still) available(?! in\b))\b/u,
  /stock\s*(?:eka\s*)?(?:thiyenawa|thiyenne|thibenawa|thiyanawa)/u,
  /තොගයේ\s*(?:ඇත|තිබෙනවා|තියෙනවා)|තොග\S*\s*ඇත/u,
];
const QUANTITY: RegExp[] = [
  /\bonly\s+(\d+)\s*(?:units?|pieces?|pcs)?\s*left\b/u,
  /\b(\d+)\s*(?:units?|pieces?|pcs)\s*(?:left|in stock|available|remaining)\b/u,
  /(?:ඉතිරි|තොගයේ)\s*(\d+)/u,
];

const sameMoney = (claim: number, truth: number, shorthand: boolean): boolean => claim === truth || (shorthand && truth > 0 && Math.abs(claim - truth) <= truth * 0.01);

function allowedMoney(a: Amount, pool: readonly ProductFacts[], c: GroundingContext, userAmounts: readonly number[], calcMinor: readonly number[]): boolean {
  if (userAmounts.some((u) => sameMoney(a.minor, u, a.shorthand))) return true;
  if (calcMinor.some((u) => sameMoney(a.minor, u, a.shorthand))) return true;
  const prices = [...new Set(pool.flatMap((p) => p.pricesMinor))];
  if (prices.some((p) => sameMoney(a.minor, p, a.shorthand))) return true;
  // a difference or a sum of two of the prices in play ("Rs. 10,000 cheaper", "Rs. 195,000 together")
  for (let i = 0; i < prices.length; i++) {
    for (let j = 0; j < prices.length; j++) {
      if (i === j) continue;
      if (sameMoney(a.minor, Math.abs(prices[i]! - prices[j]!), a.shorthand)) return true;
      if (i < j && sameMoney(a.minor, prices[i]! + prices[j]!, a.shorthand)) return true;
    }
  }
  void c;
  return false;
}

/** The customer's own amounts (a budget they stated may be echoed). */
function userAmountsOf(message: string): number[] {
  return extractAmounts(fold(message)).map((a) => a.minor);
}

export function checkGrounding(c: GroundingContext): Issue[] {
  const issues: Issue[] = [];
  const userAmounts = userAmountsOf(c.input.userMessage);
  const calcs = calculations(c.input.toolEvidence);
  const calcMinor = calcs.map((x) => x.minor);
  let prev: ProductFacts[] = [];

  for (const s of c.spans) {
    const f = c.folded.slice(s.start, s.end);
    const own = productsInSentence(s.text, c.products);
    const ctxP = own.length > 0 ? own : prev;
    const pool = [...new Set([...own, ...prev])];
    prev = own;

    // ---- prices ------------------------------------------------------------------------------------------------------------------------------
    for (const a of extractAmounts(f)) {
      // "2 lakh people" is not a price; but next to a store product, shorthand ("150k") is read as the product's price
      if (!a.currencyMarked && !MONEY_CUE.test(f) && ctxP.length === 0) continue;
      if (allowedMoney(a, pool, c, userAmounts, calcMinor)) continue;
      const abs = s.start + a.start;
      if (ctxP.length > 0) {
        issues.push(makeIssue("claim_price_mismatch", c.spans, abs, s.start + a.end, { amountMinor: a.minor, known: ctxP.flatMap((p) => p.pricesMinor).length }));
      } else {
        issues.push(makeIssue("ungrounded_price", c.spans, abs, s.start + a.end, { amountMinor: a.minor }));
      }
    }

    // ---- stock -------------------------------------------------------------------------------------------------------------------------------
    if (ctxP.length > 0) {
      let masked = f;
      let negative = false;
      let positive = false;
      for (const re of NEGATIVE_STOCK) {
        const m = re.exec(masked);
        if (m) {
          negative = true;
          masked = masked.slice(0, m.index) + " ".repeat(m[0].length) + masked.slice(m.index + m[0].length);
        }
      }
      for (const re of POSITIVE_STOCK) if (re.test(masked)) positive = true;
      const withStock = ctxP.filter((p) => p.stock && p.stock.status !== "unknown");
      const status = (p: ProductFacts): "in" | "out" => (p.stock!.status === "out_of_stock" ? "out" : "in");
      if (positive || negative) {
        if (withStock.length === 0) issues.push(makeIssue("claim_ungrounded", c.spans, s.start, s.end, { kind: "stock" }));
        else if (positive && withStock.every((p) => status(p) === "out")) issues.push(makeIssue("claim_stock_mismatch", c.spans, s.start, s.end, { claimed: "in_stock" }));
        else if (negative && withStock.every((p) => status(p) === "in")) issues.push(makeIssue("claim_stock_mismatch", c.spans, s.start, s.end, { claimed: "out_of_stock" }));
      }
      for (const re of QUANTITY) {
        const m = re.exec(f);
        if (!m) continue;
        const n = Number(m[1]);
        const known = ctxP.flatMap((p) => p.stock?.quantities ?? []);
        if (known.length === 0) issues.push(makeIssue("claim_stock_mismatch", c.spans, s.start, s.end, { reason: "quantity_not_listed", claimed: n }));
        else if (!known.includes(n)) issues.push(makeIssue("claim_stock_mismatch", c.spans, s.start, s.end, { reason: "quantity_differs", claimed: n }));
        break;
      }
    }

    // ---- specifications ----------------------------------------------------------------------------------------------------------------------
    if (ctxP.length > 0) {
      const approximate = /\b(?:approx\.?|approximately|about|around|roughly|nearly)\b|~|දළ වශයෙන්/u.test(f);
      const notListed = /(?:not listed|not specified|not available|unknown|isn't listed|is not mentioned|not mentioned|ලැයිස්තුගත කර නැත|දක්වා නැත)/u.test(f);
      const claims: SpecClaim[] = extractSpecClaims(maskProductNames(f, c.products));
      for (const claim of claims) {
        const facts = ctxP.flatMap((p) => p.specs).filter((x) => x.field === claim.field);
        const abs = s.start + claim.start;
        if (facts.length === 0) {
          if (!notListed) issues.push(makeIssue("claim_spec_mismatch", c.spans, abs, s.start + claim.end, { field: claim.field, reason: "not_listed" }));
          continue;
        }
        if (!facts.some((x) => specMatches(claim, x, approximate))) issues.push(makeIssue("claim_spec_mismatch", c.spans, abs, s.start + claim.end, { field: claim.field, reason: "differs" }));
      }
    }

    // ---- arithmetic the answer states (recomputed, no tool needed) ---------------------------------------------------------------------------
    // (the lookbehinds make a match start only at the beginning of a number: without them a long run of digits is rescanned from every position, O(n^2))
    for (const m of f.matchAll(/(?<![\d.,])(\d+(?:\.\d+)?)\s*%\s*of\s*(\d[\d,]*(?:\.\d+)?)\s*(?:is|=|equals|will be|would be|comes to|:)?\s*(?:rs\.?\s*)?(\d[\d,]*(?:\.\d+)?)/gu)) {
      const [pct, base, claimed] = [Number(m[1]), Number(m[2]!.replace(/,/g, "")), Number(m[3]!.replace(/,/g, ""))];
      if (!closeEnough((pct / 100) * base, claimed)) issues.push(makeIssue("claim_calculation_mismatch", c.spans, s.start + m.index!, s.start + m.index! + m[0].length, { expected: round2((pct / 100) * base), claimed }));
    }
    for (const m of f.matchAll(/(?<![\d.,])(\d[\d,]*(?:\.\d+)?)\s*(\+|-|×|\*|÷|\/|\bx\b)\s*(\d[\d,]*(?:\.\d+)?)\s*(?:=|is|equals)\s*(?:rs\.?\s*)?(\d[\d,]*(?:\.\d+)?)/gu)) {
      const a = Number(m[1]!.replace(/,/g, ""));
      const b = Number(m[3]!.replace(/,/g, ""));
      const claimed = Number(m[4]!.replace(/,/g, ""));
      const expected = m[2] === "+" ? a + b : m[2] === "-" ? a - b : m[2] === "÷" || m[2] === "/" ? (b === 0 ? NaN : a / b) : a * b;
      if (Number.isFinite(expected) && !closeEnough(expected, claimed)) issues.push(makeIssue("claim_calculation_mismatch", c.spans, s.start + m.index!, s.start + m.index! + m[0].length, { expected: round2(expected), claimed }));
    }
  }

  issues.push(...checkExclusions(c));
  void numbersIn;
  return issues;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
const closeEnough = (a: number, b: number): boolean => Math.abs(a - b) <= 0.005 + Math.abs(a) * 1e-9;

const ACKNOWLEDGE =
  /\b(?:won't|will not|wont|not recommend|not going to|exclude[ds]?|excluding|skip(?:ping|ped)?|without|avoid(?:ing)?|instead of|rather than|other than|apart from|except|not (?:include|show|suggest)|no longer|as you (?:asked|said|requested|prefer)|as requested|per your (?:request|preference)|leave out|left out|ruled out|don't (?:recommend|show|suggest)|do not (?:recommend|show|suggest))\b|epa|එපා|නැතුව|නොවේ|ඉවත්|ඔබ කීවා|ඔබ කිව්වා|ඔයා කිව්වා|nathuwa|walin pissu|bahin|බැහැ/u;

/** A sentence that names an excluded brand, product or category without acknowledging the exclusion presents it as an option. */
function checkExclusions(c: GroundingContext): Issue[] {
  const ex = c.input.exclusions;
  if (!ex) return [];
  const names = [...(ex.brands ?? []), ...(ex.products ?? []), ...(ex.categories ?? [])].filter((n) => n && n.trim().length > 1);
  if (names.length === 0) return [];
  const out: Issue[] = [];
  for (const s of c.spans) {
    const hit = names.find((n) => mentions(s.text, n));
    if (!hit) continue;
    if (ACKNOWLEDGE.test(fold(s.text))) continue;
    if (/\?\s*$/.test(s.text)) continue; // a question ("Do you want Samsung?") is not a recommendation
    out.push(makeIssue("excluded_item_recommended", c.spans, s.start, s.end, { kind: "excluded" }));
  }
  return out;
}
