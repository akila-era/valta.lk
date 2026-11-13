/**
 * Text normalisation for the deterministic router.
 *
 * Two forms are produced:
 *  - display form: NFC, invisible controls removed, whitespace collapsed. Zero-width joiners are KEPT because Sinhala
 *    conjuncts (for example the "ශ්‍රී" in "ශ්‍රී ලංකා") are written with U+200D.
 *  - match form: everything the lexicon and rules compare against. Lower-cased, NFKC, joiners removed (the lexicon is
 *    normalised the same way, so both spellings match), Sinhala digits turned into ASCII digits, punctuation turned into
 *    spaces, and runs of three or more identical Latin letters shortened ("thiyenawadaaaa" -> "thiyenawadaa").
 */

const BIDI_AND_INVISIBLE = /[‎‏‪-‮⁦-⁩­⁠﻿​]/g;
const JOINERS = /[‌‍]/g;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

const SINHALA_DIGIT_ZERO = 0x0de6;

export function normalizeDisplay(input: string): string {
  return input.normalize("NFC").replace(CONTROL, " ").replace(BIDI_AND_INVISIBLE, "").replace(/\s+/g, " ").trim();
}

function mapSinhalaDigits(s: string): string {
  return s.replace(/[෦-෯]/g, (ch) => String(ch.charCodeAt(0) - SINHALA_DIGIT_ZERO));
}

/**
 * Common spelling variants of everyday words, mapped to one canonical spelling. Applied to whole words only, in the match form, and
 * the lexicon is normalised the same way, so "kohomd" and "kohomada" mean the same thing without listing every variant everywhere.
 * Only unambiguous variants are listed: a word that is also a different real word (for example "one") is left alone.
 */
const SPELLING_VARIANTS: Record<string, string> = {
  kohomd: "kohomada", kohmada: "kohomada", kohomda: "kohomada", kohomadha: "kohomada", kohamada: "kohomada",
  penanna: "pennanna", pennana: "pennanna", penna: "pennanna", pennnna: "pennanna",
  thiyenwada: "thiyenawada", thiyenawd: "thiyenawada", thiyenavada: "thiyenawada", tiyenawada: "thiyenawada", thiyanawada: "thiyenawada", thienawada: "thiyenawada", thiyenavda: "thiyenawada",
  puluwn: "puluwan", puluvan: "puluwan", pluwan: "puluwan", puluvn: "puluwan", puluwanda: "puluwanda", puluvanda: "puluwanda", puluwnd: "puluwanda", puluwandha: "puluwanda",
  karann: "karanna", karnna: "karanna",
  mokakda: "mokada", mokkda: "mokada", mokd: "mokada", mokakd: "mokada", monawada: "monawada", mnawada: "monawada",
  kiyda: "kiyada", kiyd: "kiyada", kiynda: "kiyada",
  ekk: "ekak", dnna: "danna", dhanna: "danna",
  oyta: "oyata", mta: "mata",
  compair: "compare", comapre: "compare", comper: "compare", comparre: "compare",
  fone: "phone", phn: "phone", phon: "phone", fones: "phones",
  labtop: "laptop", laptap: "laptop", lappy: "laptop",
  chargar: "charger", chrger: "charger", charjer: "charger",
  avilable: "available", availble: "available", avaliable: "available",
  stok: "stock", chep: "cheap", cheep: "cheap", ordar: "order",
};

export function normalizeMatch(input: string): string {
  let s = input.normalize("NFKC").toLowerCase();
  s = s.replace(CONTROL, " ").replace(BIDI_AND_INVISIBLE, "").replace(JOINERS, "");
  s = mapSinhalaDigits(s);
  s = s.normalize("NFC");
  // Keep letters, digits, Sinhala, and the few symbols that carry meaning; everything else separates words.
  s = s.replace(/[^\p{L}\p{M}\p{N}\s.,%:/+\-]/gu, " ");
  // A full stop or comma only matters inside a number ("1,500", "1.5"). Elsewhere it is punctuation.
  s = s.replace(/(?<!\d)[.,]|[.,](?!\d)/g, " ");
  s = s.replace(/[:/+\-]+/g, (m) => (m === "-" ? "-" : " "));
  s = s.replace(/([a-z])\1{2,}/g, "$1$1");
  s = s.replace(/\s+/g, " ").trim();
  return s.replace(/[a-z]+/g, (w) => SPELLING_VARIANTS[w] ?? w);
}

export const tokenize = (matchForm: string): string[] => (matchForm === "" ? [] : matchForm.split(" "));

/** Sinhala letters plus the Sinhala combining signs. */
export const SINHALA_LETTER = /[අ-ෆ]/;
export const hasSinhalaLetters = (s: string): boolean => SINHALA_LETTER.test(s);

/** Levenshtein distance with an early exit, for tolerating one typo in brand and model words. */
export function editDistanceAtMost(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  if (a === b) return true;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let last = prev[0]!;
    prev[0] = i;
    let rowMin = prev[0]!;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]!;
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, last + (a[i - 1] === b[j - 1] ? 0 : 1));
      last = tmp;
      rowMin = Math.min(rowMin, prev[j]!);
    }
    if (rowMin > max) return false;
  }
  return prev[b.length]! <= max;
}
