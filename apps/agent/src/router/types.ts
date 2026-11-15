import type { Language } from "../contract/schemas";

/** Everything the deterministic router can decide. "unknown" means: ask, never guess. */
export const INTENTS = [
  "search_products",
  "get_product_details",
  "compare_products",
  "check_stock",
  "get_accessories",
  "cart_add",
  "cart_remove",
  "cart_update_quantity",
  "cart_view",
  "order_status",
  "order_support",
  "checkout_handoff",
  "store_info",
  "smalltalk",
  /** Asks the assistant to use another website or a search engine. Refused politely; never turned into a shopping tool. */
  "external_site",
  /** General knowledge, writing, coding or explanation request with no catalogue anchor. Handled outside the shopping tools. */
  "general",
  "unknown",
] as const;
export type Intent = (typeof INTENTS)[number];

/** Intents that are scored from cue phrases. `external_site` and `general` are decided by the scope guard (scope.ts), `unknown` is the abstention. */
export type ScoredIntent = Exclude<Intent, "unknown" | "external_site" | "general">;

/** si = Sinhala script, si-latin = Singlish (Sinhala in Latin letters), mixed = Sinhala script plus Latin words. */
export type Script = "si" | "si-latin" | "mixed" | "en";

export interface LanguageInfo {
  script: Script;
  /** The language label sent to the website. Singlish and mixed text are both reported as "mixed". */
  language: Language;
  /** Sinhala-script, mixed and Singlish text is ALWAYS routed by the deterministic router, never by Qwen. */
  path: "sinhala" | "english";
  reason: string;
}

export interface VocabVariant {
  key: string;
  storage?: string;
  color?: string;
}
export interface VocabProduct {
  id: string;
  name: string;
  brand?: string;
  model?: string;
  /** Category NAME as the catalogue spells it. */
  category?: string;
  variants?: VocabVariant[];
}
/** Public catalogue vocabulary (no prices, stock or customer data). Mock data in M1. */
export interface Vocabulary {
  brands: string[];
  categories: { slug: string; name: string }[];
  products: VocabProduct[];
}

export interface AmountInfo {
  value: number;
  role: "max" | "min" | "around" | "unknown";
  raw: string;
}

export interface ProductMatch {
  id: string;
  name: string;
  score: number;
}

export interface Entities {
  amounts: AmountInfo[];
  minPriceLkr?: number;
  maxPriceLkr?: number;
  /** A budget cue was present but no amount could be read: the router must ask. */
  unparsedAmount?: boolean;
  quantity?: number;
  colors: string[];
  storages: string[];
  /** Catalogue category slug resolved from a concept word such as "phone". */
  categorySlug?: string;
  /** The specific thing asked for (for example "charger"), used as the search text. */
  queryWord?: string;
  /** The kind of product named ("phone", "laptop"), as a search word, even when the catalogue has no category for it. */
  conceptWord?: string;
  brand?: string;
  products: ProductMatch[];
  productAmbiguous: boolean;
  /** "this one", "these", "both". */
  referent?: "single" | "plural";
  /** "the second one": 1-based position in the last result list, or -1 for "the last one". */
  ordinal?: number;
  /** "the one I mentioned before": the product discussed before the current one. */
  previous?: boolean;
  /** Every position named ("the first and the last one" is [1, -1]); `ordinal` is the first of them. */
  ordinals?: number[];
  /** "the one I mentioned first": the earliest product of the conversation. */
  firstMention?: boolean;
  orderRef?: string;
  sort?: "price-asc" | "price-desc" | "newest";
  onSale?: boolean;
  /** Latin words that look like a brand or model but are not in the vocabulary (for example "samsung"). */
  unknownTerms: string[];
  /**
   * Things the shopper said they do NOT want ("don't recommend Samsung", "no chargers", "Lumen P1 epa"). They are never reported as the positive
   * brand, category or product above. Absent when the message excludes nothing.
   */
  exclusions?: { brands: string[]; categories: string[]; words: string[]; productIds: string[] };
}

export interface RouteContext {
  /** From the page the shopper is on. An untrusted hint, validated by the backend. */
  contextProductId?: string;
  lastShownProductIds: string[];
  /** The last result list in display order ("the second one"), and products discussed, newest first ("the one I mentioned before"). */
  lastResultIds?: string[];
  discussedIds?: string[];
  cart: { productId: string; variantKey: string; quantity: number }[];
  /** What the previous turn was, and what the last search was about, so a follow-up such as "100000 ta adu" refines it. */
  lastIntent?: string;
  /** The fixed reply the previous turn ended with (a template key). Lets the router word a second greeting or thanks differently; absent = unknown. */
  lastTemplate?: string;
  slots?: { brand?: string; category?: string; query?: string; budgetMaxLkr?: number };
}

export interface PlannedCall {
  name: string;
  arguments: Record<string, unknown>;
}

export type TemplateKey =
  | "greeting"
  | "greeting_again"
  | "recommend_intro"
  | "recommend_intro_b"
  | "recommend_intro_c"
  | "recommend_limited_data"
  | "no_match_alternatives"
  | "brand_advice"
  | "ask_budget"
  | "ask_usage_phone"
  | "ask_usage_laptop"
  | "ask_brand"
  | "ask_device"
  | "how_are_you"
  | "acknowledged"
  | "help_yes"
  | "browse_categories"
  | "clarify_budget_what"
  | "opinion_facts"
  | "thanks"
  | "thanks_again"
  | "goodbye"
  | "identity"
  | "capabilities"
  | "clarify_what"
  | "verification_failed"
  | "clarify_product"
  | "clarify_two_products"
  | "clarify_budget"
  | "clarify_accessory_for"
  | "clarify_variant"
  | "clarify_ambiguous_product"
  | "refuse_injection"
  | "refuse_price"
  | "refuse_exfil"
  | "refuse_sensitive"
  | "order_guest_handoff"
  | "checkout_handoff"
  | "order_support_handoff"
  | "store_info_other"
  | "tools_ran"
  | "tool_failed"
  | "no_results"
  | "popular_unavailable"
  | "language_support"
  // R0: account help, corrections, exclusions, conversation preferences and extra wording variants
  | "account_help"
  | "correction_ask"
  | "correction_ask_b"
  | "correction_search"
  | "correction_search_b"
  | "exclusion_noted"
  | "exclusion_applied"
  | "no_results_excluded"
  | "pref_lang_si"
  | "pref_lang_en"
  | "pref_short"
  | "pref_no_questions"
  | "pref_no_budget"
  | "greeting_c"
  | "thanks_c"
  | "tools_ran_b"
  | "tools_ran_c"
  | "clarify_what_b"
  | "no_match_alternatives_b"
  | "no_results_b"
  | "no_accessories"
  | "cart_proposed"
  | "cart_unavailable"
  | "cart_not_in_cart"
  | "order_none"
  | "external_site_refused"
  | "live_info_unavailable"
  | "busy_degraded";

export type RouteAction = "tool" | "clarify" | "static" | "handoff";

export interface RouteDecision {
  intent: Intent;
  /** Sum of the weights of the matched cues for the winning intent, and its lead over the runner-up. */
  confidence: { score: number; margin: number };
  entities: Entities;
  action: RouteAction;
  calls: PlannedCall[];
  /** Which template answers when no tool is needed or the plan needs more information. */
  template?: TemplateKey;
  /** Why the router chose a clarification or abstained, for tests and observability (no user text). */
  reason: string;
  topic?: "delivery_charge" | "other";
  /** Set for handoffs to a page. */
  navigate?: "/checkout" | "/track-order";
}
