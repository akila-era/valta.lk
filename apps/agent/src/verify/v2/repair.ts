import { indexProducts, type ProductFacts } from "./evidence";
import { findUrls, urlKey } from "./citations";
import { stripViolatingTitles } from "./quality";
import { splitSentences } from "./text";
import type { Issue, IssueCode, Language, NoticeKey, Repair, SentenceSpan, VerifyV2Input, VerifyV2Result } from "./types";

/**
 * Repair planning. The verifier never "fixes from a guess": it returns an ORDERED plan the turn loop tries step by step, verifying again after each:
 *   1. autofix      deterministic, meaning-preserving (titles, active markup, unsourced links, length);
 *   2. regenerate   one more model call with a server-written message naming the problems and the verified facts;
 *   3. redact       keep the verified sentences, drop the failing ones (and sentences left dangling by them);
 *   4. notice       an honest system message. NEVER a silent shopping fallback.
 * Critical issues (secrets, prompt leaks, injection compliance, cross-customer data, PII) skip regeneration and redaction: they go straight to the notice,
 * except `payment_claim` and `fabricated_source`, which may be regenerated once because the model can simply say something else.
 */
const REGENERABLE_CRITICAL: ReadonlySet<IssueCode> = new Set(["payment_claim", "fabricated_source"]);

const GROUNDING_REPAIRABLE: ReadonlySet<IssueCode> = new Set([
  "ungrounded_price", "claim_price_mismatch", "claim_stock_mismatch", "claim_spec_mismatch", "claim_calculation_mismatch", "claim_ungrounded", "excluded_item_recommended",
  "unsourced_link", "citation_invalid", "citation_unsupported", "search_claimed_without_search", "unperformed_action", "payment_claim", "fabricated_source",
]);
const AUTOFIX_CODES: ReadonlySet<IssueCode> = new Set(["unprompted_honorific", "excess_honorific", "repetitive_honorific", "active_markup", "unsourced_link", "text_too_long"]);

/** Words that start a sentence about "it": when the sentence that named the thing is removed, these are left dangling. */
const ANAPHORA = /^\s*(?:it|its|it's|this|that|they|them|their|these|those|also|and|but|so|however|moreover|additionally|මෙය|එය|ඒක|මේක|මෙහි|එහි|ඒවා|මේවා|meka|eka|eke|meke|ewa|mewa)\b/iu;

const NOTICES: Record<Language, { text: string; needsNativeReview: boolean }> = {
  en: {
    text: "I couldn't verify that answer, so I'm not going to state it. You can rephrase your question, or ask me for the product details and I'll show what the store lists.",
    needsNativeReview: false,
  },
  si: {
    text: "ඒ පිළිතුර තහවුරු කරගැනීමට මට නොහැකි වූ නිසා එය ඔබට කියන්නේ නැහැ. ප්‍රශ්නය වෙනත් ආකාරයකට අසන්න, නැත්නම් නිෂ්පාදනයේ විස්තර අසන්න; වෙබ් අඩවියේ ඇති දේ මම පෙන්වන්නම්.",
    needsNativeReview: true,
  },
  singlish: {
    text: "Mata e answer eka verify karaganna ba, ekai eka kiyanne naha. Question eka wena widihakata ahanna, nathnam product details ahanna; website eke thiyena deval mama pennannam.",
    needsNativeReview: true,
  },
  mixed: {
    text: "I couldn't verify that answer, so I'm not going to state it. Question eka wena widihakata ahanna, or product details ahanna, mama website eke thiyena deval pennannam.",
    needsNativeReview: true,
  },
};

export function noticeFor(language: Language, key: NoticeKey = "could_not_verify"): { text: string; key: NoticeKey; language: Language; needsNativeReview: boolean } {
  void key;
  const n = NOTICES[language] ?? NOTICES.en;
  return { text: n.text, key: "could_not_verify", language, needsNativeReview: n.needsNativeReview };
}

const meaningful = (s: string): number => (s.match(/[\p{L}\p{N}]/gu) ?? []).length;

/** Removes the sentences that carry a grounding/citation/safety problem, and the sentence after each removed one when it only refers back to it. */
export function redactUnsupportedSentences(answerText: string, issues: readonly Issue[], spans?: readonly SentenceSpan[]): { text: string; removed: number[] } {
  const sp = spans ?? splitSentences(answerText);
  const bad = new Set<number>();
  for (const i of issues) if (i.severity === "error" || i.severity === "critical") if (GROUNDING_REPAIRABLE.has(i.code)) bad.add(i.sentenceIndex);
  if (bad.size === 0) return { text: answerText, removed: [] };
  const removed = new Set<number>(bad);
  for (const s of sp) {
    if (removed.has(s.index)) continue;
    if (removed.has(s.index - 1) && ANAPHORA.test(s.text)) removed.add(s.index);
  }
  const kept = sp.filter((s) => !removed.has(s.index));
  const text = kept.map((s) => s.text).join("\n").replace(/\n{2,}/g, "\n").trim();
  if (meaningful(text) < 15) return { text: "", removed: [...removed].sort((a, b) => a - b) };
  return { text: joinLikeOriginal(answerText, kept), removed: [...removed].sort((a, b) => a - b) };
}

/** Joins kept sentences using the separator that was between them in the original (a space or a line break). */
function joinLikeOriginal(original: string, kept: readonly SentenceSpan[]): string {
  let out = "";
  for (let i = 0; i < kept.length; i++) {
    const s = kept[i]!;
    if (i > 0) {
      const prev = kept[i - 1]!;
      out += /\n/.test(original.slice(prev.end, s.start)) ? "\n" : " ";
    }
    out += s.text;
  }
  return out.trim();
}

/** Deterministic, meaning-preserving fixes. The loop must verify the result again. */
export function autoFix(input: VerifyV2Input, result: Pick<VerifyV2Result, "issues">): { text: string; applied: string[] } {
  let text = input.answerText;
  const applied: string[] = [];
  const codes = new Set(result.issues.map((i) => i.code));

  if (codes.has("unprompted_honorific") || codes.has("excess_honorific") || codes.has("repetitive_honorific")) {
    const r = stripViolatingTitles(text, input);
    if (r.removed > 0) {
      text = r.text;
      applied.push("strip_titles");
    }
  }
  if (codes.has("active_markup")) {
    const before = text;
    text = text.replace(/<\s*(?:script|style)\b[\s\S]*?<\s*\/\s*(?:script|style)\s*>/giu, " ").replace(/<\/?[a-z][^>]{0,200}>/giu, " ").replace(/javascript\s*:/giu, "").replace(/ {2,}/g, " ").trim();
    if (text !== before) applied.push("strip_markup");
  }
  if (codes.has("unsourced_link")) {
    const fetched = new Set(input.sourcesFetchedThisTurn.map((s) => urlKey(s.url)?.key).filter((k): k is string => !!k));
    const allowedHosts = new Set((input.policy?.allowedLinkHosts ?? ["valta.hexalyte.com"]).map((h) => h.toLowerCase()));
    const evidence = new Set<string>();
    for (const p of indexProducts(input.toolEvidence)) for (const u of p.urls) { const k = urlKey(u); if (k) evidence.add(k.key); }
    let changed = false;
    for (const u of findUrls(text).sort((a, b) => b.start - a.start)) {
      if (fetched.has(u.key) || evidence.has(u.key) || allowedHosts.has(u.host)) continue;
      text = text.slice(0, u.start) + text.slice(u.end);
      changed = true;
    }
    if (changed) {
      text = text.replace(/\(\s*\)/g, "").replace(/ {2,}/g, " ").replace(/\s+([.,!?])/g, "$1").trim();
      applied.push("strip_unsourced_links");
    }
  }
  const max = input.policy?.maxChars ?? 1200;
  if (codes.has("text_too_long") && text.length > max) {
    const spans = splitSentences(text);
    let end = 0;
    for (const s of spans) {
      if (s.end > max) break;
      end = s.end;
    }
    const cut = end > 0 ? text.slice(0, end) : text.slice(0, max);
    text = cut.trim();
    applied.push("truncate_at_sentence");
  }
  return { text, applied };
}

function factLines(products: readonly ProductFacts[]): string[] {
  const lines: string[] = [];
  for (const p of products.slice(0, 8)) {
    const parts: string[] = [];
    if (p.pricesMinor.length > 0) parts.push(`price ${[...p.pricesMinor].map((m) => `Rs. ${(m / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`).join(" / ")}`);
    if (p.stock && p.stock.status !== "unknown") parts.push(`stock ${p.stock.status.replace(/_/g, " ")}${p.stock.quantities.length > 0 ? ` (${p.stock.quantities.join("/")} units)` : ""}`);
    for (const f of p.specs.slice(0, 10)) parts.push(f.text ? `${f.field} ${f.text}` : `${f.field} ${f.value} ${f.unit ?? ""}`.trim());
    lines.push(`- ${p.names[0] ?? "product"}: ${parts.length > 0 ? parts.join("; ") : "no price, stock or specification listed"}`);
  }
  return lines;
}

const GUIDANCE: Partial<Record<IssueCode, string>> = {
  ungrounded_price: "State a store price only when it is listed below; otherwise say the price is not listed.",
  claim_price_mismatch: "A price you wrote does not match the listed price. Use the listed price exactly.",
  claim_stock_mismatch: "A stock statement does not match the listed stock. Use the listed stock exactly.",
  claim_spec_mismatch: "A specification you wrote does not match the listed specification. Use the listed values, or say it is not listed.",
  claim_calculation_mismatch: "An arithmetic result you wrote is wrong. Recompute it carefully or use the calculator result.",
  claim_ungrounded: "You stated a store fact that is not in the data below. Remove it or say it is not listed.",
  excluded_item_recommended: "The customer excluded some brands, products or categories. Do not offer or recommend them.",
  unsourced_link: "Do not include links that were not provided to you.",
  fabricated_source: "You cited a source that was not fetched in this conversation turn. Cite only the sources listed below, or cite nothing.",
  citation_invalid: "A citation marker points at a source that does not exist. Use only the numbered sources listed below.",
  citation_missing: "Your answer uses information from the fetched sources: cite them with their numbers.",
  citation_unsupported: "A cited sentence is not supported by its source. Restate it so it matches the source.",
  search_claimed_without_search: "You said you searched or looked something up, but no search result is available this turn. Do not claim a search; answer from what you know and say so.",
  payment_claim: "You cannot place orders or take payments. Do not say an order or payment was completed.",
  unperformed_action: "You did not perform that action. Offer it as a suggestion the customer can confirm instead.",
  unprompted_honorific: "Do not use titles such as Sir or Madam unless the customer asked for it; address the customer naturally.",
  excess_honorific: "Use at most one title in a reply.",
  repetitive_honorific: "Do not repeat a title in consecutive sentences.",
  repeated_reply: "Your answer repeats your previous reply. Answer the customer's latest message directly and differently.",
  language_mismatch: "Reply in the customer's language.",
  unexpected_script: "Use only English letters and Sinhala script (and any script the customer used). Remove stray characters from other writing systems.",
  empty_answer: "Give a real, direct answer to the customer's question.",
  text_too_long: "Make the answer shorter.",
  active_markup: "Use plain text only, without HTML or scripts.",
};

/** The message sent to the model for the one allowed regeneration. It lists codes and verified facts; it never contains the customer's message. */
export function buildFeedback(input: VerifyV2Input, issues: readonly Issue[]): string {
  const codes = [...new Set(issues.filter((i) => i.severity !== "info").map((i) => i.code))];
  const lines: string[] = [];
  lines.push("Your previous answer could not be used. Write a new answer to the customer's latest message.");
  lines.push("Problems found:");
  for (const c of codes) lines.push(`- ${c}: ${GUIDANCE[c] ?? "Fix this problem."}`);
  const products = indexProducts(input.toolEvidence);
  if (products.length > 0) {
    lines.push("Verified store facts you may use (state nothing else about the store):");
    lines.push(...factLines(products));
  }
  if (input.sourcesFetchedThisTurn.length > 0) {
    lines.push("Sources fetched this turn (the only ones you may cite):");
    input.sourcesFetchedThisTurn.forEach((s, i) => lines.push(`[${i + 1}] ${s.title ?? "source"} - ${s.url}`));
  }
  if (input.exclusions && [...(input.exclusions.brands ?? []), ...(input.exclusions.products ?? []), ...(input.exclusions.categories ?? [])].length > 0) {
    lines.push(`Excluded by the customer (do not offer): ${[...(input.exclusions.brands ?? []), ...(input.exclusions.products ?? []), ...(input.exclusions.categories ?? [])].join(", ")}.`);
  }
  return lines.join("\n");
}

export function planRepair(result: Pick<VerifyV2Result, "issues" | "verdict">, input: VerifyV2Input): Repair[] {
  if (result.verdict === "pass") return [];
  const issues = result.issues.filter((i) => i.severity === "error" || i.severity === "critical");
  const notice = (): Repair => ({ kind: "notice", ...noticeFor(input.language) });
  if (issues.length === 0) return [];
  const criticals = issues.filter((i) => i.severity === "critical");
  if (criticals.length > 0 && criticals.some((i) => !REGENERABLE_CRITICAL.has(i.code))) return [notice()];

  const steps: Repair[] = [];
  if (issues.some((i) => AUTOFIX_CODES.has(i.code))) {
    const fixed = autoFix(input, { issues });
    if (fixed.applied.length > 0 && fixed.text.trim().length > 0) steps.push({ kind: "autofix", text: fixed.text, applied: fixed.applied });
  }
  // anything the deterministic fixes cannot resolve (or a fix that produced nothing) gets one regeneration with feedback
  const needsRegeneration = issues.some((i) => !AUTOFIX_CODES.has(i.code)) || !steps.some((st) => st.kind === "autofix");
  if (needsRegeneration) steps.push({ kind: "regenerate", feedback: buildFeedback(input, issues), codes: [...new Set(issues.map((i) => i.code))] });
  const spans = splitSentences(input.answerText);
  const red = redactUnsupportedSentences(input.answerText, issues, spans);
  if (red.removed.length > 0 && red.text.length > 0) steps.push({ kind: "redact", text: red.text, removedSentences: red.removed });
  steps.push(notice());
  return steps;
}
