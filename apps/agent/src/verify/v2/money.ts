/**
 * Money and number extraction from free text, in the forms customers and models really write in Sri Lanka:
 * "Rs. 110,000", "LKR 99900", "රු. 85,000", "රුපියල් 85000", "85,000/=", "110000 rupees", "Rs. 50,000 - 70,000", "150k", "1.5 lakh", "ලක්ෂ 2", "laksha dekak".
 * Input must be the FOLDED text (see `fold`): lower case, ASCII digits. Offsets are the same as in the original text.
 */
export interface Amount {
  start: number;
  end: number;
  /** Integer minor units (cents). */
  minor: number;
  /** "150k", "1.5 lakh": shorthand rounding, compared with a 1 % tolerance instead of exactly. */
  shorthand: boolean;
  /** A currency word or symbol was written next to the number. */
  currencyMarked: boolean;
  /** The second end of a range ("Rs. 50,000 - 70,000"). */
  inRange: boolean;
}

const CUR = "(?:rs|lkr|rupees?|rupiyal|රු|රුපියල්(?:ය)?|₨)";
const NUM = "(?:\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?)";
const MULT = "(?:thousand|lakhs?|laksha(?:ya)?|ලක්ෂ(?:ය|යක්)?|million|mn|k)";
const L = "\\p{L}\\p{N}";

const WORD_NUM: Record<string, number> = {
  eka: 1, ekak: 1, deka: 2, dekak: 2, දෙක: 2, දෙකක්: 2, thuna: 3, thunak: 3, තුන: 3, තුනක්: 3, hathara: 4, hatharak: 4, හතර: 4, හතරක්: 4,
  paha: 5, pahak: 5, පහ: 5, පහක්: 5, haya: 6, hayak: 6, හය: 6, හයක්: 6, hatha: 7, hathak: 7, හත: 7, හතක්: 7, ata: 8, atak: 8, අට: 8, අටක්: 8,
  nawaya: 9, navaya: 9, නවය: 9, dahaya: 10, dahak: 10, දහය: 10, දහයක්: 10,
};

function multiplier(word: string | undefined): number {
  if (!word) return 1;
  if (word === "k" || word === "thousand") return 1_000;
  if (word.startsWith("lakh") || word.startsWith("laksha") || word.startsWith("ලක්ෂ")) return 100_000;
  if (word === "million" || word === "mn") return 1_000_000;
  return 1;
}

const toNumber = (raw: string): number => Number(raw.replace(/,/g, ""));
const toMinor = (value: number, mult: number): number => Math.round(value * mult * 100);

/** Price words that make a bare "150k" mean money rather than a resolution ("4k display"). */
const PRICE_CUE = /(price|cost|budget|around|about|under|below|within|only|for|priced|rs|lkr|rupee|මිල|වටිනා|ගානක්|ගාන|wage|walata|ekata|දක්වා|ඇතුලත|ඇතුළත)/;

export function extractAmounts(folded: string): Amount[] {
  const found: Amount[] = [];
  const add = (a: Amount): void => {
    if (Number.isFinite(a.minor) && a.minor >= 0 && a.minor < 1e14) found.push(a);
  };
  const rangeAfter = (from: number, preferMult: number, marked: boolean): void => {
    const tail = folded.slice(from, from + 60);
    const m = new RegExp(`^\\s*(?:-|–|—|to|දක්වා|ත්)\\s*(?:${CUR}\\.?\\s*)?(${NUM})(?:\\s*(${MULT})(?![${L}]))?`, "iu").exec(tail);
    if (!m) return;
    const mult = m[2] ? multiplier(m[2]) : preferMult;
    add({ start: from + m[0].indexOf(m[1]!), end: from + m[0].length, minor: toMinor(toNumber(m[1]!), mult), shorthand: preferMult > 1 || !!m[2], currencyMarked: marked, inRange: true });
  };

  // 1. currency first: "rs. 110,000", "රු. 85,000", "lkr 99900", "rs 1.5 lakh"
  for (const m of folded.matchAll(new RegExp(`(?<![${L}])${CUR}\\.?\\s*(${NUM})(?:\\s*(${MULT})(?![${L}]))?(?:\\s*(?:/=|-/|/-))?`, "giu"))) {
    const mult = multiplier(m[2]);
    const start = m.index!;
    add({ start, end: start + m[0].length, minor: toMinor(toNumber(m[1]!), mult), shorthand: mult > 1, currencyMarked: true, inRange: false });
    rangeAfter(start + m[0].length, mult, true);
  }
  // 2. currency after: "110,000 rupees", "85,000/=", "99900 rs"
  for (const m of folded.matchAll(new RegExp(`(?<![${L}.,])(${NUM})(?:\\s*(${MULT})(?![${L}]))?\\s*(?:${CUR}(?![a-z])|/=|-/)`, "giu"))) {
    const mult = multiplier(m[2]);
    const start = m.index!;
    add({ start, end: start + m[0].length, minor: toMinor(toNumber(m[1]!), mult), shorthand: mult > 1, currencyMarked: true, inRange: false });
  }
  // 3. bare lakh: "1.5 lakh", "2 laksha", "ලක්ෂ 2", "laksha dekak", "dekak laksha"
  for (const m of folded.matchAll(new RegExp(`(?<![${L}.,])(${NUM})\\s*(lakhs?|laksha(?:ya)?|ලක්ෂ(?:ය|යක්)?)(?![${L}])`, "giu"))) {
    add({ start: m.index!, end: m.index! + m[0].length, minor: toMinor(toNumber(m[1]!), 100_000), shorthand: true, currencyMarked: false, inRange: false });
  }
  for (const m of folded.matchAll(new RegExp(`(?<![${L}])(lakhs?|laksha(?:ya)?|ලක්ෂ(?:ය|යක්)?)\\s+(${NUM}|${Object.keys(WORD_NUM).join("|")})(?![${L}])`, "giu"))) {
    const v = /^\d/.test(m[2]!) ? toNumber(m[2]!) : WORD_NUM[m[2]!];
    if (v !== undefined) add({ start: m.index!, end: m.index! + m[0].length, minor: toMinor(v, 100_000), shorthand: true, currencyMarked: false, inRange: false });
  }
  for (const m of folded.matchAll(new RegExp(`(?<![${L}])(${Object.keys(WORD_NUM).join("|")})\\s+(lakhs?|laksha(?:ya)?|ලක්ෂ(?:ය|යක්)?)(?![${L}])`, "giu"))) {
    const v = WORD_NUM[m[1]!];
    if (v !== undefined) add({ start: m.index!, end: m.index! + m[0].length, minor: toMinor(v, 100_000), shorthand: true, currencyMarked: false, inRange: false });
  }
  // 4. bare thousand shorthand "150k": money only with a price cue in the text and a value >= 10 ("4k display" is not a price)
  if (PRICE_CUE.test(folded)) {
    for (const m of folded.matchAll(new RegExp(`(?<![${L}.,])(\\d+(?:\\.\\d+)?)\\s?k(?![${L}])`, "giu"))) {
      const v = Number(m[1]);
      if (v >= 10) add({ start: m.index!, end: m.index! + m[0].length, minor: toMinor(v, 1_000), shorthand: true, currencyMarked: false, inRange: false });
    }
  }

  // Overlaps: keep the longer match (a currency-marked "rs. 150k" beats the bare "150k" inside it).
  found.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  const out: Amount[] = [];
  for (const a of found) {
    const last = out[out.length - 1];
    if (last && a.start < last.end) {
      if (a.end - a.start > last.end - last.start) out[out.length - 1] = a;
      continue;
    }
    out.push(a);
  }
  return out;
}

/** All plain numbers (with optional decimals) in a folded text: for percentage and arithmetic checks. */
export function numbersIn(folded: string): { value: number; start: number; end: number }[] {
  const out: { value: number; start: number; end: number }[] = [];
  for (const m of folded.matchAll(/(?<![\p{L}\p{N}.,])(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?![\p{L}\p{N}])/gu)) {
    out.push({ value: toNumber(m[1]!), start: m.index!, end: m.index! + m[0].length });
  }
  return out;
}
