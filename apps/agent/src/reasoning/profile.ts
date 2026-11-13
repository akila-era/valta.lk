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
}

export const emptyReasoning = (): ReasoningState => ({ profile: { usage: [] }, asked: [], discussed: [], selected: [], lastResultIds: [], questionsInARow: 0 });

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
