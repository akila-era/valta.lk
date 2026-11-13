import type { ProductView } from "../backend/types";
import type { Profile, QuestionKey, ReasoningState } from "./profile";

export type CategoryKind = "phone" | "laptop" | "accessory" | "other";

const has = (s: string | undefined, re: RegExp) => s !== undefined && re.test(s.toLowerCase());

/** What kind of purchase this is, from the catalogue's own category name and the shopper's search word. */
export function categoryKind(categoryName: string | undefined, query: string | undefined): CategoryKind {
  if (has(query, /charger|cable|case|cover|protector|glass|power bank|adapter|adaptor|earbud|headphone/)) return "accessory";
  if (has(categoryName, /accessor/)) return "accessory";
  if (has(categoryName, /phone|mobile/)) return "phone";
  if (has(categoryName, /laptop|notebook/)) return "laptop";
  return "other";
}

/** At or below this many matches the shopper just sees them: a question would only delay the answer. */
export const ASK_ONLY_ABOVE_MATCHES = 3;
const MAX_QUESTIONS_IN_A_ROW = 2;

export interface QuestionContext {
  kind: CategoryKind;
  matches: number;
  brandsInResults: number;
  /** The shopper already named a product (for example on its page), so a compatible-device question would be pointless. */
  hasProductContext: boolean;
}

/**
 * The single question whose answer would most improve the recommendation, or null. It asks only what has not been said and not been
 * asked, only when there are enough matches for the answer to matter, one question at a time, and never more than two replies in a row.
 */
export function nextQuestion(state: ReasoningState, p: Profile, c: QuestionContext): QuestionKey | null {
  if (state.questionsInARow >= MAX_QUESTIONS_IN_A_ROW) return null;
  if (c.matches <= ASK_ONLY_ABOVE_MATCHES) return null;
  const fresh = (k: QuestionKey) => !state.asked.includes(k);
  if (c.kind === "phone" || c.kind === "laptop") {
    if (p.budgetMaxLkr === undefined && p.budgetMinLkr === undefined && fresh("budget")) return "budget";
    if (p.usage.length === 0 && fresh("usage")) return "usage";
    if (c.kind === "phone" && !p.brand && c.brandsInResults >= 3 && fresh("brand")) return "brand";
    return null;
  }
  if (c.kind === "accessory" && !c.hasProductContext && fresh("device")) return "device";
  return null;
}

export const brandsOf = (items: readonly ProductView[]): number => new Set(items.map((i) => (i.brand ?? "").toLowerCase()).filter(Boolean)).size;
