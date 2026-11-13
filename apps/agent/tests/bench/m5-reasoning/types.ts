import type { ConversationIntent } from "../../../src/router/conversation";
import type { FitReason, FitTradeoff } from "../../../src/contract/schemas";
import type { QuestionKey } from "../../../src/reasoning/profile";
import type { Usage } from "../../../src/reasoning/usage";
import type { TemplateKey } from "../../../src/router/types";
import type { ConvLang } from "../m4-conversation/types";

/**
 * Multi-turn customer scenarios (M5) on the TEST fixture catalogue (tests/fixtures/rich-catalogue.ts, invented items, not VOLTA data).
 * Author-written, not native-reviewed. Each turn lists only what that turn must show; everything else is unchecked for that turn.
 * Expectations were derived from the fixture and the intended behaviour, not by running the system.
 */
export const CAT = { phones: "mobile-phones", laptops: "laptops", accessories: "accessories" } as const;

export interface Expect {
  /** Conversation intent decided for this message. */
  intent?: ConversationIntent;
  /** Exactly these tools ran this turn (use [] for none). */
  tools?: string[];
  noCards?: true;
  minCards?: number;
  /** Every product card is in this category slug. */
  category?: string;
  /** Every product card is priced at or below this (LKR). */
  maxPrice?: number;
  /** Every product card has this brand. */
  brand?: string;
  /** Reply starts with this fixed template. */
  template?: TemplateKey;
  /** The first product card is this id, or one of these. */
  topId?: string;
  topAmong?: string[];
  containsIds?: string[];
  excludesIds?: string[];
  /** The assistant ended its reply with this question / with no question. */
  ask?: QuestionKey;
  noAsk?: true;
  /** What the assistant must remember after this turn. */
  profile?: { category?: string; brand?: string; budgetMax?: number; usage?: Usage[]; noBudget?: true };
  /** The single product card is the Nth card (1-based) shown in the previous turn. */
  refersIndex?: number;
  /** The single product card is this id. */
  refers?: string;
  /** A cart.add proposal for the Nth card of the previous turn. */
  cartAddIndex?: number;
  /** The first card carries these fit reasons / tradeoffs. */
  fitHas?: FitReason[];
  /** Fit tradeoffs expected on a specific product card shown this turn. */
  fitOf?: { id: string; tradeoffs?: FitTradeoff[]; reasons?: FitReason[] };
  /** A comparison card with this many products. */
  comparison?: number;
}

export interface Turn {
  say: string;
  expect?: Expect;
  locale?: "auto" | "si" | "en";
  /** Set before this turn is sent. */
  setup?: "erp_down";
}

export interface Scenario {
  id: string;
  lang: ConvLang;
  tags: string[];
  turns: Turn[];
}
