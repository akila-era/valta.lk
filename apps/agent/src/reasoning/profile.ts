import type { Usage } from "./usage";

/** What the shopper has told us about the thing they want, built up over the conversation. Everything here comes from their own words. */
export interface Profile {
  /** Category slug. */
  category?: string;
  brand?: string;
  /** A free search word such as "power bank", or a brand the catalogue does not carry. */
  query?: string;
  budgetMaxLkr?: number;
  budgetMinLkr?: number;
  usage: Usage[];
}

export type QuestionKey = "budget" | "usage" | "brand" | "device";

/** Short-term shopping memory (in memory only, like the rest of the session). Ids and codes, never message text. */
export interface ReasoningState {
  profile: Profile;
  /** Questions already put to the shopper in this topic; none is asked twice. */
  asked: QuestionKey[];
  /** The question the shopper's next short message most likely answers. */
  pending?: QuestionKey;
  /** Products talked about, newest first (resolves "that one", "the one I mentioned before"). */
  discussed: string[];
  /** Products the shopper chose to add to the cart (proposals), newest first. */
  selected: string[];
  /** The last result list in the order it was shown (resolves "the second one"). */
  lastResultIds: string[];
  /** Consecutive replies that ended with a question: capped so the assistant never interrogates. */
  questionsInARow: number;
  /** Replies given so far, for wording variants (`pickVariant` in router/templates.ts). Optional: the pipeline increments it once it is wired. */
  replies?: number;
  /** The key of the template the previous reply ended with. Lets `varyFrom` (router/templates.ts) word a repeated reply differently. */
  lastTemplate?: string;
  /**
   * What the shopper explicitly does NOT want ("don't recommend Samsung", "no chargers"). Unlike the profile it is NOT cleared when the topic changes: it
   * stays until the shopper asks for that thing again. Ids, brand words and category slugs only, never message text.
   */
  exclusions: Exclusions;
  /** Conversation preferences the shopper asked for ("reply in Sinhala", "keep it short", "stop asking questions"). This conversation only, in memory. */
  prefs: ConversationPrefs;
  /** The state as it was BEFORE the previous turn, so "that's not what I asked" can drop that turn's interpretation. Never holds message text. */
  undo?: UndoSnapshot;
}

export interface Exclusions {
  /** Brand words, lower-case. */
  brands: string[];
  /** Catalogue category slugs. */
  categories: string[];
  /** Kinds of product named by a word that is not a category ("charger", "case"), lower-case. */
  words: string[];
  productIds: string[];
}

export interface ConversationPrefs {
  replyLang?: "en" | "si";
  /** Short answers: no follow-up question is appended. */
  short?: boolean;
  /** No follow-up questions at all. */
  noQuestions?: boolean;
  /** Everything except the budget question may still be asked. */
  noBudgetQuestion?: boolean;
}

/** What a correction restores: the profile and question bookkeeping, the lists used to resolve "the second one", and the session's last search subject. */
export interface UndoSnapshot {
  profile: Profile;
  asked: QuestionKey[];
  questionsInARow: number;
  lastResultIds: string[];
  discussed: string[];
  pending?: QuestionKey;
  lastIntent?: string;
  slots: { brand?: string; category?: string; budgetLkr?: number; query?: string };
  lastShownProductIds: string[];
}

export const emptyExclusions = (): Exclusions => ({ brands: [], categories: [], words: [], productIds: [] });

export const emptyReasoning = (): ReasoningState => ({ profile: { usage: [] }, asked: [], discussed: [], selected: [], lastResultIds: [], questionsInARow: 0, exclusions: emptyExclusions(), prefs: {} });

export interface ProfileUpdate {
  category?: string;
  brand?: string;
  query?: string;
  budgetMaxLkr?: number;
  budgetMinLkr?: number;
  usage?: Usage[];
}

/** A new category or a new search word starts a new topic: the old budget, brand and usage must not leak into it. */
export function isNewTopic(prev: Profile, update: ProfileUpdate): boolean {
  const newCategory = update.category !== undefined && prev.category !== undefined && update.category !== prev.category;
  const newQuery = update.query !== undefined && prev.query !== undefined && update.query !== prev.query;
  const queryAppears = update.query !== undefined && prev.query === undefined && prev.category !== undefined && update.category === undefined;
  return newCategory || newQuery || queryAppears;
}

export function mergeProfile(prev: Profile, update: ProfileUpdate): { profile: Profile; reset: boolean } {
  const reset = isNewTopic(prev, update);
  const base: Profile = reset ? { usage: [] } : { ...prev, usage: [...prev.usage] };
  if (update.category !== undefined) base.category = update.category;
  if (update.brand !== undefined) base.brand = update.brand;
  if (update.query !== undefined) base.query = update.query;
  if (update.budgetMaxLkr !== undefined) base.budgetMaxLkr = update.budgetMaxLkr;
  if (update.budgetMinLkr !== undefined) base.budgetMinLkr = update.budgetMinLkr;
  for (const u of update.usage ?? []) if (!base.usage.includes(u)) base.usage.push(u);
  return { profile: base, reset };
}
