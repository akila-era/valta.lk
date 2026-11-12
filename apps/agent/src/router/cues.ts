import { hasSinhalaLetters, normalizeMatch, tokenize } from "./normalize";

/** A phrase compiled once: normalised exactly like user text so spelling variants (joiners, case) cannot cause misses. */
export interface CompiledPhrase {
  raw: string;
  text: string;
  sinhala: boolean;
  prefix: boolean;
  negative: boolean;
}

const cache = new Map<string, CompiledPhrase>();

export function compilePhrase(raw: string): CompiledPhrase {
  const hit = cache.get(raw);
  if (hit) return hit;
  const negative = raw.startsWith("!");
  const body = negative ? raw.slice(1) : raw;
  const prefix = body.endsWith("*");
  const text = normalizeMatch(prefix ? body.slice(0, -1) : body);
  const compiled: CompiledPhrase = { raw, text, sinhala: hasSinhalaLetters(text), prefix, negative };
  cache.set(raw, compiled);
  return compiled;
}

/** The text being routed, prepared once per message. */
export interface Haystack {
  text: string;
  padded: string;
  tokens: string[];
  tokenSet: Set<string>;
}

export function makeHaystack(matchText: string): Haystack {
  const tokens = tokenize(matchText);
  return { text: matchText, padded: ` ${matchText} `, tokens, tokenSet: new Set(tokens) };
}

/**
 * Latin phrases match whole words (so "case" does not match "suitcase"); Sinhala phrases match as substrings, because Sinhala
 * attaches endings to words ("තොගේ", "තොගයේ"). A trailing "*" makes a Latin phrase a word prefix.
 */
export function phraseMatches(h: Haystack, p: CompiledPhrase): boolean {
  if (p.text === "") return false;
  if (p.sinhala) return h.text.includes(p.text);
  if (p.prefix) return h.tokens.some((t) => t.startsWith(p.text));
  return h.padded.includes(` ${p.text} `);
}

export const anyPhrase = (h: Haystack, phrases: readonly string[]): boolean => phrases.some((raw) => !compilePhrase(raw).negative && phraseMatches(h, compilePhrase(raw)));
