import { containsSensitive, checkSafety } from "../../router/safety";
import { fold, makeIssue, squeeze } from "./text";
import type { Issue, SentenceSpan, VerifyV2Input } from "./types";

/**
 * The refusal classes that stay in v2 (they are NOT relaxed): secrets, instruction/prompt leakage, personal data nobody gave the assistant, obeying
 * instructions hidden in fetched pages, claims of payments/orders/actions that did not happen, other customers' data.
 * `containsSensitive` (card numbers with a valid checksum, OTPs, passwords, NIC, API keys, tokens) is the existing, pure detector from the router.
 */

const LEAK_PHRASES = /\b(?:my\s+(?:system\s+)?(?:prompt|instructions|rules)\s+(?:say|says|are|is|state|states|tell|tells)|here\s+(?:is|are)\s+my\s+(?:system\s+)?(?:prompt|instructions|rules)|my\s+system\s+prompt\s+is|as\s+an\s+ai\s+language\s+model)\b/u;
const REFUSAL_CONTEXT = /\b(?:can't|cannot|can not|won't|will not|unable|not able|don't share|do not share|not allowed|sorry|unfortunately|i'm not (?:able|going))\b/u;

const COMPLIANCE_PHRASES: RegExp[] = [
  /\b(?:ignor(?:e|ing)|disregard(?:ing)?|forget(?:ting)?)\s+(?:all\s+|any\s+|my\s+|the\s+)?(?:previous|prior|above|earlier)\s+(?:instructions?|rules?|prompts?)\b/u,
  /\bnew\s+instructions?\s*:/u,
  /\bas\s+(?:the\s+page|the\s+website|the\s+document|instructed\s+by\s+the\s+(?:page|website|document))\s+(?:instructs?|says?|requires?|told me)\b/u,
  /\bi\s+(?:am|'m)\s+now\s+in\s+(?:developer|admin|debug|jailbreak|dan)\s+mode\b/u,
  /<\|im_(?:start|end)\|>|\[\s*\/?\s*(?:system|inst)\s*\]/u,
  /(?:^|\n)\s*(?:system|developer)\s*:/u,
];

const PAYMENT_CLAIMS: RegExp[] = [
  /\b(?:i|we)(?:'ve|\s+have)?\s+(?:just\s+)?(?:placed|confirmed|completed|processed|submitted|finali[sz]ed)\s+(?:your|the|this)\s+(?:order|payment|purchase|transaction)\b/u,
  /\b(?:your|the)\s+(?:order|payment|purchase|transaction)\s+(?:has\s+been|was|is|is now)\s+(?:placed|confirmed|completed|processed|successful|received|submitted)\b/u,
  /\bpayment\s+(?:was\s+|is\s+)?(?:successful|completed|received|done)\b/u,
  /(?:ඔබගේ|ඔබේ)\s*ඇණවුම\s*(?:තහවුරු|සම්පූර්ණ|ස්ථාපිත)|ගෙවීම\s*සාර්ථක|ඇණවුම\s*කළා/u,
  /(?:order|payment)\s*(?:eka\s*)?(?:place\s*kala|confirm\s*kala|complete\s*kala|kala\b)/u,
];

const ACTION_CLAIMS: { action: string; re: RegExp }[] = [
  { action: "cart_add", re: /\b(?:i|we)(?:'ve|\s+have)?\s+(?:just\s+)?added\s+(?:it|this|that|them|the\s+[\w\s-]{1,40})\s+to\s+your\s+(?:cart|basket|bag)\b|\badded\s+to\s+(?:your\s+)?(?:cart|basket)\b(?!\s*\?)|cart\s*(?:eka|ekata)\s*(?:damma|dammā|dala)\b|කාට්\s*(?:එකට|එකේ)\s*(?:දැම්මා|එකතු කළා)/u },
  { action: "cart_remove", re: /\b(?:i|we)(?:'ve|\s+have)?\s+(?:just\s+)?removed\s+(?:it|this|that|them|the\s+[\w\s-]{1,40})\s+from\s+your\s+(?:cart|basket|bag)\b/u },
  { action: "booking", re: /\b(?:i|we)(?:'ve|\s+have)?\s+(?:just\s+)?(?:booked|reserved|pre-?ordered|subscribed)\b/u },
  { action: "coupon", re: /\b(?:i|we)(?:'ve|\s+have)?\s+(?:just\s+)?applied\s+(?:the|a|your)\s+(?:coupon|discount|promo|voucher)\b/u },
];

/** Sri Lankan mobile/landline numbers, e-mail addresses and NIC numbers. */
const PII_PATTERNS: { kind: string; re: RegExp }[] = [
  { kind: "email", re: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/giu },
  { kind: "phone", re: /(?<![\d])(?:\+?94[\s-]?|0)(?:7\d|[1-9]\d)[\s-]?\d{3}[\s-]?\d{4}(?![\d])/gu },
  { kind: "nic", re: /(?<![\d])(?:\d{9}[vx]|\d{12})(?![\d])/giu },
];

const ORDER_ID = /(?:order\s*(?:no\.?|number|id|#)\s*[:#]?\s*|#)([a-z]{0,4}[-]?\d{4,})/giu;

const digitsOnly = (s: string): string => s.replace(/\D/g, "");

export function checkSafetyClasses(text: string, folded: string, spans: readonly SentenceSpan[], input: VerifyV2Input): Issue[] {
  const issues: Issue[] = [];

  // ---- secrets (card, OTP, password, NIC-as-secret, API key, token): existing pure detector --------------------------------------------------
  if (containsSensitive(text)) {
    // blame the sentence that holds it (each sentence is tested alone; if none alone, the whole answer)
    const sentence = spans.find((s) => containsSensitive(s.text));
    issues.push(makeIssue("secret_leak", spans, sentence?.start ?? 0, sentence?.end ?? Math.min(text.length, 1), { kind: "sensitive_pattern" }));
  }

  // ---- system prompt / instruction leakage ---------------------------------------------------------------------------------------------------
  const sq = squeeze(text);
  for (const p of input.protectedStrings ?? []) {
    const probe = squeeze(p).slice(0, 25);
    if (probe.length >= 20 && sq.includes(probe)) {
      issues.push(makeIssue("prompt_leak", spans, 0, Math.min(text.length, spans[0]?.end ?? 1), { kind: "protected_string" }));
      break;
    }
  }
  for (const s of spans) {
    const f = fold(s.text);
    if (LEAK_PHRASES.test(f) && !REFUSAL_CONTEXT.test(f)) issues.push(makeIssue("prompt_leak", spans, s.start, s.end, { kind: "leak_phrase" }));
  }

  // ---- compliance with instructions found in untrusted evidence ------------------------------------------------------------------------------
  const hostile: string[] = [];
  for (const e of input.toolEvidence) {
    if (!e.excerpt) continue;
    if (e.kind === "page_excerpt" || e.kind === "search_source" || e.kind === "product") {
      const v = checkSafety(e.excerpt);
      if (v.blocked && (v.reason === "injection" || v.reason === "exfiltration" || v.reason === "price_manipulation")) hostile.push(squeeze(e.excerpt));
    }
  }
  for (const s of spans) {
    const f = fold(s.text);
    if (COMPLIANCE_PHRASES.some((re) => re.test(f))) {
      issues.push(makeIssue("injection_compliance", spans, s.start, s.end, { kind: "phrase" }));
      continue;
    }
    if (hostile.length > 0) {
      const ss = squeeze(s.text);
      // a run of 5 consecutive words of the sentence that appears verbatim in a hostile excerpt = the answer repeats the page's instruction
      const words = ss.split(" ");
      for (let i = 0; i + 5 <= words.length; i++) {
        const probe = words.slice(i, i + 5).join(" ");
        if (hostile.some((h) => h.includes(probe))) {
          issues.push(makeIssue("injection_compliance", spans, s.start, s.end, { kind: "echo" }));
          break;
        }
      }
    }
  }

  // ---- payments, orders and other actions the assistant cannot and did not perform -----------------------------------------------------------
  for (const s of spans) {
    const f = fold(s.text);
    // "Once payment is received we ship..." describes a future condition, not a completed payment
    const claimed = PAYMENT_CLAIMS.some((re) => {
      const m = re.exec(f);
      return !!m && !/\b(?:once|when|whenever|after|if|until|before|as soon as|unless|in case)\b[^.!?]{0,40}$/u.test(f.slice(0, m.index));
    });
    if (claimed) {
      issues.push(makeIssue("payment_claim", spans, s.start, s.end));
      continue;
    }
    for (const a of ACTION_CLAIMS) {
      if (a.re.test(f) && !(input.performedActions ?? []).includes(a.action)) {
        issues.push(makeIssue("unperformed_action", spans, s.start, s.end, { action: a.action }));
        break;
      }
    }
  }

  // ---- personal data the assistant was never given -------------------------------------------------------------------------------------------
  const known = new Set<string>();
  const addKnown = (s: string): void => {
    for (const p of PII_PATTERNS) for (const m of s.matchAll(p.re)) known.add(p.kind === "email" ? m[0].toLowerCase() : digitsOnly(m[0]).toLowerCase());
  };
  addKnown(input.userMessage);
  for (const a of input.allowedPii ?? []) addKnown(a);
  for (const e of input.toolEvidence) {
    if (e.excerpt) addKnown(e.excerpt);
    if (e.productName) addKnown(e.productName);
  }
  for (const a of input.allowedPii ?? []) {
    known.add(a.toLowerCase());
    known.add(digitsOnly(a));
  }
  for (const p of PII_PATTERNS) {
    for (const m of text.matchAll(p.re)) {
      const key = p.kind === "email" ? m[0].toLowerCase() : digitsOnly(m[0]).toLowerCase();
      if (known.has(key)) continue;
      // The digits of a price (for example 0771234567 inside nothing) cannot be told apart from a phone number by shape alone; a phone number
      // is only flagged when it is not next to a currency marker.
      const before = text.slice(Math.max(0, m.index! - 6), m.index!).toLowerCase();
      if (p.kind !== "email" && /(rs\.?|lkr|රු\.?)\s*$/.test(before)) continue;
      issues.push(makeIssue("pii_exfiltration", spans, m.index!, m.index! + m[0].length, { kind: p.kind }));
    }
  }

  // ---- order data nobody supplied (cross-customer data) --------------------------------------------------------------------------------------
  const evidenceText = squeeze(input.toolEvidence.map((e) => `${e.productName ?? ""} ${e.excerpt ?? ""} ${e.tool}`).join(" "));
  for (const m of text.matchAll(ORDER_ID)) {
    const id = squeeze(m[1]!);
    if (id.length < 4) continue;
    if (squeeze(input.userMessage).includes(id) || evidenceText.includes(id)) continue;
    issues.push(makeIssue("cross_customer_data", spans, m.index!, m.index! + m[0].length, { actor: input.actor ?? "guest" }));
  }
  return issues;
}
