import { fold, hasSinhalaScript, makeIssue, sinhalaRatio, squeeze, tokens } from "./text";
import type { HonorificPolicy, Issue, SentenceSpan, VerifyV2Input } from "./types";

/**
 * Conversation-quality GUARDS (they flag; they never rewrite meaning): respectful but natural address, no repeated reply, the right language,
 * a real answer, a sane length, no active markup. The honorific rule implements the owner's requirement: use a title only when the customer's
 * preference (or the account's title) is known, at most once per reply, never in consecutive sentences, and NEVER inferred from a name or style.
 */
export type Gender = "sir" | "madam";

/** Titles, longest first so that "mahattaya" is not read as "mahatta". Latin forms are matched on word boundaries; Sinhala forms as substrings. */
const TITLES: { gender: Gender; latin?: string; sinhala?: string }[] = [
  { gender: "sir", latin: "sir" },
  { gender: "madam", latin: "madam" },
  { gender: "madam", latin: "ma'am" },
  { gender: "madam", latin: "madame" },
  { gender: "sir", latin: "mahattaya" },
  { gender: "sir", latin: "mahathaya" },
  { gender: "sir", latin: "mahathmaya" },
  { gender: "madam", latin: "mahathmiya" },
  { gender: "madam", latin: "mahattiya" },
  { gender: "sir", latin: "aiya" },
  { gender: "madam", latin: "akka" },
  { gender: "madam", latin: "aunty" },
  { gender: "sir", latin: "uncle" },
  { gender: "sir", sinhala: "මහත්මයා" },
  { gender: "madam", sinhala: "මහත්මිය" },
  { gender: "sir", sinhala: "මහතා" },
  { gender: "madam", sinhala: "මැතිණිය" },
  { gender: "madam", sinhala: "මැඩම්" },
  { gender: "sir", sinhala: "සර්" },
  { gender: "sir", sinhala: "අයියා" },
  { gender: "madam", sinhala: "අක්කා" },
  { gender: "madam", sinhala: "ඇන්ටි" },
  { gender: "sir", sinhala: "අංකල්" },
];

/**
 * "Sir Isaac Newton", "Madame Curie": a title written with a capital letter and followed by a capitalised name is part of a PERSON'S name in a general-knowledge
 * answer, not a way of addressing the customer. (A customer-facing "Yes, Sir Samsung is..." is not a real pattern.)
 */
function isPersonTitle(text: string, start: number, end: number, latin: string): boolean {
  if (!["sir", "madam", "madame"].includes(latin)) return false;
  if (!/[A-Z]/.test(text[start] ?? "")) return false;
  return /^ [A-Z][a-z]/.test(text.slice(end, end + 3));
}

/** Common case endings that may follow a Sinhala title and still leave it a title ("සර්ට" to sir). */
const SINHALA_CASE_SUFFIXES = ["ට", "ගේ", "ලා", "ගෙන්", "ගෙ"];

/**
 * Most Sinhala titles can be matched as substrings, but the loanword "සර්" is also the start of many ordinary words (සර්වර් "server", සර්ච් "search",
 * සර්ටිෆිකේට් "certificate"). It only counts as a title when the word ends there, or after a case ending.
 */
function sinhalaTitleEndsWord(text: string, end: number, title: string): boolean {
  if (title !== "සර්") return true;
  const next = text[end];
  if (next === undefined || !/[඀-෿]/.test(next)) return true;
  return SINHALA_CASE_SUFFIXES.some((suf) => text.startsWith(suf, end) && !/[඀-෿]/.test(text[end + suf.length] ?? " "));
}

export interface TitleHit {
  gender: Gender;
  start: number;
  end: number;
  sentenceIndex: number;
}

export function findTitles(text: string, spans: readonly SentenceSpan[]): TitleHit[] {
  const folded = fold(text);
  const hits: TitleHit[] = [];
  const taken: [number, number][] = [];
  const free = (s: number, e: number): boolean => !taken.some(([a, b]) => s < b && e > a);
  for (const t of TITLES) {
    if (t.latin) {
      const esc = t.latin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      for (const m of folded.matchAll(new RegExp(`(?<![\\p{L}\\p{N}])${esc}(?![\\p{L}\\p{N}])`, "gu"))) {
        if (!free(m.index!, m.index! + m[0].length)) continue;
        if (isPersonTitle(text, m.index!, m.index! + m[0].length, t.latin)) continue;
        taken.push([m.index!, m.index! + m[0].length]);
        hits.push({ gender: t.gender, start: m.index!, end: m.index! + m[0].length, sentenceIndex: 0 });
      }
    } else if (t.sinhala) {
      let from = 0;
      for (;;) {
        const i = text.indexOf(t.sinhala, from);
        if (i < 0) break;
        const e = i + t.sinhala.length;
        // a Sinhala title is a word of its own, not the tail of another word ("මහතා" inside "සහමහතා"): require a non-letter or a space before it
        const prev = i > 0 ? text[i - 1]! : " ";
        if (free(i, e) && !/[඀-෿]/.test(prev) && sinhalaTitleEndsWord(text, e, t.sinhala)) {
          taken.push([i, e]);
          hits.push({ gender: t.gender, start: i, end: e, sentenceIndex: 0 });
        }
        from = e;
      }
    }
  }
  hits.sort((a, b) => a.start - b.start);
  for (const h of hits) h.sentenceIndex = spans.find((s) => h.start >= s.start && h.start < s.end)?.index ?? 0;
  return hits;
}

const allowedGender = (p: HonorificPolicy | undefined): Gender | null => (p?.preference === "sir" ? "sir" : p?.preference === "madam" ? "madam" : null);

export function checkHonorifics(text: string, spans: readonly SentenceSpan[], input: VerifyV2Input): Issue[] {
  const issues: Issue[] = [];
  const policy = input.policy?.honorific;
  const allowed = allowedGender(policy);
  const max = policy?.maxPerReply ?? 1;
  const hits = findTitles(text, spans);
  let used = 0;
  let lastSentence = -10;
  for (const h of hits) {
    if (allowed === null) {
      issues.push(makeIssue("unprompted_honorific", spans, h.start, h.end, { gender: h.gender, reason: "preference_unknown" }));
      continue;
    }
    if (h.gender !== allowed) {
      issues.push(makeIssue("unprompted_honorific", spans, h.start, h.end, { gender: h.gender, reason: "wrong_title" }));
      continue;
    }
    used++;
    if (used > max) issues.push(makeIssue("excess_honorific", spans, h.start, h.end, { count: used, max }));
    else if (h.sentenceIndex - lastSentence === 1) issues.push(makeIssue("repetitive_honorific", spans, h.start, h.end, { sentence: h.sentenceIndex }));
    lastSentence = h.sentenceIndex;
  }
  return issues;
}

/** Removes titles that violate the policy (and every title beyond the allowed number), tidying the punctuation around them. Returns the text and how many were removed. */
export function stripViolatingTitles(text: string, input: VerifyV2Input): { text: string; removed: number } {
  const bad = checkHonorifics(text, splitForTitles(text), input).filter((i) => i.code === "unprompted_honorific" || i.code === "excess_honorific" || i.code === "repetitive_honorific");
  if (bad.length === 0) return { text, removed: 0 };
  let out = text;
  for (const i of [...bad].sort((a, b) => b.start - a.start)) {
    let s = i.start;
    let e = i.end;
    // ", sir" / " sir," / "sir, " / " sir " : take the comma and one adjoining space with it
    if (out[s - 1] === " " && out[s - 2] === ",") s -= 2;
    else if (out[s - 1] === ",") s -= 1;
    else if (out[e] === ",") {
      e += 1;
      if (out[e] === " ") e += 1;
    } else if (out[s - 1] === " ") s -= 1;
    out = out.slice(0, s) + out.slice(e);
  }
  out = out.replace(/ {2,}/g, " ").replace(/\s+([.!?,])/g, "$1").replace(/^[\s,]+/, "").trim();
  return { text: out, removed: bad.length };
}

function splitForTitles(text: string): SentenceSpan[] {
  // sentence indexes are only needed for "consecutive sentences": a cheap split on terminal punctuation and line breaks is enough here
  const spans: SentenceSpan[] = [];
  let start = 0;
  for (const m of text.matchAll(/[.!?]+(?=\s|$)|\n+/g)) {
    const end = m.index! + m[0].length;
    if (end > start) spans.push({ index: spans.length, start, end, text: text.slice(start, end) });
    start = end;
  }
  if (start < text.length) spans.push({ index: spans.length, start, end: text.length, text: text.slice(start) });
  return spans;
}

/** Lower-case, punctuation-free form for the repetition test. */
const normReply = (s: string): string => squeeze(s);

export function checkRepetition(text: string, spans: readonly SentenceSpan[], input: VerifyV2Input): Issue[] {
  const prev = input.previousAssistantReply;
  if (!prev) return [];
  const a = normReply(text);
  const b = normReply(prev);
  if (a.length === 0 || b.length === 0) return [];
  if (a === b) return [makeIssue("repeated_reply", spans, 0, text.length, { similarity: 1 })];
  if (a.length >= 20 && b.length >= 20) {
    const ta = tokens(text);
    const tb = tokens(prev);
    if (ta.size >= 4 && tb.size >= 4) {
      let inter = 0;
      for (const t of ta) if (tb.has(t)) inter++;
      const jac = inter / (ta.size + tb.size - inter);
      if (jac >= 0.9) return [makeIssue("repeated_reply", spans, 0, text.length, { similarity: Math.round(jac * 100) / 100 })];
    }
  }
  return [];
}

export function checkLanguage(text: string, spans: readonly SentenceSpan[], input: VerifyV2Input): Issue[] {
  if (squeeze(text).length < 30) return [];
  const ratio = sinhalaRatio(text);
  if (input.language === "en" && ratio > 0.2) return [makeIssue("language_mismatch", spans, 0, text.length, { expected: "en", sinhalaRatio: Math.round(ratio * 100) / 100 })];
  if (input.language === "si" && !hasSinhalaScript(text)) return [makeIssue("language_mismatch", spans, 0, text.length, { expected: "si", sinhalaRatio: 0 })];
  if (input.language === "singlish" && ratio > 0.5) return [makeIssue("language_mismatch", spans, 0, text.length, { expected: "singlish", sinhalaRatio: Math.round(ratio * 100) / 100 })];
  return [];
}

/**
 * Scripts that sometimes leak into a model's answer as a stray fragment (seen with a real model: a Bengali fragment inside a Singlish word). Letters of these
 * scripts are flagged unless the customer wrote that script or the same characters appear in the shop's own tool results (a product name). Latin, Sinhala,
 * digits, punctuation, emoji and Greek (which maths and units use) are never flagged.
 */
const STRAY_SCRIPT = /[\p{Script=Bengali}\p{Script=Devanagari}\p{Script=Tamil}\p{Script=Telugu}\p{Script=Malayalam}\p{Script=Kannada}\p{Script=Gujarati}\p{Script=Gurmukhi}\p{Script=Oriya}\p{Script=Arabic}\p{Script=Cyrillic}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}\p{Script=Hebrew}]/u;
const STRAY_SCRIPT_ALL = new RegExp(STRAY_SCRIPT.source, "gu");

export function checkScripts(text: string, spans: readonly SentenceSpan[], input: VerifyV2Input): Issue[] {
  const first = STRAY_SCRIPT.exec(text);
  if (!first) return [];
  if (STRAY_SCRIPT.test(input.userMessage)) return [];
  const known = JSON.stringify(input.toolEvidence);
  const stray = (text.match(STRAY_SCRIPT_ALL) ?? []).filter((ch) => !known.includes(ch));
  if (stray.length === 0) return [];
  return [makeIssue("unexpected_script", spans, first.index, first.index + first[0].length, { chars: stray.length })];
}

const FILLER = /^(?:ok(?:ay)?|sure|yes|no|alright|understood|i understand|got it|noted|hmm+|well|right|ඔව්|හරි|හොඳයි)[.!\s]*$/iu;

export function checkEmpty(text: string, spans: readonly SentenceSpan[]): Issue[] {
  const t = text.trim();
  if (t.length === 0) return [makeIssue("empty_answer", spans, 0, 0, { reason: "empty" })];
  if (FILLER.test(t)) return [makeIssue("empty_answer", spans, 0, text.length, { reason: "filler" })];
  if (!/[\p{L}\p{N}]/u.test(t)) return [makeIssue("empty_answer", spans, 0, text.length, { reason: "no_content" })];
  return [];
}

const ACTIVE_MARKUP = /<\s*(?:script|iframe|object|embed|style|img|svg|form|link|meta)\b|javascript\s*:|\bon[a-z]{3,}\s*=\s*["']|<\s*\/?\s*[a-z][^>]{0,200}>/iu;

export function checkFormat(text: string, spans: readonly SentenceSpan[], input: VerifyV2Input, truncated: boolean): Issue[] {
  const out: Issue[] = [];
  const max = input.policy?.maxChars ?? 1200;
  if (text.length > max || truncated) out.push(makeIssue("text_too_long", spans, Math.min(max, Math.max(0, text.length - 1)), text.length, { chars: text.length, max }));
  const m = ACTIVE_MARKUP.exec(text);
  if (m) out.push(makeIssue("active_markup", spans, m.index, m.index + m[0].length));
  return out;
}
