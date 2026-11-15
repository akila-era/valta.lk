/**
 * Verifier v2: public types. Everything in `src/verify/v2` is pure and deterministic (no model, no network, no clock, no I/O) and has no
 * dependency on the production pipeline, so the turn loop can import it without any wiring change to the existing verifier.
 *
 * What it checks: FREE-FORM model-written answer text, claim by claim, against the tool evidence of THIS turn. Structured cards and actions
 * keep being verified by `verify/verifier.ts`; this module never replaces those checks.
 */

export type Language = "en" | "si" | "singlish" | "mixed";

export type SpecField = "ram" | "storage" | "battery" | "camera" | "display" | "refresh_rate" | "charging" | "processor";
export type SpecUnit = "gb" | "tb" | "mah" | "mp" | "inch" | "hz" | "w" | "text";

/** One specification row of a store product. Numeric facts carry a unit (`tb` is converted to GB when compared); processors are text. */
export interface SpecFact {
  field: SpecField;
  value?: number;
  unit?: SpecUnit;
  text?: string;
}

export type EvidenceKind = "product" | "stock" | "price" | "spec" | "calculation" | "search_source" | "page_excerpt" | "site_info";

/**
 * One piece of evidence the SERVER obtained this turn (never text the model wrote). A product's price, stock and specs may travel in one
 * `product` evidence or in separate `price` / `stock` / `spec` evidences that share the same `productId`.
 */
export interface ToolEvidence {
  tool: string;
  kind: EvidenceKind;
  productId?: string;
  productName?: string;
  /** Other names the shop uses for the same product (model number, short name). */
  aliases?: string[];
  brand?: string;
  category?: string;
  /** Product page URL (an allowed link in the answer). */
  url?: string;
  /** Currency of the prices below. Defaults to LKR. */
  currency?: string;
  /** List price in minor units (cents). */
  priceMinor?: number;
  /** Offer / effective price in minor units, when different from the list price. */
  effectivePriceMinor?: number;
  stock?: { status: "in_stock" | "low_stock" | "out_of_stock" | "unknown"; quantity?: number };
  specs?: SpecFact[];
  /** Calculator output (major units, e.g. 360 for "15% of 2400"). */
  calculation?: { result: number; expression?: string; unit?: string };
  /** For `search_source`: a page the server fetched this turn. */
  source?: { url: string; title?: string; fetchedAt?: string };
  /** For `page_excerpt` / `search_source`: fetched text. ALWAYS untrusted data, never instructions. */
  excerpt?: string;
  /** For `site_info`: the shop's OWN public website text (store details, policy pages). Amounts written in it may be repeated; it is not a product price. */
  siteText?: string;
}

export interface HonorificPolicy {
  /** The customer's stated preference (or the account's title). "none" means unknown: no gendered title may be used. Never inferred from a name. */
  preference: "none" | "sir" | "madam";
  /** At most this many titles in one reply. Default 1. */
  maxPerReply?: number;
}

export interface VerifyV2Policy {
  honorific?: HonorificPolicy;
  /** Length cap in characters. Default 1200 (the contract maximum is 2000). */
  maxChars?: number;
  /** When a search ran and the answer uses its content, a citation is required. Default true. */
  requireCitationsWhenSearched?: boolean;
  /** Hosts that may be linked without having been fetched this turn (the shop's own site). Default ["valta.hexalyte.com"]. */
  allowedLinkHosts?: string[];
}

export interface Exclusions {
  brands?: string[];
  products?: string[];
  categories?: string[];
}

export interface VerifyV2Input {
  answerText: string;
  /** The language the reply is expected to be in. */
  language: Language;
  toolEvidence: readonly ToolEvidence[];
  /** URLs the model said it cites (optional: URLs in the text are extracted anyway). */
  citations?: readonly string[];
  /** Pages the server fetched this turn. Only these may be cited. */
  sourcesFetchedThisTurn: readonly { url: string; title?: string }[];
  /** True only when a search tool actually ran this turn. */
  searchPerformed: boolean;
  /** What the customer asked to see (for example "where did you get that?"). */
  requestedDisclosure?: { sources?: boolean };
  policy?: VerifyV2Policy;
  /** The customer's own message. Amounts and personal data the customer wrote may be echoed. */
  userMessage: string;
  exclusions?: Exclusions;
  /** The previous assistant reply of this conversation (repetition check). */
  previousAssistantReply?: string;
  /** Strings that must never appear in an answer (for example the system prompt). */
  protectedStrings?: readonly string[];
  /** Personal data this customer is entitled to see echoed (their own phone or e-mail from their account). */
  allowedPii?: readonly string[];
  /** Actions the SERVER really performed this turn (for example "cart_add"). The assistant itself performs none by default. */
  performedActions?: readonly string[];
  /** Guests never receive order data. */
  actor?: "guest" | "customer";
}

export type Severity = "info" | "warn" | "error" | "critical";
export type IssueCategory = "grounding" | "citation" | "safety" | "quality" | "format";

export type IssueCode =
  // grounding
  | "ungrounded_price"
  | "claim_price_mismatch"
  | "claim_stock_mismatch"
  | "claim_spec_mismatch"
  | "claim_calculation_mismatch"
  | "claim_ungrounded"
  | "excluded_item_recommended"
  // citations
  | "fabricated_source"
  | "unsourced_link"
  | "citation_invalid"
  | "citation_missing"
  | "citation_unsupported"
  | "search_claimed_without_search"
  // safety
  | "secret_leak"
  | "prompt_leak"
  | "pii_exfiltration"
  | "injection_compliance"
  | "payment_claim"
  | "unperformed_action"
  | "cross_customer_data"
  // quality
  | "unprompted_honorific"
  | "excess_honorific"
  | "repetitive_honorific"
  | "repeated_reply"
  | "language_mismatch"
  | "unexpected_script"
  | "empty_answer"
  // format
  | "text_too_long"
  | "active_markup";

export interface Issue {
  code: IssueCode;
  severity: Severity;
  category: IssueCategory;
  /** Character span in `answerText`. */
  start: number;
  end: number;
  sentenceIndex: number;
  /** The offending sentence (for the repair loop only; never for logs). */
  sentence: string;
  /** Small machine-readable facts (numbers, field names). Never message text. */
  detail?: Record<string, string | number | boolean>;
}

export type Verdict = "pass" | "repairable" | "fail";

export type NoticeKey = "could_not_verify";

export type Repair =
  /** Ask the model again with a server-written feedback message that names the problems and lists the verified facts. */
  | { kind: "regenerate"; feedback: string; codes: IssueCode[] }
  /** Deterministic, meaning-preserving fixes (titles, markup, unsourced links, length). The result must be verified again. */
  | { kind: "autofix"; text: string; applied: string[] }
  /** The answer with only the failing sentences (and sentences left dangling by them) removed. May be empty. */
  | { kind: "redact"; text: string; removedSentences: number[] }
  /** An honest system message: used only when nothing usable remains. Never a shopping fallback. */
  | { kind: "notice"; text: string; key: NoticeKey; language: Language; needsNativeReview: boolean };

export interface VerifyV2Result {
  ok: boolean;
  verdict: Verdict;
  issues: Issue[];
  repairs: Repair[];
  /** `answerText` after sentence-level removal (set when the verdict is not "pass"). */
  redactedText?: string;
  /** Length of the analysed answer and whether it was cut for analysis (inputs above 20,000 characters). */
  analysed: { chars: number; truncated: boolean; sentences: number };
}

export interface SentenceSpan {
  index: number;
  start: number;
  end: number;
  text: string;
}

export const ISSUE_SEVERITY: Record<IssueCode, Severity> = {
  ungrounded_price: "error",
  claim_price_mismatch: "error",
  claim_stock_mismatch: "error",
  claim_spec_mismatch: "error",
  claim_calculation_mismatch: "error",
  claim_ungrounded: "error",
  excluded_item_recommended: "error",
  fabricated_source: "critical",
  unsourced_link: "error",
  citation_invalid: "error",
  citation_missing: "error",
  citation_unsupported: "warn",
  search_claimed_without_search: "error",
  secret_leak: "critical",
  prompt_leak: "critical",
  pii_exfiltration: "critical",
  injection_compliance: "critical",
  payment_claim: "critical",
  unperformed_action: "error",
  cross_customer_data: "critical",
  unprompted_honorific: "error",
  excess_honorific: "error",
  repetitive_honorific: "error",
  repeated_reply: "error",
  language_mismatch: "warn",
  unexpected_script: "error",
  empty_answer: "error",
  text_too_long: "error",
  active_markup: "error",
};

export const ISSUE_CATEGORY: Record<IssueCode, IssueCategory> = {
  ungrounded_price: "grounding",
  claim_price_mismatch: "grounding",
  claim_stock_mismatch: "grounding",
  claim_spec_mismatch: "grounding",
  claim_calculation_mismatch: "grounding",
  claim_ungrounded: "grounding",
  excluded_item_recommended: "grounding",
  fabricated_source: "citation",
  unsourced_link: "citation",
  citation_invalid: "citation",
  citation_missing: "citation",
  citation_unsupported: "citation",
  search_claimed_without_search: "citation",
  secret_leak: "safety",
  prompt_leak: "safety",
  pii_exfiltration: "safety",
  injection_compliance: "safety",
  payment_claim: "safety",
  unperformed_action: "safety",
  cross_customer_data: "safety",
  unprompted_honorific: "quality",
  excess_honorific: "quality",
  repetitive_honorific: "quality",
  repeated_reply: "quality",
  language_mismatch: "quality",
  unexpected_script: "quality",
  empty_answer: "quality",
  text_too_long: "format",
  active_markup: "format",
};
