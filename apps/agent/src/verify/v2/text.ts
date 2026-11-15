import { ISSUE_CATEGORY, ISSUE_SEVERITY, type Issue, type IssueCode, type SentenceSpan } from "./types";

/** Hard cap on the characters analysed. Longer answers are cut for analysis and flagged `text_too_long`. */
export const MAX_ANALYSED_CHARS = 20_000;

/**
 * A 1:1 character fold, so a character offset in the folded text is the same offset in the original answer.
 * ASCII upper case becomes lower case; Sinhala, Arabic-Indic and full-width digits become ASCII digits; invisible and bidirectional
 * control characters become a space (they could hide or split text); curly apostrophes become `'`. Sinhala letters and the zero-width
 * joiner inside Sinhala words are left alone.
 */
export function fold(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c >= 0x0de6 && c <= 0x0def) out += String.fromCharCode(48 + c - 0x0de6);
    else if (c >= 0xff10 && c <= 0xff19) out += String.fromCharCode(48 + c - 0xff10);
    else if (c >= 0x0660 && c <= 0x0669) out += String.fromCharCode(48 + c - 0x0660);
    else if (c >= 65 && c <= 90) out += String.fromCharCode(c + 32);
    else if (c === 0x200b || c === 0xfeff || c === 0x00ad || c === 0x200e || c === 0x200f || (c >= 0x202a && c <= 0x202e) || (c >= 0x2066 && c <= 0x2069)) out += " ";
    else if (c === 0x2018 || c === 0x2019) out += "'";
    else out += text[i]!;
  }
  return out;
}

/** Folded text with every run of non-letters/digits reduced to one space: for name and phrase matching (not for offsets). */
export function squeeze(text: string): string {
  return fold(text).replace(/[^\p{L}\p{N}\p{M}]+/gu, " ").trim();
}

const ABBREVIATIONS = new Set(["rs", "lkr", "mr", "mrs", "ms", "dr", "vs", "etc", "eg", "e.g", "ie", "i.e", "approx", "no", "st", "inc", "ltd", "co", "min", "max", "avg", "qty", "approx", "est", "tel", "ph"]);

/** Sentence spans of the original text. Line breaks end a sentence; `.`, `!`, `?` end one unless they sit inside a number, an abbreviation such as "Rs." or a list marker. */
export function splitSentences(text: string): SentenceSpan[] {
  const spans: SentenceSpan[] = [];
  let start = 0;
  const push = (end: number): void => {
    let s = start;
    let e = end;
    while (s < e && /\s/.test(text[s]!)) s++;
    while (e > s && /\s/.test(text[e - 1]!)) e--;
    if (e > s) spans.push({ index: spans.length, start: s, end: e, text: text.slice(s, e) });
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === "\n") {
      push(i);
      start = i + 1;
      continue;
    }
    if (ch === "." || ch === "!" || ch === "?" || ch === "…") {
      const next = text[i + 1];
      const atEnd = next === undefined || /\s/.test(next);
      if (!atEnd) continue;
      if (ch === ".") {
        // The token before the dot: an abbreviation ("Rs.") or a bare list number ("1.") is not a sentence end.
        const before = text.slice(Math.max(0, i - 12), i);
        const tok = /([A-Za-z][A-Za-z.]*|\d+)$/.exec(before)?.[1]?.toLowerCase() ?? "";
        if (ABBREVIATIONS.has(tok) || /^\d+$/.test(tok)) {
          const lineStart = text.lastIndexOf("\n", i) + 1;
          if (ABBREVIATIONS.has(tok) || text.slice(lineStart, i).trim() === tok) continue;
        }
      }
      // swallow closing quotes/brackets and repeated punctuation
      let j = i + 1;
      while (j < text.length && /["')\]”’.!?]/.test(text[j]!)) j++;
      push(j);
      start = j;
      i = j - 1;
    }
  }
  push(text.length);
  return spans;
}

export function sentenceAt(spans: readonly SentenceSpan[], offset: number): SentenceSpan {
  for (const s of spans) if (offset >= s.start && offset < s.end) return s;
  // between sentences (whitespace) or after the last one: the nearest earlier sentence
  let best: SentenceSpan | undefined;
  for (const s of spans) if (s.start <= offset) best = s;
  return best ?? spans[0] ?? { index: 0, start: 0, end: 0, text: "" };
}

export function makeIssue(code: IssueCode, spans: readonly SentenceSpan[], start: number, end: number, detail?: Issue["detail"]): Issue {
  const s = sentenceAt(spans, start);
  return {
    code,
    severity: ISSUE_SEVERITY[code],
    category: ISSUE_CATEGORY[code],
    start,
    end,
    sentenceIndex: s.index,
    sentence: s.text,
    ...(detail ? { detail } : {}),
  };
}

/** Significant word tokens (length >= 3, not a stop word) for the lexical support heuristics. */
const STOP = new Set(["the", "and", "for", "are", "was", "that", "this", "with", "you", "your", "has", "have", "from", "will", "can", "not", "but", "all", "any", "its", "our", "they", "their", "there", "which", "what", "when", "where", "also", "than", "then", "into", "about", "more", "most"]);
export function tokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const t of squeeze(text).split(" ")) if (t.length >= 3 && !STOP.has(t)) out.add(t);
  return out;
}

export const hasSinhalaScript = (text: string): boolean => /[඀-෿]/.test(text);

/** Share of letters that are Sinhala. */
export function sinhalaRatio(text: string): number {
  let letters = 0;
  let sinhala = 0;
  for (const ch of text) {
    if (/\p{L}/u.test(ch)) {
      letters++;
      if (/[඀-෿]/.test(ch)) sinhala++;
    }
  }
  return letters === 0 ? 0 : sinhala / letters;
}
