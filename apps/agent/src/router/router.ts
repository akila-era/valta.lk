import { INTENT_CUES, AVAILABILITY_PHRASES, COMPATIBILITY_PHRASES, DELIVERY_CHARGE_PHRASES, EXPLICIT_STOCK_PHRASES, type CueGroup } from "./lexicon/intents";
import { anyPhrase, compilePhrase, makeHaystack, phraseMatches, type Haystack } from "./cues";
import { MAX_COMPARE_PRODUCTS } from "../contract/schemas";
import { extractEntities } from "./entities";
import { normalizeMatch } from "./normalize";
import { FRAMES } from "./lexicon/frames";
import { scopeOf } from "./scope";
import { ACK_WORDS, AMOUNT_FILLER } from "./conversation";
import { GENERIC_DEVICE, exclusionDecision, followUpDecision, isBareProduct, isBareReference, isBudgetFollowUpWord, wantsUnknownThing } from "./followups";
import { isAccountTrouble } from "./account";
import { varyFrom } from "./templates";
import type { Entities, Intent, PlannedCall, RouteContext, RouteDecision, ScoredIntent, Vocabulary } from "./types";

/** An intent needs this much weighted evidence, and a lead of at least MIN_MARGIN over the runner-up, or the router asks. */
export const MIN_SCORE = 3;
export const MIN_MARGIN = 1;

/**
 * "Fast moving", "best selling", "popular" and the like ask for a sales ranking, which the store data does not provide. The honest
 * answer says so and offers the newest products in stock, never a ranking the assistant cannot back up.
 */
const POPULARITY_PHRASES = [
  "fast moving", "fast move", "fast selling", "best seller", "best sellers", "bestseller", "bestsellers", "best selling", "top selling", "top seller", "most popular", "popular products", "popular items",
  "trending", "hot selling", "hot items", "most sold", "mostly sold", "selling fast", "wikunena", "wadiyenma wikunena", "වැඩියෙන්ම විකුණන", "වැඩියෙන්ම විකිණෙන", "ජනප්‍රිය නිෂ්පාදන", "ජනප්‍රියම",
];

/** A message that is only the store's name ("volta", "valta.lk") is a hello to the assistant: answer with who it is. */
const STORE_NAMES = new Set(["volta", "valta", "volta lk", "valta lk", "volta.lk", "valta.lk", "voltalk", "valtalk"]);

/** Asking what the assistant thinks of the product under discussion ("is this good?"). Answered with facts, never an invented opinion. */
const OPINION_PHRASES = ["any good", "is it any good", "good enough", "hondada", "honda neda", "is it good", "is this good", "is that good", "is it worth it", "worth it", "worth buying", "good one", "ඒක හොඳද", "මේක හොඳද", "හොඳද"];
const OPINION_REFERENTS = ["meka", "eka", "ekai", "this", "that", "it", "this one", "that one", "ඒක", "මේක"];
/** Greeting, "how are you" and "can you help me" phrasings, checked before the generic capabilities answer. */
const HOW_ARE_YOU = ["how are you", "how r u", "how are u", "kohomada oyata", "oyata kohomada", "oya kohomada", "kohomada oya", "kohomada", "ඔයාට කොහොමද", "ඔයා කොහොමද", "කොහොමද", "සනීපෙන්ද"];
const HELP_YES = ["udaw karanna puluwanda", "udaw karanna puluwan", "puluwanda udaw", "can you help me", "could you help me", "will you help me", "උදව් කරන්න පුළුවන්ද", "මට උදව් කරන්න"];
/** One-word "how are you" in Sinhala script: too weak as a cue inside longer messages, clear on its own. */
const SHORT_HOW_ARE_YOU = new Set(["කොහොමද", "සනීපෙන්ද", "සනීපද"]);
/** "Is Samsung good?", "what about Samsung?", "should I get Samsung": a question about a brand. */
const BRAND_OPINION_START = /^(is|are|how good is|how about|what about|should i (get|buy))\b/;
const BRAND_OPINION_WORDS = ["good", "better", "worth", "ok", "okay", "decent", "reliable", "best", "about"];
const BROWSE_PHRASES = ["monawada product", "monawada products", "monawada thiyenne", "what products", "which products", "what do you sell", "what do you have", "what items", "what can i buy", "products monawada", "මොනවද තියෙන්නේ"];

/** Category names that contain a cue word. Only exact English phrases, so no other wording changes meaning. */
const CATEGORY_NAME_PHRASES = /\b(?:computer|pc) accessor(?:y|ies)\b/g;

const STORE_ADDRESSES = /\b(?:valta\.hexalyte\.com|volta\.lk|valta\.lk)\b/gi;
const ADDRESS_LIKE = /(?:https?:\/\/|\bwww\.|\b\d{1,3}(?:\.\d{1,3}){3}\b|\blocalhost\b|\b[a-z0-9-]{2,}\.(?:com|net|org|io|dev|app|co|lk|info|xyz)\b)/i;
/** True when the message holds a web or IP address other than the store's own. */
export const hasAddressOutsideStore = (raw: string): boolean => ADDRESS_LIKE.test(raw.replace(STORE_ADDRESSES, " "));

const SCORED = Object.keys(INTENT_CUES) as ScoredIntent[];

function groupScore(h: Haystack, groups: CueGroup[]): number {
  let total = 0;
  for (const g of groups) {
    const phrases = g.p.map(compilePhrase);
    if (phrases.some((p) => p.negative && phraseMatches(h, { ...p, negative: false }))) continue; // exclusion phrase cancels the group
    // A group counts once per distinct matching phrase, but overlapping phrases ("cart ekata danna" / "cart") would double count:
    // keep it simple and bounded by counting the best single phrase plus a small bonus for a second independent match.
    const hits = phrases.filter((p) => !p.negative && phraseMatches(h, p));
    if (hits.length > 0) total += g.w + (hits.length > 1 ? 1 : 0);
  }
  return total;
}

/** Best matching co-occurrence frame for an intent: every set must match and no exclusion may (see lexicon/frames.ts). */
function frameScore(h: Haystack, intent: ScoredIntent, cartItems: number): number {
  let best = 0;
  for (const f of FRAMES[intent] ?? []) {
    if (f.w <= best) continue;
    if (f.needsCartItems && cartItems === 0) continue;
    if (f.not && f.not.some((raw) => anyPhrase(h, [raw]))) continue;
    if (f.all.every((set) => anyPhrase(h, set))) best = f.w;
  }
  return best;
}

function scoreIntents(h: Haystack, e: Entities, cartItems: number): Record<ScoredIntent, number> {
  const score = {} as Record<ScoredIntent, number>;
  for (const intent of SCORED) {
    const cues = groupScore(h, INTENT_CUES[intent]);
    const frames = frameScore(h, intent, cartItems);
    // The stronger evidence decides; two independent kinds of evidence earn a small bonus, never a sum of both.
    score[intent] = Math.max(cues, frames) + (cues > 0 && frames > 0 ? 1 : 0);
  }

  // Entity evidence supports the intents that need that entity. It never creates an intent from nothing.
  const hasProduct = e.products.length > 0;
  if (hasProduct) for (const i of ["get_product_details", "check_stock", "get_accessories", "cart_add", "cart_remove", "cart_update_quantity"] as const) if (score[i] > 0) score[i] += 1;
  if (e.products.length >= 2 && score.compare_products > 0) score.compare_products += 2;
  if (e.referent === "plural" && score.compare_products > 0) score.compare_products += 1;
  if (e.referent === "single") for (const i of ["get_product_details", "check_stock", "get_accessories", "cart_add"] as const) if (score[i] > 0) score[i] += 1;
  // "compare it with the Orbit A7 Camera Edition": a clear compare word beats a spec word that is part of a product's own name.
  if (e.products.length === 1 && e.referent === "single" && score.compare_products >= 4) score.compare_products += 2;
  // A named product turns "do you have X?" into a stock question, so brand/category evidence only counts when no product is named.
  if ((e.brand || e.categorySlug || e.queryWord) && !hasProduct && score.search_products > 0) score.search_products += 1;
  if (hasProduct && e.products.length === 1 && !e.productAmbiguous && score.check_stock > 0) score.check_stock += 1;
  if ((e.maxPriceLkr !== undefined || e.minPriceLkr !== undefined) && score.search_products > 0) score.search_products += 1;
  return score;
}

const delivered = (h: Haystack) => anyPhrase(h, ["delivery", "ඩිලිවරි", "shipping", "courier"]);

function topicOf(h: Haystack): "delivery_charge" | "other" {
  return delivered(h) && anyPhrase(h, DELIVERY_CHARGE_PHRASES) ? "delivery_charge" : "other";
}

interface Resolved {
  productIds: string[];
  variantKey?: string;
  needs: "none" | "product" | "two_products" | "variant";
  ambiguous?: boolean;
}

function matchVariant(productId: string, e: Entities, vocab: Vocabulary): string | undefined {
  const p = vocab.products.find((x) => x.id === productId);
  if (!p?.variants?.length) return undefined;
  const fits = p.variants.filter(
    (v) =>
      (e.colors.length === 0 || (v.color !== undefined && e.colors.includes(v.color.toLowerCase()))) &&
      (e.storages.length === 0 || (v.storage !== undefined && e.storages.includes(v.storage.toUpperCase()))),
  );
  if ((e.colors.length > 0 || e.storages.length > 0) && fits.length === 1) return fits[0]!.key;
  return undefined;
}

/** The product(s) the message is about: named in the text, else from the page, else the last shown, else the cart. */
function resolveProducts(e: Entities, ctx: RouteContext, want: 1 | 2): Resolved {
  if (e.productAmbiguous) return { productIds: [], needs: "product", ambiguous: true };
  const named = e.products.map((p) => p.id);
  if (want === 2) {
    if (named.length >= 2) return { productIds: named.slice(0, MAX_COMPARE_PRODUCTS), needs: "none" };
    // "the first and the last one": two positions of the last list.
    if (e.ordinals && e.ordinals.length >= 2) {
      const list = ctx.lastResultIds ?? [];
      const ids = [...new Set(e.ordinals.map((n) => (n === -1 ? list[list.length - 1] : list[n - 1])))].filter((id): id is string => id !== undefined);
      if (ids.length >= 2) return { productIds: ids.slice(0, MAX_COMPARE_PRODUCTS), needs: "none" };
    }
    if (e.referent === "plural") {
      const pool = [...new Set([...ctx.lastShownProductIds, ...ctx.cart.map((c) => c.productId)])];
      if (pool.length >= 2) return { productIds: pool.slice(0, 2), needs: "none" };
    }
    const other = ctx.contextProductId ?? (ctx.lastShownProductIds.length === 1 ? ctx.lastShownProductIds[0] : undefined);
    if (named.length === 1 && other && other !== named[0]) return { productIds: [other, named[0]!], needs: "none" };
    return { productIds: named, needs: "two_products" };
  }
  if (named.length >= 1) return { productIds: [named[0]!], needs: "none" };
  // "the second one" is a position in the last list shown; "the one I mentioned before" is the product discussed before the current one.
  if (e.ordinal !== undefined) {
    const list = ctx.lastResultIds ?? [];
    const id = e.ordinal === -1 ? list[list.length - 1] : list[e.ordinal - 1];
    return id ? { productIds: [id], needs: "none" } : { productIds: [], needs: "product" };
  }
  // "the one I mentioned first": the earliest product of the conversation (the list is newest first).
  if (e.firstMention && ctx.discussedIds && ctx.discussedIds.length > 0) return { productIds: [ctx.discussedIds[ctx.discussedIds.length - 1]!], needs: "none" };
  if (e.previous && ctx.discussedIds && ctx.discussedIds.length > 0) return { productIds: [ctx.discussedIds[1] ?? ctx.discussedIds[0]!], needs: "none" };
  if (e.referent === "single" || e.referent === undefined) {
    const fromContext = ctx.contextProductId ?? ctx.lastShownProductIds[0];
    if (fromContext && e.referent === "single") return { productIds: [fromContext], needs: "none" };
  }
  return { productIds: [], needs: "product" };
}

function cartLineFor(e: Entities, ctx: RouteContext, vocab: Vocabulary): { productId: string; variantKey: string } | undefined {
  if (e.products.length > 0) return ctx.cart.find((c) => c.productId === e.products[0]!.id) ?? { productId: e.products[0]!.id, variantKey: "" };
  // "cart එකෙන් charger එක අයින් කරන්න": find the cart line whose product name contains the concept word.
  if (e.queryWord) {
    const word = normalizeMatch(e.queryWord);
    const hits = ctx.cart.filter((c) => normalizeMatch(vocab.products.find((p) => p.id === c.productId)?.name ?? "").includes(word));
    if (hits.length === 1) return hits[0];
  }
  if (e.referent === "single" && ctx.cart.length === 1) return ctx.cart[0];
  return undefined;
}

export interface RouteInput {
  matchText: string;
  rawText: string;
  vocab: Vocabulary;
  context: RouteContext;
}

/**
 * The deterministic router for Sinhala, Singlish, mixed and (when the locale asks for it) English text. No model is involved:
 * it scores weighted cues, resolves entities against the catalogue vocabulary, and either builds validated-by-construction tool
 * calls or says what is missing. It fails closed: below the score or margin limit it abstains and asks a question.
 */
export function routeMessage(input: RouteInput): RouteDecision {
  // "computer accessories" is a category name here, not a request for accessories that fit a product: take it out of the cue text
  // (entity extraction still sees it and resolves the category), so the word "accessories" cannot score as an accessory question.
  const h = makeHaystack(input.matchText.replace(CATEGORY_NAME_PHRASES, " "));
  const e = extractEntities(input.rawText, input.vocab);
  const score = scoreIntents(h, e, input.context.cart.length);
  const popularity = anyPhrase(h, POPULARITY_PHRASES);
  if (STORE_NAMES.has(input.matchText.trim().toLowerCase().replace(/[!?.]+$/, ""))) {
    return { intent: "smalltalk", action: "static", calls: [], template: "identity", reason: "store_name", confidence: { score: 4, margin: 4 }, entities: e };
  }
  // "I forgot my password", "my password is wrong for the website": help with the site's own account recovery, never a refusal and never a request for the password.
  if (isAccountTrouble(h)) {
    return { intent: "store_info", action: "static", calls: [], template: "account_help", reason: "account_help", confidence: { score: 4, margin: 4 }, entities: e };
  }

  const ctx0 = input.context;
  const tokens = h.tokens;
  // A bare acknowledgement ("ok", "hari hari") answers the assistant; it is not a request and must not start a search.
  if (tokens.length > 0 && tokens.length <= 3 && tokens.every((t) => ACK_WORDS.has(t)) && e.amounts.length === 0 && !tokens.includes("thanks")) {
    return { intent: "smalltalk", action: "static", calls: [], template: "acknowledged", reason: "acknowledgement", confidence: { score: 4, margin: 4 }, entities: e };
  }
  // A bare amount ("200000", "rs 150000", "100000 ta adu") is the answer to "what is your budget?": it refines the previous search,
  // and with nothing to refine the assistant asks what to search for instead of listing everything under that price.
  const wordsAround = tokens.filter((t) => !/\d/.test(t));
  // Also "actually make it 60000", "I can go up to 100000" and "100000 ta adu, camera ekata": an amount with only change words or usage words around it.
  if (e.amounts.length > 0 && e.amounts[0]!.value >= 100 && tokens.length <= 9 && wordsAround.every((t) => isBudgetFollowUpWord(t, AMOUNT_FILLER)) && e.products.length === 0) {
    const slots = ctx0.slots;
    const hasSubject = ctx0.lastIntent === "search_products" && slots !== undefined && Boolean(slots.category ?? slots.brand ?? slots.query);
    const conf = { score: 4, margin: 4 };
    if (!hasSubject) return { intent: "unknown", action: "clarify", calls: [], template: "clarify_budget_what", reason: "amount_without_subject", confidence: conf, entities: e };
    const args: Record<string, unknown> = { inStockOnly: true };
    if (slots!.category) args.category = slots!.category;
    if (slots!.brand) args.brand = slots!.brand;
    if (slots!.query) args.query = slots!.query;
    const max = e.maxPriceLkr ?? (e.minPriceLkr === undefined ? e.amounts[0]!.value : undefined);
    if (max !== undefined) args.maxPriceLkr = max;
    if (e.minPriceLkr !== undefined) args.minPriceLkr = e.minPriceLkr;
    return { intent: "search_products", action: "tool", calls: [{ name: "search_products", arguments: args }], reason: "budget_follow_up", confidence: conf, entities: e };
  }
  // "What do you sell?" / "monawada products": asking what the store has. Decided before the scope guard, which would otherwise read "what do ..." as a general question.
  if (anyPhrase(h, BROWSE_PHRASES) && !e.categorySlug && !e.brand && e.products.length === 0 && !e.queryWord) {
    return { intent: "smalltalk", action: "static", calls: [], template: "browse_categories", reason: "browse_store", confidence: { score: 4, margin: 4 }, entities: e };
  }
  if (SHORT_HOW_ARE_YOU.has(input.matchText.trim())) {
    return { intent: "smalltalk", action: "static", calls: [], template: "how_are_you", reason: "how_are_you", confidence: { score: 4, margin: 4 }, entities: e };
  }
  // "Samsung hodaida?" with a category already under discussion: advice about a brand is a search for that brand inside what the shopper
  // already told us (category, budget). The reply says it cannot judge a brand; the cards and their fit codes carry the facts.
  const brandWord = e.brand ?? e.unknownTerms[0];
  const brandOpinion = anyPhrase(h, OPINION_PHRASES) || (BRAND_OPINION_START.test(input.matchText) && anyPhrase(h, BRAND_OPINION_WORDS));
  if (brandOpinion && brandWord && e.products.length === 0 && !e.referent && !e.categorySlug) {
    const slots = ctx0.slots;
    const args: Record<string, unknown> = { inStockOnly: true };
    if (e.brand) args.brand = e.brand;
    else args.query = brandWord;
    if (slots?.category) args.category = slots.category;
    if (slots?.budgetMaxLkr !== undefined) args.maxPriceLkr = slots.budgetMaxLkr;
    return { intent: "search_products", action: "tool", calls: [{ name: "search_products", arguments: args }], template: "brand_advice", reason: "brand_advice", confidence: { score: 4, margin: 4 }, entities: e };
  }
  // "Is this good?" about the product being discussed: answered with its details, never with an opinion the assistant cannot back up.
  if (anyPhrase(h, OPINION_PHRASES) && (anyPhrase(h, OPINION_REFERENTS) || e.referent === "single") && e.products.length <= 1 && !e.productAmbiguous && !e.categorySlug && !e.brand && !e.queryWord) {
    const resolved = resolveProducts(e, ctx0 as RouteContext, 1);
    const productId = resolved.productIds[0] ?? e.products[0]?.id ?? ctx0.contextProductId ?? ctx0.lastShownProductIds[0];
    const conf = { score: 4, margin: 4 };
    if (!productId) return { intent: "get_product_details", action: "clarify", calls: [], template: "clarify_product", reason: "opinion_without_product", confidence: conf, entities: e };
    return { intent: "get_product_details", action: "tool", calls: [{ name: "get_product_details", arguments: { productId } }], reason: "opinion", confidence: conf, entities: e };
  }

  // "Don't recommend Samsung", "Samsung epa": an explicit exclusion is decided BEFORE the reaction rules below, because "epa" there means "not this one".
  const exclusion = exclusionDecision(input, e);
  if (exclusion) return exclusion;

  // What the shopper means by a short reaction to what was just shown ("something cheaper", "show me more", "battery eka kohomada", "is the X good?").
  const follow = followUpDecision(input, e, h);
  if (follow) return follow;

  const ranked = [...SCORED].sort((a, b) => score[b] - score[a]);
  const top = ranked[0]!;
  const topScore = score[top];
  const margin = topScore - score[ranked[1]!];
  const confidence = { score: topScore, margin };

  const decide = (d: Omit<RouteDecision, "confidence" | "entities">): RouteDecision => ({ ...d, confidence, entities: e });

  // Scope guard: another website, or a general request with no catalogue anchor, never becomes a shopping tool call.
  const shoppingScore = Math.max(...SCORED.filter((i) => i !== "smalltalk").map((i) => score[i]));
  // A URL, a web address or an IP address in a message is never opened or searched (the Agent has no such tool): it is answered with the same
  // fixed "only this website" text as a request for another site, instead of letting the rest of the sentence start a product search.
  if (hasAddressOutsideStore(input.rawText)) return decide({ intent: "external_site", action: "static", calls: [], template: "external_site_refused", reason: "address_in_message" });
  const scope = scopeOf({ h, entities: e, shoppingScore });
  if (scope === "external_site") return decide({ intent: "external_site", action: "static", calls: [], template: "external_site_refused", reason: "external_site" });
  if (scope === "live_info") return decide({ intent: "general", action: "static", calls: [], template: "live_info_unavailable", reason: "live_info" });
  if (scope === "general") return decide({ intent: "general", action: "clarify", calls: [], template: "clarify_what", reason: "general_request" });

  if (popularity) {
    return decide({ intent: "search_products", action: "tool", calls: [{ name: "search_products", arguments: { inStockOnly: true, sort: "newest", limit: 5 } }], template: "popular_unavailable", reason: "popularity_unavailable" });
  }

  // A short message that is just a specific item, a brand or a category ("power bank", "Samsung phones", "phones", "laptop ekak") is a search for it (R0: a bare
  // category used to ask what the shopper wants; the question policy now asks the ONE useful follow-up after the first results instead). Messages about a
  // phone's number or contact details are not searches.
  const aboutNumber = anyPhrase(h, ["number", "numbers", "nambara", "contact", "අංකය", "අංක"]);
  const bareNounSearch = topScore < MIN_SCORE && h.tokens.length <= (e.amounts.length > 0 ? 8 : 4) && e.products.length === 0 && !e.productAmbiguous && !aboutNumber && Boolean(e.queryWord ?? e.brand ?? e.categorySlug ?? e.conceptWord);

  // "the second one", "mulinma kiyapu eka", "Lumen P1": a pointer or a name on its own asks about that product.
  const abstains = topScore < MIN_SCORE || margin < MIN_MARGIN;
  if ((abstains && (isBareProduct(e, h.tokens.length) || isBareReference(e, h.tokens.length))) || (top === "search_products" && isBareReference(e, h.tokens.length))) {
    const r = resolveProducts(e, input.context, 1);
    if (r.needs === "none" && r.productIds[0]) return decide({ intent: "get_product_details", action: "tool", calls: [{ name: "get_product_details", arguments: { productId: r.productIds[0] } }], reason: "details" });
  }
  // "do you have the Pixel 9", "I want a Sony camera": a name the catalogue does not know is searched for by name.
  const unknownThing = abstains && wantsUnknownThing(h, e);

  // "charger ekak oni": a search cue and an accessory cue tie, but nothing was named it should fit, so the shopper wants the item itself.
  const second = ranked[1]!;
  const accessoryTie = topScore >= MIN_SCORE && (top === "search_products" || top === "get_accessories") && (second === "search_products" || second === "get_accessories") && Boolean(e.queryWord) && e.products.length === 0 && !e.referent && !anyPhrase(h, COMPATIBILITY_PHRASES);

  if ((topScore < MIN_SCORE || margin < MIN_MARGIN) && !bareNounSearch && !accessoryTie && !unknownThing) {
    return decide({ intent: "unknown", action: "clarify", calls: [], template: "clarify_what", reason: topScore < MIN_SCORE ? "below_min_score" : "below_min_margin" });
  }

  let intent: Intent = bareNounSearch || accessoryTie || unknownThing ? "search_products" : top;
  // "phone case", "charger ekak oni": looking for the accessory itself, not asking what fits a product that was never named.
  // "a charger for my phone": a kind of device, not a named product, so there is nothing to check compatibility against: search for the item.
  if (intent === "get_accessories" && e.products.length === 0 && !e.referent && Boolean(e.queryWord) && (!anyPhrase(h, COMPATIBILITY_PHRASES) || GENERIC_DEVICE.test(input.matchText))) intent = "search_products";

  // An availability question ("is there ...?") is a search for a brand or category, but a stock check for a named product.
  const availabilityQuestion = anyPhrase(h, AVAILABILITY_PHRASES);
  const explicitStock = anyPhrase(h, EXPLICIT_STOCK_PHRASES);
  const compat = anyPhrase(h, COMPATIBILITY_PHRASES);
  if (availabilityQuestion && !explicitStock && !compat && e.products.length === 1 && !e.productAmbiguous && (intent === "search_products" || intent === "get_accessories")) intent = "check_stock";
  if (intent === "check_stock" && !explicitStock && availabilityQuestion && e.products.length === 0 && e.referent === undefined) intent = "search_products";
  // "Volt charger" names an accessory product itself; it is not a question about accessories that fit something else.
  if (intent === "get_accessories" && !compat && e.products.length === 1 && !e.productAmbiguous) {
    const named = input.vocab.products.find((p) => p.id === e.products[0]!.id);
    if (named?.category?.toLowerCase().includes("accessor")) intent = "get_product_details";
  }
  // "is the black one available?" with no brand or category is a question about the product being discussed, not a search.
  if (intent === "search_products" && availabilityQuestion && (e.colors.length > 0 || e.storages.length > 0) && !e.brand && !e.categorySlug && e.products.length === 0 && e.amounts.length === 0) intent = "check_stock";

  // "I want to buy a phone": buying a KIND of thing is a search; only a named or pointed-at product, or an explicit cart word, is a cart request.
  if (intent === "cart_add" && e.products.length === 0 && !e.referent && !e.productAmbiguous && Boolean(e.categorySlug ?? e.queryWord ?? e.brand ?? e.conceptWord) && !anyPhrase(h, ["cart", "basket", "කාට්", "කාර්ට්"])) intent = "search_products";

  const ctx = input.context;
  switch (intent) {
    case "search_products": {
      if (e.unparsedAmount) return decide({ intent, action: "clarify", calls: [], template: "clarify_budget", reason: "amount_not_understood" });
      const args: Record<string, unknown> = { inStockOnly: true };
      if (e.categorySlug) args.category = e.categorySlug;
      if (e.brand) args.brand = e.brand;
      if (e.queryWord) args.query = e.queryWord;
      else if (!e.brand && e.unknownTerms.length > 0) args.query = e.unknownTerms.join(" ");
      // "laptop" when the catalogue has no laptop category: search for the word, never show unrelated products as if they were laptops.
      if (!args.category && !args.query && e.conceptWord) args.query = e.conceptWord;
      // A refinement of the previous search ("cheapest first", "100000 ta adu") keeps what that search was about.
      const slots = ctx.slots;
      // Naming a kind of product (even one the catalogue has no category for) is a new subject, never a refinement.
      if (ctx.lastIntent === "search_products" && slots && !e.categorySlug && !e.brand && !e.queryWord && !e.conceptWord && e.unknownTerms.length === 0 && e.products.length === 0) {
        if (slots.category) args.category = slots.category;
        if (slots.brand) args.brand = slots.brand;
        if (slots.query) args.query = slots.query;
        // The budget the shopper stated earlier stays in force unless this message gives a new one.
        if (e.maxPriceLkr === undefined && e.minPriceLkr === undefined && slots.budgetMaxLkr !== undefined) args.maxPriceLkr = slots.budgetMaxLkr;
      }
      if (e.minPriceLkr !== undefined) args.minPriceLkr = e.minPriceLkr;
      if (e.maxPriceLkr !== undefined) args.maxPriceLkr = e.maxPriceLkr;
      if (e.sort) args.sort = e.sort;
      if (e.onSale) args.onSale = true;
      const specific = Object.keys(args).some((k) => k !== "inStockOnly");
      if (!specific) return decide({ intent, action: "clarify", calls: [], template: "clarify_what", reason: "search_without_constraints" });
      return decide({ intent, action: "tool", calls: [{ name: "search_products", arguments: args }], reason: "search" });
    }
    case "get_product_details": {
      const r = resolveProducts(e, ctx, 1);
      if (r.needs !== "none") return decide({ intent, action: "clarify", calls: [], template: r.ambiguous ? "clarify_ambiguous_product" : "clarify_product", reason: r.ambiguous ? "ambiguous_product" : "product_not_resolved" });
      return decide({ intent, action: "tool", calls: [{ name: "get_product_details", arguments: { productId: r.productIds[0] } }], reason: "details" });
    }
    case "compare_products": {
      const r = resolveProducts(e, ctx, 2);
      if (r.needs !== "none" || r.productIds.length < 2) return decide({ intent, action: "clarify", calls: [], template: "clarify_two_products", reason: "need_two_products" });
      return decide({ intent, action: "tool", calls: [{ name: "compare_products", arguments: { productIds: r.productIds } }], reason: "compare" });
    }
    case "check_stock": {
      const r = resolveProducts(e, ctx, 1);
      if (r.needs !== "none") return decide({ intent, action: "clarify", calls: [], template: r.ambiguous ? "clarify_ambiguous_product" : "clarify_product", reason: r.ambiguous ? "ambiguous_product" : "product_not_resolved" });
      const args: Record<string, unknown> = { productId: r.productIds[0] };
      const variant = matchVariant(r.productIds[0]!, e, input.vocab);
      if (variant) args.variantKey = variant;
      if (e.quantity) args.quantity = e.quantity;
      return decide({ intent, action: "tool", calls: [{ name: "check_stock", arguments: args }], reason: "stock" });
    }
    case "get_accessories": {
      const r = resolveProducts(e, ctx, 1);
      if (r.needs !== "none") return decide({ intent, action: "clarify", calls: [], template: r.ambiguous ? "clarify_ambiguous_product" : "clarify_accessory_for", reason: r.ambiguous ? "ambiguous_product" : "product_not_resolved" });
      return decide({ intent, action: "tool", calls: [{ name: "get_accessories", arguments: { productId: r.productIds[0] } }], reason: "accessories" });
    }
    case "cart_add": {
      const r = resolveProducts(e, ctx, 1);
      if (r.needs !== "none") return decide({ intent, action: "clarify", calls: [], template: r.ambiguous ? "clarify_ambiguous_product" : "clarify_product", reason: r.ambiguous ? "ambiguous_product" : "product_not_resolved" });
      const product = input.vocab.products.find((p) => p.id === r.productIds[0]);
      const variant = matchVariant(r.productIds[0]!, e, input.vocab);
      if ((product?.variants?.length ?? 0) > 1 && !variant) return decide({ intent, action: "clarify", calls: [], template: "clarify_variant", reason: "variant_required" });
      const args: Record<string, unknown> = { productId: r.productIds[0], quantity: e.quantity ?? 1 };
      if (variant) args.variantKey = variant;
      return decide({ intent, action: "tool", calls: [{ name: "add_to_cart", arguments: args }], reason: "cart_add" });
    }
    case "cart_remove": {
      const line = cartLineFor(e, ctx, input.vocab);
      if (!line) return decide({ intent, action: "clarify", calls: [], template: "clarify_product", reason: "cart_line_not_resolved" });
      return decide({ intent, action: "tool", calls: [{ name: "remove_from_cart", arguments: { productId: line.productId, variantKey: line.variantKey } }], reason: "cart_remove" });
    }
    case "cart_update_quantity": {
      const line = cartLineFor(e, ctx, input.vocab);
      if (!line || !e.quantity) return decide({ intent, action: "clarify", calls: [], template: line ? "clarify_product" : "clarify_product", reason: line ? "quantity_not_understood" : "cart_line_not_resolved" });
      return decide({ intent, action: "tool", calls: [{ name: "update_cart_quantity", arguments: { productId: line.productId, variantKey: line.variantKey, quantity: e.quantity } }], reason: "cart_update" });
    }
    case "cart_view":
      return decide({ intent, action: "tool", calls: [{ name: "get_cart", arguments: {} }], reason: "cart_view" });
    case "order_status": {
      const calls: PlannedCall[] = [{ name: "get_order_status", arguments: e.orderRef ? { ref: e.orderRef } : {} }];
      // Guests are never given an order lookup through the assistant; the pipeline turns this into a /track-order handoff.
      return decide({ intent, action: "tool", calls, template: "order_guest_handoff", navigate: "/track-order", reason: "order_status" });
    }
    case "order_support":
      return decide({ intent, action: "handoff", calls: [], template: "order_support_handoff", navigate: "/track-order", reason: "order_support" });
    case "checkout_handoff":
      return decide({ intent, action: "handoff", calls: [], template: "checkout_handoff", navigate: "/checkout", reason: "checkout" });
    case "store_info": {
      const topic = topicOf(h);
      if (topic === "delivery_charge") return decide({ intent, action: "tool", calls: [{ name: "get_cart", arguments: {} }], template: "tools_ran", topic, reason: "delivery_charge" });
      return decide({ intent, action: "static", calls: [], template: "store_info_other", topic, reason: "store_info_other" });
    }
    case "smalltalk": {
      const t = anyPhrase(h, ["sinhalen katha", "sinhala katha", "sinhalen puluwan", "sinhala puluwan", "speak sinhala", "sinhala support", "singlish", "සිංහලෙන් කතා", "සිංහලෙන් පුළුවන්"])
        ? "language_support"
        : anyPhrase(h, ["thanks", "thank you", "thank u", "thanx", "thx", "ස්තූතියි", "ස්තුතියි", "istuti", "sthuthi", "sthuthiyi", "stuthiyi", "stuti", "පිං"])
          ? "thanks"
          : anyPhrase(h, ["bye", "goodbye", "see you"])
            ? "goodbye"
            : anyPhrase(h, ["who are you", "ඔබ කවුද", "ඔයා කවුද", "umba kauda", "oya kauda"])
              ? "identity"
              : anyPhrase(h, BROWSE_PHRASES)
                ? "browse_categories"
                : anyPhrase(h, HELP_YES)
                  ? "help_yes"
                  : anyPhrase(h, ["what can you do", "what do you do", "how can you help", "karanna puluwan", "karann puluwn", "කරන්න පුළුවන්", "help", "help me", "can you help", "උදව්", "උදව්වක්", "උදව් කරන්න"])
                    ? "capabilities"
                    : anyPhrase(h, HOW_ARE_YOU)
                      ? "how_are_you"
                      : "greeting";
      // A second greeting or thanks in a row is worded differently (when the pipeline tells us what the last reply was), so the assistant does not repeat itself word for word.
      // R0: the wording rotates through the family (greeting, greeting_again, greeting_c), so a THIRD "hi" differs from the second as well.
      const prev = ctx.lastTemplate === "how_are_you" ? "greeting" : ctx.lastTemplate;
      const again = t === "greeting" || t === "thanks" ? varyFrom(t, prev) : t;
      return decide({ intent, action: "static", calls: [], template: again, reason: "smalltalk" });
    }
    default:
      return decide({ intent: "unknown", action: "clarify", calls: [], template: "clarify_what", reason: "unhandled" });
  }
}
