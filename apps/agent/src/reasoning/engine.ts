import type { ProductView, ToolResult } from "../backend/types";
import type { Fit } from "../contract/schemas";
import type { Entities, PlannedCall } from "../router/types";
import type { ToolOutcome } from "../tools/runner";
import { brandsOf, categoryKind, nextQuestion, type CategoryKind } from "./questions";
import { mergeProfile, type Profile, type ProfileUpdate, type QuestionKey, type ReasoningState } from "./profile";
import { rankProducts, type Ranked } from "./ranking";
import { extractUsages, type Usage } from "./usage";

type SearchResult = Extract<ToolResult, { kind: "search" }>;

/** The search arguments that express what the shopper has said so far. */
export function profileSearchArgs(p: Profile): Record<string, unknown> {
  const args: Record<string, unknown> = { inStockOnly: true, limit: CANDIDATE_LIMIT };
  if (p.category) args.category = p.category;
  if (p.brand) args.brand = p.brand;
  if (p.query) args.query = p.query;
  if (p.budgetMaxLkr !== undefined) args.maxPriceLkr = p.budgetMaxLkr;
  if (p.budgetMinLkr !== undefined) args.minPriceLkr = p.budgetMinLkr;
  return args;
}

/** Folds what a search decision says (and the usages in the message) into the shopper's profile. A new topic clears the old one. */
export function updateProfileFromSearch(state: ReasoningState, args: Record<string, unknown>, usages: Usage[]): boolean {
  const update: ProfileUpdate = { usage: usages };
  if (typeof args.category === "string") update.category = args.category;
  if (typeof args.brand === "string") update.brand = args.brand;
  if (typeof args.query === "string") update.query = args.query;
  if (typeof args.maxPriceLkr === "number") update.budgetMaxLkr = args.maxPriceLkr;
  if (typeof args.minPriceLkr === "number") update.budgetMinLkr = args.minPriceLkr;
  const { profile, reset } = mergeProfile(state.profile, update);
  // Updated in place: callers hold a reference to the profile object for the whole request.
  for (const k of Object.keys(state.profile)) delete (state.profile as unknown as Record<string, unknown>)[k];
  Object.assign(state.profile, profile);
  if (reset) {
    state.asked = [];
    state.questionsInARow = 0;
  }
  return reset;
}

/**
 * A short message that answers the question the assistant just asked (a usage, a brand, or the product an accessory is for) is
 * turned into the search or lookup it means, using everything already known. Returns null when the message is not such an answer.
 */
export function answerPending(state: ReasoningState, message: string, e: Entities, lastWasSearch = false, routerReason = ""): { call: PlannedCall; usages: Usage[]; reason: string } | null {
  const pending = state.pending;
  if (!pending) {
    // No question was asked, but "camera" or "gaming" right after a search is still the shopper narrowing it.
    const usages = extractUsages(message);
    if (lastWasSearch && usages.length > 0 && message.trim().split(/\s+/).length <= 4 && (state.profile.category || state.profile.query) && !e.categorySlug && !e.conceptWord && !e.queryWord && !e.brand && e.products.length === 0 && e.amounts.length === 0) {
      return { call: { name: "search_products", arguments: profileSearchArgs(state.profile) }, usages, reason: "refine_usage" };
    }
    return null;
  }
  const words = message.trim().split(/\s+/).length;
  if (words > 6) return null;
  if (pending === "budget") {
    // The shopper answered with what they will use it for instead of an amount: take that, the budget question stays asked.
    const usages = extractUsages(message);
    if (usages.length === 0 || e.amounts.length > 0 || e.categorySlug || e.conceptWord || e.queryWord || e.brand || e.products.length > 0 || words > 4) return null;
    return { call: { name: "search_products", arguments: profileSearchArgs(state.profile) }, usages, reason: "answer_usage" };
  }
  if (pending === "usage") {
    const usages = extractUsages(message);
    if (usages.length === 0 || e.categorySlug || e.conceptWord || e.queryWord || e.brand || e.products.length > 0) return null;
    return { call: { name: "search_products", arguments: profileSearchArgs(state.profile) }, usages, reason: "answer_usage" };
  }
  if (pending === "brand") {
    // "Is Samsung good?" is a question about a brand, not just the answer: the router's brand-advice handling is kept.
    if (routerReason === "brand_advice") return null;
    const brand = e.brand;
    const word = e.unknownTerms[0];
    if (!brand && !word) return null;
    const args = profileSearchArgs({ ...state.profile, ...(brand ? { brand } : {}), ...(!brand && word ? { query: word } : {}) });
    return { call: { name: "search_products", arguments: args }, usages: [], reason: "answer_brand" };
  }
  if (pending === "device") {
    const product = e.products[0];
    if (!product || e.productAmbiguous) return null;
    return { call: { name: "get_accessories", arguments: { productId: product.id } }, usages: [], reason: "answer_device" };
  }
  return null;
}

/** How many matches are fetched to be ranked for the shopper; only the best few become cards. */
export const CANDIDATE_LIMIT = 30;

export interface ReasonedSearch {
  /** Every candidate, in the tool's order: this is what the verifier checks fit codes against. */
  outcomes: ToolOutcome[];
  /** The same outcomes with the search trimmed to the products shown, best first: cards and shown ids come from this. */
  cardOutcomes: ToolOutcome[];
  fits: Map<string, Fit>;
  candidateIds: string[];
  matches: number;
  kind: CategoryKind;
  metricsWithoutData: number;
  question: QuestionKey | null;
  usedAlternatives: boolean;
}

export const searchIndex = (outcomes: readonly ToolOutcome[]): number => outcomes.findIndex((o) => o.status === "ok" && (o.data as { kind?: string } | undefined)?.kind === "search");

/**
 * Ranks the products a search returned for this shopper, keeps the best few, and decides whether one question would help. The
 * outcome's items are replaced by the ranked, trimmed list so cards, shown ids and the verifier all see the same products.
 */
export function reasonAboutSearch(outcomes: ToolOutcome[], state: ReasoningState, opts: { hasProductContext: boolean; alternatives: boolean; explicitSort?: boolean }): ReasonedSearch | null {
  const idx = searchIndex(outcomes);
  if (idx < 0) return null;
  const outcome = outcomes[idx] as Extract<ToolOutcome, { status: "ok" }>;
  const data = outcome.data as SearchResult;
  if (data.items.length === 0) return null;

  const profile = state.profile;
  const { ranked, summary } = rankProducts(data.items, profile);
  const kind = categoryKind(data.items[0]!.category?.name, profile.query);
  // A question only makes sense when the shopper named what they are after (a category or a word), never for a bare browse or a popularity request.
  const hasSubject = Boolean(profile.category || profile.query);
  // "Cheapest", "most expensive", "newest": the shopper chose the order, so it is kept and no question is asked.
  const question = opts.alternatives || opts.explicitSort || !hasSubject ? null : nextQuestion(state, profile, { kind, matches: data.total, brandsInResults: brandsOf(data.items), hasProductContext: opts.hasProductContext });
  const personal = profile.usage.length > 0 || profile.budgetMaxLkr !== undefined || profile.budgetMinLkr !== undefined || Boolean(profile.brand);
  const show = personal || question ? 3 : 5;
  // Fit codes are expressed against ALL candidates ("best camera of everything that matched"); the best few become cards.
  const byId = new Map(ranked.map((r) => [r.product.id, r]));
  const order = opts.explicitSort ? data.items.map((p) => byId.get(p.id)!) : ranked;
  const top: Ranked[] = order.slice(0, show);

  const trimmed = [...outcomes];
  trimmed[idx] = { ...outcome, data: { ...data, items: top.map((r) => r.product) } satisfies SearchResult };
  return {
    outcomes,
    cardOutcomes: trimmed,
    fits: new Map(top.map((r) => [r.product.id, r.fit])),
    candidateIds: data.items.map((p) => p.id),
    matches: data.total,
    kind,
    metricsWithoutData: summary.metricsWithoutData.length,
    question,
    usedAlternatives: opts.alternatives,
  };
}

/** Fit codes for a single product against what the shopper said (budget, brand, usage), for "is it worth it?" style questions. */
export function fitFor(product: ProductView, profile: Profile): Fit | null {
  const personal = profile.usage.length > 0 || profile.budgetMaxLkr !== undefined || Boolean(profile.brand);
  if (!personal) return null;
  return rankProducts([product], profile).ranked[0]!.fit;
}

const ACCESSORY_NAME = /\b(case|cover|charger|cable|protector|tempered|glass|adapter|adaptor|power bank|earbuds?|headphones?|strap|stand|holder)\b/i;

/** True for a product that is an accessory by its category or its name: a search for "phones" by name must not return a phone case. */
export const looksLikeAccessory = (p: ProductView): boolean => /accessor/i.test(p.category?.name ?? "") || ACCESSORY_NAME.test(p.name);
