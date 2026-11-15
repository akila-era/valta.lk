/** Text helpers for the catalogue audit. All pure; all bounded (inputs are cut before any pattern runs). */

export const MAX_ANALYSED_CHARS = 4000;

export const cut = (s: string, n = MAX_ANALYSED_CHARS): string => (s.length > n ? s.slice(0, n) : s);

/** Spelling noise in names that should not stop two records being recognised as the same product (Latin transliteration of common brands). */
const TOKEN_ALIASES: Record<string, string> = {
  aifon: "iphone",
  ayfon: "iphone",
  aiphone: "iphone",
  iphon: "iphone",
  ifone: "iphone",
  sansung: "samsung",
  samsong: "samsung",
  samsumg: "samsung",
  xiomi: "xiaomi",
  shaomi: "xiaomi",
  xaomi: "xiaomi",
  redme: "redmi",
  redmy: "redmi",
  huwawei: "huawei",
  hawwei: "huawei",
  macbok: "macbook",
  mackbook: "macbook",
  labtop: "laptop",
};

/** Lower case, accents removed, punctuation to single spaces, known transliteration noise folded. Sinhala letters and signs are kept. */
export function nameKey(input: string): string {
  const base = cut(input)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, " ")
    .trim();
  return base
    .split(" ")
    .filter(Boolean)
    .map((t) => TOKEN_ALIASES[t] ?? t)
    .join(" ");
}

export const tokens = (key: string): string[] => key.split(" ").filter(Boolean);

/** Edit distance with an early exit once it must exceed `max`. */
export function editDistance(a: string, b: string, max = 2): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min((prev[j] ?? 0) + 1, (cur[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length] ?? max + 1;
}

export const jaccard = (a: string[], b: string[]): number => {
  const A = new Set(a);
  const B = new Set(b);
  if (A.size === 0 && B.size === 0) return 1;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
};

export type Script = "latin" | "sinhala" | "tamil" | "other" | "none";

export function scriptOf(s: string): Script {
  const t = cut(s, 400);
  if (/[඀-෿]/.test(t)) return "sinhala";
  if (/[஀-௿]/.test(t)) return "tamil";
  if (/[A-Za-z]/.test(t)) return "latin";
  if (/\p{L}/u.test(t)) return "other";
  return "none";
}

const ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];

/**
 * Keyboard-mash heuristic for ONE Latin word. A word with no vowel, a long consonant run, a run of one repeated letter, or four or more letters from a
 * single keyboard row looks typed at random. Only a hint: real words can match (the caller treats a hit as "a person should look").
 */
export function looksLikeMash(word: string): boolean {
  const w = word.toLowerCase();
  if (!/^[a-z]{3,24}$/.test(w)) return false;
  if (!/[aeiou]/.test(w) && w.length >= 3) return true;
  if (/[^aeiou]{5,}/.test(w)) return true;
  if (/(.)\1{3,}/.test(w)) return true;
  if (w.length >= 4 && ROWS.some((row) => [...w].every((c) => row.includes(c)))) return true;
  return false;
}

/** Hidden or direction-changing characters: they show nothing to a person but are read by a model. */
// eslint-disable-next-line no-control-regex
export const INVISIBLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F​-‏‪-‮⁠-⁤⁦-⁩﻿]/;

export const INJECTION_LIKE = /\b(ignore (all |any |the )?(previous|prior|above) (instructions|rules)|disregard (the )?(system|previous)|you are now|system prompt|developer message|reveal (your|the) (prompt|instructions)|act as (an? )?(admin|system))\b/i;

/** Markup removed, whitespace collapsed. */
export const plain = (s: string): string => cut(s).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
