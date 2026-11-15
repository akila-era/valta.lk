import { normalizeMatch, tokenize } from "./normalize";
import type { RouteDecision } from "./types";

/**
 * The conversation-level intent of a message, derived from the router's decision. It is NOT a second router: the router decides, and this
 * names the decision in the vocabulary of the conversation layer (greeting, general conversation, shopping search, ...). `store_service`
 * covers the store questions outside that list (orders, checkout, delivery) so every decision maps to exactly one value.
 */
export const CONVERSATION_INTENTS = [
  "greeting",
  "general_conversation",
  "general_knowledge",
  "shopping_search",
  "product_comparison",
  "stock_check",
  "price_inquiry",
  "accessory_compatibility",
  "cart_query",
  "clarification",
  "unknown",
  "store_service",
] as const;
export type ConversationIntent = (typeof CONVERSATION_INTENTS)[number];

/** Conversational fillers: a message made only of these is a reply to the assistant ("ok", "hari hari"), not a request. */
export const ACK_WORDS = new Set(["ok", "okay", "okey", "k", "kk", "hari", "ow", "owu", "aha", "ahh", "hmm", "hm", "sure", "cool", "nice", "great", "super", "fine", "alright", "right", "yes", "yeah", "yep", "yup", "hondai", "sathutui", "wow", "thanks", "ela"]);
/** Words that may sit around a bare amount: "200000", "rs 200000", "100000 ta adu", "under 150000". Anything else makes it a different request. */
export const AMOUNT_FILLER = new Set(["rs", "rupees", "lkr", "k", "ta", "walata", "adu", "wadi", "under", "below", "budget", "within", "upto", "up", "to", "around", "about", "thula", "tharam", "ekata", "ok", "eka", "limit", "max", "min", "me", "mata"]);

/**
 * True for a message that carries no language of its own: only fillers, digits and amount words. Such a message ("ok", "200000") keeps
 * the language the conversation was already in instead of switching it.
 */
export function isNeutralMessage(message: string): boolean {
  const tokens = tokenize(normalizeMatch(message));
  return tokens.length > 0 && tokens.every((t) => /\d/.test(t) || ACK_WORDS.has(t) || AMOUNT_FILLER.has(t));
}

const GREETING_TEMPLATES = new Set(["greeting", "greeting_again", "greeting_c", "how_are_you"]);
const CONVERSATION_TEMPLATES = new Set(["thanks", "thanks_again", "thanks_c", "goodbye", "identity", "capabilities", "help_yes", "acknowledged", "language_support", "identity", "pref_lang_si", "pref_lang_en", "pref_short", "pref_no_questions", "pref_no_budget"]);

/** Names the router's decision for the conversation layer. `message` is only used to tell a price question from other product questions. */
export function conversationIntent(d: Pick<RouteDecision, "intent" | "action" | "template" | "reason">, message: string): ConversationIntent {
  const priceWords = /(?:price|cost|how much|kiyada|kiyak|kochchara|mila|මිල|කීයද|කීයක්|කොච්චර)/i;
  switch (d.intent) {
    case "smalltalk":
      if (d.template && GREETING_TEMPLATES.has(d.template)) return "greeting";
      if (d.template === "browse_categories") return "clarification";
      return d.template && CONVERSATION_TEMPLATES.has(d.template) ? "general_conversation" : "greeting";
    case "general":
      return "general_knowledge";
    case "external_site":
      return "unknown";
    case "search_products":
      return "shopping_search";
    case "get_product_details":
      if (d.reason === "opinion" || d.reason === "opinion_without_product") return "general_conversation";
      return priceWords.test(normalizeMatch(message)) || priceWords.test(message) ? "price_inquiry" : "shopping_search";
    case "compare_products":
      return "product_comparison";
    case "check_stock":
      return "stock_check";
    case "get_accessories":
      return "accessory_compatibility";
    case "cart_add":
    case "cart_remove":
    case "cart_update_quantity":
    case "cart_view":
      return "cart_query";
    case "order_status":
    case "order_support":
    case "checkout_handoff":
    case "store_info":
      return "store_service";
    default:
      return d.action === "clarify" && d.template && d.template !== "clarify_what" ? "clarification" : "unknown";
  }
}
