/** Text rules for the voice routes. Engine output and shopper text are data: cleaned and bounded, never obeyed. */
export const MAX_TRANSCRIPT_CHARS = 800;
export const MAX_SPEECH_CHARS = 1_600;

// Control characters, bidirectional controls, zero-width characters, BOM and line/paragraph separators: they can hide or reorder text.
// Also the Unicode TAG block (U+E0000 to U+E007F: invisible but readable by a model, "ASCII smuggling"), the Arabic letter mark, the Mongolian
// vowel separator and the variation selectors (VO-03).
// eslint-disable-next-line no-control-regex
const HIDDEN = new RegExp("[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u061C\u180E\u200B-\u200F\u2028-\u202E\u2060-\u2069\uFE00-\uFE0F\uFEFF\u{E0000}-\u{E007F}\u{E0100}-\u{E01EF}]", "gu");

export function cleanText(input: string, maxChars: number): string {
  const s = input.normalize("NFC").replace(HIDDEN, " ").replace(/\s+/g, " ").trim();
  // Cut on a code point boundary so a surrogate pair is never split.
  const chars = Array.from(s);
  return chars.length > maxChars ? chars.slice(0, maxChars).join("") : s;
}

export type SpokenLanguage = "si" | "en" | "mixed" | "unknown";

/** Script-based guess: Sinhala letters (U+0D80 to U+0DFF) versus Latin. Singlish is Latin script and therefore reads as "en". */
export function detectScript(text: string): SpokenLanguage {
  let si = 0;
  let la = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if (c >= 0x0d80 && c <= 0x0dff) si++;
    else if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)) la++;
  }
  if (si === 0 && la === 0) return "unknown";
  if (si > 0 && la === 0) return "si";
  if (si === 0) return "en";
  return si >= la * 3 ? "si" : "mixed";
}

/** Phrases speech models are known to invent on silence or noise. They are not removed silently: the caller may treat them as "no speech" only when the audio is also silent. */
export const COMMON_SILENCE_HALLUCINATIONS = /^(?:thank you\.?|thanks for watching\.?|you|bye\.?|\.+)$/i;
