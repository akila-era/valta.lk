import { USAGE_TOKENS } from "../reasoning/usage";
import { anyPhrase, type Haystack } from "./cues";
import type { Entities, RouteContext, RouteDecision, Vocabulary } from "./types";

/**
 * Follow-up rules (M8): what a shopper means when they react to what was just shown, in their own short words. "Cheaper", "show me more", "meka epa",
 * "battery eka kohomada", "is the X good?", a changed budget. Every rule only builds a tool call from the shopper's words and the products ALREADY shown
 * or discussed; it never produces a fact. PROVISIONAL like every lexicon here: engineer-written, not native-reviewed.
 *
 * The rules run before the cue scoring, because their messages are short and full of words that score as something else ("kohomada" is "how are you",
 * "cheaper" is a search word). Each one is narrow: it needs the context it refers to (a shown product, a search subject) and fails closed to `null`.
 */
const CONF = { score: 4, margin: 4 };

/** Words around an amount that still make the message a budget answer or change: "actually make it 60000", "I can go up to 100000", "naa 60000 ta adu karanna". */
export const BUDGET_CHANGE_FILLER = new Set([
  "actually", "make", "it", "can", "go", "up", "to", "i", "we", "spend", "change", "set", "now", "instead", "then", "naa", "na", "nope", "no", "karanna", "ganna", "wenas", "my", "is", "maximum", "the",
  "do", "lets", "let", "s", "say", "only", "just", "please", "pls", "hmm", "well", "hari", "ow", "wage", "wagema", "dan", "mage", "oni", "ona", "eka", "ekak",
  // R0: "set the price filter to 50000", "change the price range to 40000 to 60000", "not above 100000": an instruction about the price limit itself
  "price", "filter", "range", "limit", "not", "above", "over", "than", "more", "no", "never", "exceed", "ceiling", "cap",
]);

/** A word of a budget follow-up that is not an amount: a filler, or a usage word ("100000 ta adu, camera ekata"). */
export const isBudgetFollowUpWord = (t: string, amountFiller: ReadonlySet<string>): boolean => amountFiller.has(t) || BUDGET_CHANGE_FILLER.has(t) || USAGE_TOKENS.has(t);

const WANTS_OTHERS = [
  "show me another", "another one", "another phone", "another laptop", "something else", "other options", "other ones", "other phones", "other laptops", "show me more", "more options", "more like these", "more like this", "show more", "anything else", "what else", "any other",
  "wena ekak", "wena ewa", "wenama ekak", "wena ewa pennanna", "thawa pennanna", "thawath pennanna", "thawa ekak pennanna", "thawa tikak", "anith eka", "meka epa", "mekata epa", "mewa epa", "epa",
  "i don t like", "i dont like", "do not like", "dont like", "not this one", "not these", "not that one", "i do not want this", "not that", "not this", "no not that",
  "වෙන එකක්", "වෙන ඒවා", "තව පෙන්නන්න", "තවත් පෙන්නන්න", "තව ටිකක්", "තව ඒවා", "මේක එපා", "එපා",
];
const CHEAPER = ["cheaper", "less expensive", "lower price", "poddak adu", "poddak wada adu", "wada adu", "adu ekak", "adu mila", "cheaper ekak", "ලාභ එකක්", "වඩා ලාභ", "මීට වඩා ලාභ", "poddak ලාභ"];
const PRICIER = ["more expensive", "pricier", "higher price", "wada mila", "mila wadi ekak", "වඩා මිල වැඩි", "ඉහළ මිලක්"];
/** Words that make "sort by price" an instruction about the order of the results. */
const SORT_INSTRUCTION = ["sort", "sorted", "sorting", "order by", "arrange", "sort karanna", "sort eka"];
const SPEC_WORDS = ["battery", "camera", "ram", "storage", "processor", "display", "screen", "memory", "warranty", "weight", "බැටරි", "බැටරිය", "කැමරා", "කැමරාව", "මතකය"];
const QUESTION_WORDS = ["kohomada", "how is", "how s", "how good", "hondada", "honda neda", "kiyada", "kiyanawada", "mokakda", "what is", "what s", "whats", "thiyenne", "කොහොමද", "කීයද", "මොකක්ද", "හොඳද"];
/** The only question word that is ALSO "how are you" (so "battery eka kohomada" without a product must not become a greeting). "mokakda" is not here: "RAM kiyanne mokakda" is a general question. */
const SINGLISH_QUESTION_WORDS = ["kohomada", "කොහොමද"];
const OPINION_START = /^(is|are|does|do|should|would|can|will)\b/;
const OPINION_WORDS = ["good", "worth", "worth it", "decent", "okay", "reliable", "fast", "smooth", "enough", "suitable", "hondada", "honda neda", "හොඳද"];
/** "for my phone", "mage phone ekata": a kind of device, not a product that was named. */
export const GENERIC_DEVICE = /\b(?:my|mage|oyage|a|the)\s+(?:phone|mobile|laptop|tablet|device)s?\b|\b(?:phone|mobile|laptop|tablet)\s+(?:ekata|ekakata|walata|eke)\b/;

/** An answer that gives no preference for the question just asked ("no budget", "any", "not sure", "budget ekak nane"). */
export const NO_PREFERENCE = [
  "no budget", "dont have a budget", "don t have a budget", "do not have a budget", "no limit", "no preference", "doesn t matter", "doesnt matter", "does not matter", "any budget", "any brand", "anything is fine", "anything", "whatever", "not sure", "dont know", "don t know", "no idea", "idk", "skip",
  "budget ekak nane", "budget ekak nehe", "budget ekak naha", "budget nane", "budget nehe", "budget naha", "kisima ekak", "kamak naha", "kamak nane", "mokak hari", "ඕනෙම එකක්", "මොකක් හරි", "බජට් එකක් නෑ", "බජට් නෑ", "වැඩක් නෑ",
];

const slotsSubject = (ctx: RouteContext) => ctx.lastIntent === "search_products" && ctx.slots !== undefined && Boolean(ctx.slots.category ?? ctx.slots.brand ?? ctx.slots.query);

function categorySlugOf(vocab: Vocabulary, productId: string | undefined): string | undefined {
  const name = vocab.products.find((p) => p.id === productId)?.category;
  return name === undefined ? undefined : vocab.categories.find((c) => c.name === name)?.slug;
}

/** What the search is about: the shopper's own words in this message, else the subject of the last search, else the kind of the product just shown. */
function searchBase(e: Entities, ctx: RouteContext, vocab: Vocabulary, refId: string | undefined, keepBrand: boolean): Record<string, unknown> | null {
  const args: Record<string, unknown> = { inStockOnly: true };
  if (e.categorySlug) args.category = e.categorySlug;
  if (e.brand) args.brand = e.brand;
  if (e.queryWord) args.query = e.queryWord;
  if (args.category || args.brand || args.query) return args;
  if (slotsSubject(ctx)) {
    const s = ctx.slots!;
    if (s.category) args.category = s.category;
    if (s.query) args.query = s.query;
    if (keepBrand && s.brand) args.brand = s.brand;
    if (!args.category && !args.query && !args.brand) return null;
    return args;
  }
  const slug = categorySlugOf(vocab, refId);
  if (slug) {
    args.category = slug;
    return args;
  }
  return null;
}

const priceBounds = (e: Entities, args: Record<string, unknown>, ctx: RouteContext): void => {
  if (e.minPriceLkr !== undefined) args.minPriceLkr = e.minPriceLkr;
  if (e.maxPriceLkr !== undefined) args.maxPriceLkr = e.maxPriceLkr;
  else if (slotsSubject(ctx) && ctx.slots!.budgetMaxLkr !== undefined) args.maxPriceLkr = ctx.slots!.budgetMaxLkr;
};

/** The one product "it" / "this" can mean right now: the only one shown last, or the page's product. */
export const currentProduct = (ctx: RouteContext): string | undefined => (ctx.lastShownProductIds.length === 1 ? ctx.lastShownProductIds[0] : undefined) ?? ctx.contextProductId;

/** A decision from a follow-up rule, or null when none applies. */
export function followUpDecision(input: { matchText: string; vocab: Vocabulary; context: RouteContext }, e: Entities, h: Haystack): RouteDecision | null {
  const ctx = input.context;
  const tokens = h.tokens;
  if (tokens.length === 0 || tokens.length > 12) return null;
  const noSubjectWords = !e.categorySlug && !e.brand && !e.queryWord && e.products.length === 0 && !e.productAmbiguous;
  const decide = (d: Omit<RouteDecision, "confidence" | "entities">): RouteDecision => ({ ...d, confidence: CONF, entities: e });
  const shown = ctx.lastShownProductIds;

  // "Something cheaper" / "a bit more expensive": relative to the product on top of what was just shown (resolved from the catalogue by the tool).
  const cheaper = anyPhrase(h, CHEAPER);
  const pricier = anyPhrase(h, PRICIER);
  if ((cheaper || pricier) && !e.sort && e.amounts.length === 0 && e.products.length === 0 && shown.length > 0) {
    const args = searchBase(e, ctx, input.vocab, shown[0], false);
    if (args) {
      if (slotsSubject(ctx) && ctx.slots!.budgetMaxLkr !== undefined && cheaper) args.maxPriceLkr = ctx.slots!.budgetMaxLkr;
      if (cheaper) args.cheaperThanId = shown[0];
      else args.pricierThanId = shown[0];
      return decide({ intent: "search_products", action: "tool", calls: [{ name: "search_products", arguments: args }], reason: "relative_price" });
    }
  }

  // "Show me more", "something else", "meka epa": the same kind of thing, without what was just shown.
  if (anyPhrase(h, WANTS_OTHERS) && noSubjectWords !== undefined && e.products.length === 0 && shown.length > 0 && e.amounts.length === 0) {
    const args = searchBase(e, ctx, input.vocab, shown[0], true);
    if (args) {
      priceBounds(e, args, ctx);
      args.excludeIds = shown.slice(0, 12);
      return decide({ intent: "search_products", action: "tool", calls: [{ name: "search_products", arguments: args }], reason: "other_results" });
    }
  }

  // "sort by price", "change the sort to price": an instruction about the ORDER of what is being looked at, applied to the last search.
  if (e.sort && anyPhrase(h, SORT_INSTRUCTION) && e.products.length === 0 && e.amounts.length === 0 && noSubjectWords && slotsSubject(ctx)) {
    const args = searchBase(e, ctx, input.vocab, shown[0], true);
    if (args) {
      priceBounds(e, args, ctx);
      args.sort = e.sort;
      return decide({ intent: "search_products", action: "tool", calls: [{ name: "search_products", arguments: args }], reason: "sort_instruction" });
    }
  }

  // "battery eka kohomada" / "how is the camera" about the product in front of the shopper: its details, never a greeting or a guess. With no product in front of
  // the shopper the answer is to ask which product, not to say "I'm doing well" (R0: "kohomada" is also the everyday "how is it").
  if (noSubjectWords && e.amounts.length === 0 && !e.sort && tokens.length <= 6 && anyPhrase(h, SPEC_WORDS) && anyPhrase(h, QUESTION_WORDS)) {
    const id = currentProduct(ctx);
    if (id) return decide({ intent: "get_product_details", action: "tool", calls: [{ name: "get_product_details", arguments: { productId: id } }], reason: "spec_question" });
    // Only the Singlish/Sinhala question words collide with "how are you"; an English "what is an OLED screen" is a general question and is left to the scope guard.
    if (anyPhrase(h, SINGLISH_QUESTION_WORDS)) return decide({ intent: "get_product_details", action: "clarify", calls: [], template: "clarify_product", reason: "spec_question_no_product" });
  }

  // "Is the Lumen P2 Pro good for gaming?" about a named product: its details (the reply states that it cannot judge), never an invented opinion.
  if (e.products.length === 1 && !e.productAmbiguous && OPINION_START.test(input.matchText.trim()) && anyPhrase(h, OPINION_WORDS) && !anyPhrase(h, ["compare", "vs", "versus", "cheaper", "stock", "available"])) {
    return decide({ intent: "get_product_details", action: "tool", calls: [{ name: "get_product_details", arguments: { productId: e.products[0]!.id } }], reason: "opinion" });
  }
  return null;
}

/**
 * "Don't recommend Samsung", "no chargers", "Samsung epa" with nothing positive to search for: the shopper is leaving something out. With a search already under
 * way (or products just shown) that search is repeated without it; otherwise the exclusion is noted and the shopper is asked what they are looking for. The
 * exclusion itself is kept by the pipeline for the whole conversation and applied to every later search (reasoning/exclusions.ts); this only decides the reply.
 * A message that also names what to search for ("laptops but no Samsung") is routed normally.
 */
export function exclusionDecision(input: { vocab: Vocabulary; context: RouteContext }, e: Entities): RouteDecision | null {
  if (!e.exclusions) return null;
  if (e.categorySlug || e.brand || e.queryWord || e.conceptWord || e.products.length > 0 || e.productAmbiguous || e.unknownTerms.length > 0) return null;
  const ctx = input.context;
  const decide = (d: Omit<RouteDecision, "confidence" | "entities">): RouteDecision => ({ ...d, confidence: CONF, entities: e });
  const args = slotsSubject(ctx) || ctx.lastShownProductIds.length > 0 ? searchBase(e, ctx, input.vocab, ctx.lastShownProductIds[0], true) : null;
  // The search being repeated must not be a search FOR the thing that was just excluded ("Nova laptops", then "don't show Nova": the laptops that are left).
  if (args) {
    const ex = e.exclusions;
    if (typeof args.brand === "string" && ex.brands.includes(args.brand.toLowerCase())) delete args.brand;
    if (typeof args.category === "string" && ex.categories.includes(args.category.toLowerCase())) delete args.category;
    if (typeof args.query === "string" && ex.words.includes(args.query.toLowerCase())) delete args.query;
  }
  if (!args || (args.brand === undefined && args.category === undefined && args.query === undefined)) return decide({ intent: "search_products", action: "static", calls: [], template: "exclusion_noted", reason: "exclusion_noted" });
  priceBounds(e, args, ctx);
  return decide({ intent: "search_products", action: "tool", calls: [{ name: "search_products", arguments: args }], reason: "exclusion_applied" });
}

/** A message that is only a position or a pointer ("the second one", "mulinma kiyapu eka"): it means that product's details. */
export function isBareReference(e: Entities, tokenCount: number): boolean {
  return tokenCount <= 6 && e.amounts.length === 0 && !e.categorySlug && !e.brand && !e.queryWord && e.products.length === 0 && (e.ordinal !== undefined || e.previous === true || e.firstMention === true);
}

/** A message that is only a product's name ("Lumen P1"): that product's details. */
export function isBareProduct(e: Entities, tokenCount: number): boolean {
  return tokenCount <= 5 && e.products.length === 1 && !e.productAmbiguous && e.amounts.length === 0 && !e.sort && !e.onSale;
}

/** "Do you have the Pixel 9", "I want a Sony camera": a thing the catalogue does not know, searched for by name so the shopper hears "none" and sees alternatives. */
export function wantsUnknownThing(h: Haystack, e: Entities): boolean {
  return e.unknownTerms.length > 0 && e.products.length === 0 && !e.productAmbiguous && !e.brand && anyPhrase(h, ["do you have", "have you got", "i want", "i need", "looking for", "i am looking", "need", "thiyenawada", "thiyanawada", "tiyenawada", "oni", "ona", "ganna", "තියෙනවද"]);
}
