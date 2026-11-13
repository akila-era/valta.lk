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
  "unknown",
] as const;
export type Intent = (typeof INTENTS)[number];

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
  brand?: string;
  products: ProductMatch[];
  productAmbiguous: boolean;
  /** "this one", "these", "both". */
  referent?: "single" | "plural";
  orderRef?: string;
  sort?: "price-asc" | "price-desc" | "newest";
  onSale?: boolean;
  /** Latin words that look like a brand or model but are not in the vocabulary (for example "samsung"). */
  unknownTerms: string[];
}

export interface RouteContext {
  /** From the page the shopper is on. An untrusted hint, validated by the backend. */
  contextProductId?: string;
  lastShownProductIds: string[];
  cart: { productId: string; variantKey: string; quantity: number }[];
}

export interface PlannedCall {
  name: string;
  arguments: Record<string, unknown>;
}

export type TemplateKey =
  | "greeting"
  | "thanks"
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
  | "no_accessories"
  | "cart_proposed"
  | "cart_unavailable"
  | "cart_not_in_cart"
  | "order_none"
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
