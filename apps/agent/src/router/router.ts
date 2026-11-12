import { INTENT_CUES, AVAILABILITY_PHRASES, COMPATIBILITY_PHRASES, DELIVERY_CHARGE_PHRASES, EXPLICIT_STOCK_PHRASES, type CueGroup } from "./lexicon/intents";
import { anyPhrase, compilePhrase, makeHaystack, phraseMatches, type Haystack } from "./cues";
import { MAX_COMPARE_PRODUCTS } from "../contract/schemas";
import { extractEntities } from "./entities";
import { normalizeMatch } from "./normalize";
import type { Entities, Intent, PlannedCall, RouteContext, RouteDecision, Vocabulary } from "./types";

/** An intent needs this much weighted evidence, and a lead of at least MIN_MARGIN over the runner-up, or the router asks. */
export const MIN_SCORE = 3;
export const MIN_MARGIN = 1;

/** Category names that contain a cue word. Only exact English phrases, so no other wording changes meaning. */
const CATEGORY_NAME_PHRASES = /\b(?:computer|pc) accessor(?:y|ies)\b/g;

const SCORED = Object.keys(INTENT_CUES) as Exclude<Intent, "unknown">[];

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

function scoreIntents(h: Haystack, e: Entities): Record<Exclude<Intent, "unknown">, number> {
  const score = {} as Record<Exclude<Intent, "unknown">, number>;
  for (const intent of SCORED) score[intent] = groupScore(h, INTENT_CUES[intent]);

  // Entity evidence supports the intents that need that entity. It never creates an intent from nothing.
  const hasProduct = e.products.length > 0;
  if (hasProduct) for (const i of ["get_product_details", "check_stock", "get_accessories", "cart_add", "cart_remove", "cart_update_quantity"] as const) if (score[i] > 0) score[i] += 1;
  if (e.products.length >= 2 && score.compare_products > 0) score.compare_products += 2;
  if (e.referent === "plural" && score.compare_products > 0) score.compare_products += 1;
  if (e.referent === "single") for (const i of ["get_product_details", "check_stock", "get_accessories", "cart_add"] as const) if (score[i] > 0) score[i] += 1;
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
    if (e.referent === "plural") {
      const pool = [...new Set([...ctx.lastShownProductIds, ...ctx.cart.map((c) => c.productId)])];
      if (pool.length >= 2) return { productIds: pool.slice(0, 2), needs: "none" };
    }
    if (named.length === 1 && ctx.contextProductId && ctx.contextProductId !== named[0]) return { productIds: [ctx.contextProductId, named[0]!], needs: "none" };
    return { productIds: named, needs: "two_products" };
  }
  if (named.length >= 1) return { productIds: [named[0]!], needs: "none" };
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
  const score = scoreIntents(h, e);

  const ranked = [...SCORED].sort((a, b) => score[b] - score[a]);
  const top = ranked[0]!;
  const topScore = score[top];
  const margin = topScore - score[ranked[1]!];
  const confidence = { score: topScore, margin };

  const decide = (d: Omit<RouteDecision, "confidence" | "entities">): RouteDecision => ({ ...d, confidence, entities: e });

  if (topScore < MIN_SCORE || margin < MIN_MARGIN) {
    return decide({ intent: "unknown", action: "clarify", calls: [], template: "clarify_what", reason: topScore < MIN_SCORE ? "below_min_score" : "below_min_margin" });
  }

  let intent: Intent = top;

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

  const ctx = input.context;
  switch (intent) {
    case "search_products": {
      if (e.unparsedAmount) return decide({ intent, action: "clarify", calls: [], template: "clarify_budget", reason: "amount_not_understood" });
      const args: Record<string, unknown> = { inStockOnly: true };
      if (e.categorySlug) args.category = e.categorySlug;
      if (e.brand) args.brand = e.brand;
      if (e.queryWord) args.query = e.queryWord;
      else if (!e.brand && e.unknownTerms.length > 0) args.query = e.unknownTerms.join(" ");
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
      const t = anyPhrase(h, ["thanks", "thank you", "thx", "ස්තූතියි", "ස්තුතියි", "istuti", "sthuthi", "පිං"])
        ? "thanks"
        : anyPhrase(h, ["bye", "goodbye", "see you"])
          ? "goodbye"
          : anyPhrase(h, ["who are you", "ඔබ කවුද", "ඔයා කවුද", "umba kauda", "oya kauda"])
            ? "identity"
            : anyPhrase(h, ["help", "help me", "can you help", "උදව්", "උදව්වක්", "උදව් කරන්න", "what can you do", "what do you do", "how can you help"])
              ? "capabilities"
              : "greeting";
      return decide({ intent, action: "static", calls: [], template: t, reason: "smalltalk" });
    }
    default:
      return decide({ intent: "unknown", action: "clarify", calls: [], template: "clarify_what", reason: "unhandled" });
  }
}
