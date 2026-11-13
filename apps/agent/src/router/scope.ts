import { anyPhrase, type Haystack } from "./cues";
import type { Entities } from "./types";

/**
 * Scope guard (M3-B). Decides, before any shopping intent is scored, whether a message is
 *  - a request to use ANOTHER website or a search engine ("external_site"): refused politely, never turned into a shopping tool; or
 *  - a general knowledge, writing, coding or explanation request with no catalogue anchor ("general"): kept away from the shopping
 *    tools (a later phase gives it a proper answer lane).
 * Both are decided from word families in three scripts (Sinhala, Singlish, English), not from whole sentences. A message that names a
 * product, brand, category or amount, or that carries a strong shopping cue, stays a shopping message.
 */
const EXTERNAL_SITES = [
  "google", "bing", "yahoo", "duckduckgo", "amazon", "ebay", "aliexpress", "alibaba", "daraz", "ikman", "facebook", "instagram",
  "youtube", "tiktok", "wikipedia", "reddit", "chatgpt", "openai",
  "ගූගල්", "ගූගල් එක", "ඩරාස්", "අමේසන්", "ඇමසන්", "ඊබේ", "යූටියුබ්", "ෆේස්බුක්", "විකිපීඩියා",
];
const EXTERNAL_GENERIC = [
  "another website", "other website", "another site", "other site", "another store", "other store", "another shop", "other shop",
  "different website", "different site", "other online", "other online stores", "competitor", "competitors", "other websites", "other sites",
  "wena website", "wena site", "wenath website", "wena shop", "wena kadeda", "wena kade", "wenath site",
  "වෙනත් වෙබ්", "වෙනත් අඩවි", "වෙන වෙබ්", "වෙන website", "වෙන අඩවි", "වෙනත් සාප්පු", "වෙන සාප්පු", "වෙනත් කඩ", "වෙන කඩ", "වෙනත් site", "වෙන site", "වෙන කඩයක",
];
/** Products named like a site ("Google Pixel") are products, not a request to visit the site. */
const SITE_NAME_PRODUCTS = ["pixel", "nest", "chromecast", "echo", "fire", "kindle", "alexa", "ගූගල් පික්සල්"];

const GENERAL_STRONG = [
  "explain", "explanation", "write", "draft", "compose", "translate", "summarize", "summarise", "proofread", "rewrite", "paraphrase",
  "poem", "story", "essay", "joke", "riddle", "cover letter", "professional email", "an email", "a letter", "speech", "caption", "slogan",
  "python", "javascript", "java", "typescript", "sql", "algorithm", "database", "debug", "source code", "programming", "coding",
  "teach me", "how does", "why does", "why is the", "why do", "history of", "capital of", "recipe", "meaning of", "define",
  "liyanna", "liyala", "liyla", "explain karanna", "udaw karanna liyanna", "prashnaya", "wisadunna", "pahadili", "pahadili karanna",
  "පැහැදිලි කරන්න", "පැහැදිලි කරලා", "පැහැදිලි කර", "ලියන්න", "ලියලා", "ලියා දෙන්න", "ලියා", "පරිවර්තනය", "කවියක්", "කතාවක්", "විහිළුවක්",
  "වැඩ කරන්නේ කොහොමද", "වැඩ කරන්නේ කෙසේද", "සුභ පැතුම්", "ජාවා", "පයිතන්", "ඇයි කියලා",
  "wish ekak", "birthday wish", "email ekak", "letter ekak", "cover letter ekak",
];
const GENERAL_WEAK = ["what is", "what are", "what does", "what s", "what do", "how to", "why", "who is", "who was", "when did", "where is the", "kiyanne mokakda", "kiyanne monawada", "කියන්නේ මොකක්ද", "කියන්නේ මොනවාද", "ඇයි", "aiy"];

export type ScopeVerdict = "external_site" | "general" | null;

export interface ScopeInput {
  h: Haystack;
  entities: Entities;
  /** Highest cue score among shopping, order and store intents (small talk excluded). */
  shoppingScore: number;
}

/** True when the message names a catalogue anchor: a product, brand, category, search word, amount, or "this/that one". */
export function hasCatalogueAnchor(e: Entities): boolean {
  return e.products.length > 0 || Boolean(e.brand) || Boolean(e.categorySlug) || Boolean(e.queryWord) || Boolean(e.referent) || e.amounts.length > 0 || e.colors.length > 0 || e.storages.length > 0;
}

export function scopeOf({ h, entities, shoppingScore }: ScopeInput): ScopeVerdict {
  const namesSite = anyPhrase(h, EXTERNAL_SITES);
  const generic = anyPhrase(h, EXTERNAL_GENERIC);
  if ((namesSite || generic) && !(namesSite && anyPhrase(h, SITE_NAME_PRODUCTS)) && !entities.brand && entities.products.length === 0) return "external_site";

  const anchored = hasCatalogueAnchor(entities);
  if (!anchored && anyPhrase(h, GENERAL_STRONG) && shoppingScore < 4) return "general";
  if (!anchored && anyPhrase(h, GENERAL_WEAK) && shoppingScore < 3) return "general";
  return null;
}
