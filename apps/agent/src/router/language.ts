import { normalizeMatch, tokenize } from "./normalize";
import type { LanguageInfo } from "./types";

const SINHALA_LETTERS = /[අ-ෆ]/g;
const LATIN_LETTERS = /[a-z]/gi;

/** Words that are Singlish (Sinhala written in Latin letters) and are not ordinary English. */
const SINGLISH_STRONG = new Set([
  "ekak", "eka", "ekata", "eke", "eken", "ekai", "thiyenawada", "thiyanawada", "tiyenawada", "thiyenawa", "thiyanawa", "tiyenawa", "koheda", "kohomada", "mokakda", "monawada",
  "kiyada", "kiyanna", "denna", "danna", "ganna", "mage", "oni", "ona", "puluwanda", "puluwan", "nadda", "neda", "balanna", "pennanna", "hoyanna", "karanna", "adu", "wadi",
  "hodama", "honda", "meka", "meke", "mekata", "meken", "oyata", "oyage", "mata", "karala", "ain", "kiyala", "tikak", "godak", "kohed", "kohe", "mokada", "wage", "nathnam",
  "walata", "ekakda", "ekaka", "dekak", "thunak", "pahak", "ekakma", "ayubowan", "istuti", "sthuthi", "ow", "nene", "naha", "hari",
]);
/** Weak markers are common in English too, so two or more are needed. */
const SINGLISH_WEAK = new Set(["one", "karanna", "ok", "api", "oya", "mama", "me", "ah"]);

export interface LanguageOptions {
  /** The locale the website sent. It only breaks ties for Latin text with no Singlish markers; it never overrides script. */
  locale?: "auto" | "si" | "en";
}

/**
 * Deterministic language and script detection. Sinhala script ALWAYS means the Sinhala path (Qwen cannot read Sinhala
 * reliably, so it never interprets such text). Latin text with Singlish markers also goes to the deterministic router.
 */
export function detectLanguage(text: string, opts: LanguageOptions = {}): LanguageInfo {
  const sinhala = (text.match(SINHALA_LETTERS) ?? []).length;
  const latin = (text.match(LATIN_LETTERS) ?? []).length;

  if (sinhala > 0) {
    return latin > 0
      ? { script: "mixed", language: "mixed", path: "sinhala", reason: "sinhala script with latin words" }
      : { script: "si", language: "si", path: "sinhala", reason: "sinhala script only" };
  }

  const tokens = tokenize(normalizeMatch(text));
  const strong = tokens.filter((t) => SINGLISH_STRONG.has(t)).length;
  const weak = tokens.filter((t) => SINGLISH_WEAK.has(t)).length;
  if (strong >= 1 || weak >= 2) return { script: "si-latin", language: "mixed", path: "sinhala", reason: "singlish markers" };

  if (opts.locale === "si") return { script: "si-latin", language: "mixed", path: "sinhala", reason: "locale si with latin text" };
  return { script: "en", language: "en", path: "english", reason: "latin text" };
}
