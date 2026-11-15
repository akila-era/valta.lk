import type { SpecField, SpecFact } from "./types";

/**
 * Specification claims in a (folded) sentence: "8GB RAM", "RAM 8 GB", "256 GB storage", "5000 mAh battery", "50MP camera", "6.7-inch display",
 * "120Hz", "33W fast charging", "Snapdragon 8 Gen 2", "8GB/256GB". A bare "8 GB" with no cue word is NOT a claim (it could be anything).
 * Sinhala "ජීබී" counts as GB.
 */
export interface SpecClaim {
  field: SpecField;
  /** Numeric claims: the value in the field's base unit (GB, mAh, MP, inch, Hz, W). */
  value?: number;
  /** Processor claims: the normalised name. */
  text?: string;
  start: number;
  end: number;
}

const L = "\\p{L}\\p{N}";
const RAM_CUE = /(?:\bram\b|\bmemory\b|ddr\d|lpddr|මතකය|රෑම්|රැම්)/u;
const STORAGE_CUE = /(?:storage|\brom\b|\bssd\b|\bhdd\b|nvme|emmc|internal|flash|ගබඩා|ස්ටෝරේජ්)/u;
const CHARGE_CUE = /(?:charg|වොට්|ආරෝපණ|watt)/u;
const GB = "(?:gb|g\\.b|ජීබී|ගිගාබයිට්)";
const TB = "(?:tb|ටීබී)";

const PROCESSORS: RegExp[] = [
  /snapdragon\s*\d+[a-z]*(?:\s*gen\s*\d+)?(?:\s*\+)?/g,
  /dimensity\s*\d+[a-z+]*/g,
  /helio\s*[a-z]\d+[a-z]*/g,
  /exynos\s*\d+/g,
  /kirin\s*\d+[a-z]*/g,
  // Apple A-series chips only with a chip cue ("A17 Pro chip", "A16 Bionic", "Apple A15"). A bare "A55" is far more often a PHONE MODEL ("Samsung Galaxy A55", "A15").
  /\bapple\s*a\d{2}(?:\s*(?:pro|bionic))?\b|\ba\d{2}\s*(?:bionic|(?:pro\s*)?(?:chip|processor|cpu|soc))\b/g,
  /core\s*(?:ultra\s*[579]|i[3579][-\s]?\d{4,5}[a-z]{0,2})/g,
  /ryzen\s*[3579]\s*\d{4}[a-z]{0,2}/g,
  /apple\s*m[1-4](?:\s*(?:pro|max|ultra))?/g,
];

/** Distance in characters from the number to the nearest match of a cue in the text before or after it. */
function cueDistance(cue: RegExp, before: string, after: string): number {
  let best = Infinity;
  const g = new RegExp(cue.source, "gu");
  for (const m of before.matchAll(g)) best = Math.min(best, before.length - (m.index! + m[0].length));
  const a = after.search(cue);
  if (a >= 0) best = Math.min(best, a);
  return best;
}

export const squeezeSpaces = (s: string): string => s.replace(/\s+/g, " ").trim();

export function extractSpecClaims(folded: string): SpecClaim[] {
  const out: SpecClaim[] = [];
  const taken: [number, number][] = [];
  const free = (s: number, e: number): boolean => !taken.some(([a, b]) => s < b && e > a);
  const take = (c: SpecClaim): void => {
    out.push(c);
    taken.push([c.start, c.end]);
  };

  // 8GB/256GB, 8 GB + 256 GB: first is memory, second is storage (when both are plausible and no cue word says otherwise)
  for (const m of folded.matchAll(new RegExp(`(?<![${L}.])(\\d+)\\s*${GB}\\s*(?:/|\\+|\\+\\s*|\\|)\\s*(\\d+)\\s*(${GB}|${TB})(?![a-z])`, "giu"))) {
    const a = Number(m[1]);
    const bRaw = Number(m[2]);
    const b = new RegExp(`^${TB}$`, "iu").test(m[3]!) ? bRaw * 1024 : bRaw;
    if (a <= 64 && b >= 32 && b > a) {
      take({ field: "ram", value: a, start: m.index!, end: m.index! + m[0].length });
      take({ field: "storage", value: b, start: m.index!, end: m.index! + m[0].length });
    }
  }

  // memory sizes with a cue word within 28 characters on either side
  for (const m of folded.matchAll(new RegExp(`(?<![${L}.])(\\d+(?:\\.\\d+)?)\\s*(${GB}|${TB})(?![a-z])`, "giu"))) {
    const s = m.index!;
    const e = s + m[0].length;
    if (!free(s, e)) continue;
    const unitTb = new RegExp(`^${TB}$`, "iu").test(m[2]!);
    const value = Number(m[1]) * (unitTb ? 1024 : 1);
    const before = folded.slice(Math.max(0, s - 28), s);
    const after = folded.slice(e, e + 28);
    const ramNear = RAM_CUE.test(before) || RAM_CUE.test(after);
    const storNear = STORAGE_CUE.test(before) || STORAGE_CUE.test(after);
    if (ramNear && !storNear) take({ field: "ram", value, start: s, end: e });
    else if (storNear && !ramNear) take({ field: "storage", value, start: s, end: e });
    else if (ramNear && storNear) {
      // both cues around one number: the nearer cue decides (ties go to memory)
      take({ field: cueDistance(RAM_CUE, before, after) <= cueDistance(STORAGE_CUE, before, after) ? "ram" : "storage", value, start: s, end: e });
    }
  }

  for (const m of folded.matchAll(/(?<![\p{L}\p{N}.])(\d{3,6})\s*mah(?![a-z])/giu)) take({ field: "battery", value: Number(m[1]), start: m.index!, end: m.index! + m[0].length });
  for (const m of folded.matchAll(/(?<![\p{L}\p{N}.])(\d+(?:\.\d+)?)\s*(?:mp|megapixels?|මෙගාපික්සල්)(?![a-z])/giu)) take({ field: "camera", value: Number(m[1]), start: m.index!, end: m.index! + m[0].length });
  for (const m of folded.matchAll(/(?<![\p{L}\p{N}.])(\d{1,2}(?:\.\d+)?)\s*-?\s*(?:inch(?:es)?|අඟල්|"|”)/giu)) {
    const v = Number(m[1]);
    if (v >= 3 && v <= 100) take({ field: "display", value: v, start: m.index!, end: m.index! + m[0].length });
  }
  for (const m of folded.matchAll(/(?<![\p{L}\p{N}.])(\d{2,3})\s*hz(?![a-z])/giu)) take({ field: "refresh_rate", value: Number(m[1]), start: m.index!, end: m.index! + m[0].length });
  for (const m of folded.matchAll(/(?<![\p{L}\p{N}.])(\d{2,3})\s*w(?![a-z])/giu)) {
    const s = m.index!;
    const near = folded.slice(Math.max(0, s - 30), s + m[0].length + 30);
    if (CHARGE_CUE.test(near)) take({ field: "charging", value: Number(m[1]), start: s, end: s + m[0].length });
  }
  for (const re of PROCESSORS) {
    for (const m of folded.matchAll(re)) take({ field: "processor", text: squeezeSpaces(m[0]), start: m.index!, end: m.index! + m[0].length });
  }
  return out;
}

/** The value of a stored numeric spec in the claim's base unit (TB becomes GB). */
export function factValue(f: SpecFact): number | undefined {
  if (typeof f.value !== "number") return undefined;
  return f.unit === "tb" ? f.value * 1024 : f.value;
}

/** True when a claimed number equals a stored spec. Storage in TB may be written as 1000 or 1024 GB. */
export function specMatches(claim: SpecClaim, f: SpecFact, approximate: boolean): boolean {
  if (f.field !== claim.field) return false;
  if (claim.field === "processor") {
    const c = squeezeSpaces((claim.text ?? "").toLowerCase());
    const t = squeezeSpaces((f.text ?? "").toLowerCase());
    return c.length > 0 && t.length > 0 && (t.includes(c) || c.includes(t));
  }
  const v = factValue(f);
  if (v === undefined || claim.value === undefined) return false;
  if (v === claim.value) return true;
  if (claim.field === "storage" && v >= 1024 && Math.abs(v - claim.value) <= v * 0.025) return true; // 1 TB written as 1000 GB
  if (approximate && Math.abs(v - claim.value) <= v * 0.05) return true;
  return false;
}
