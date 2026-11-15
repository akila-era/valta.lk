import type { ConversationIntent } from "../../../src/router/conversation";
import type { ConvLang } from "../m4-conversation/types";

/**
 * R0 DEV SET types. DEV ONLY: the R0 rules were written while this set was being authored and run, so its result is NOT held-out evidence. Author-written (an
 * engineer, no native review) on the invented fixture catalogue (tests/fixtures/rich-catalogue.ts). Expectations were written from the intended behaviour.
 */
export const CAT = { phones: "mobile-phones", laptops: "laptops", accessories: "accessories" } as const;

export interface R0Expect {
  /** The first reply part is one of these fixed templates (English or Sinhala wording). */
  reply?: string[];
  /** The first reply part is none of these templates. */
  notReply?: string[];
  /** The follow-up question part (second reply part) is not one of these templates. */
  notAsk?: string[];
  /** No follow-up question part at all. */
  noAsk?: true;
  intent?: ConversationIntent;
  /** true: the reply is one of the safety refusals; false: it is not. */
  refused?: boolean;
  noCards?: true;
  minCards?: number;
  /** Every product card is in this category slug. */
  category?: string;
  maxPrice?: number;
  /** No product card has any of these brands (explicit exclusions must never be shown). */
  noBrands?: string[];
  /** Every product card has this brand. */
  onlyBrand?: string;
  /** None of these product ids is shown. */
  noIds?: string[];
  /** The first reply part differs from the previous turn's first part. */
  varies?: true;
  /** The language of the reply text itself (Sinhala script or not). */
  replyLang?: "en" | "si";
}

export interface R0Turn {
  say: string;
  locale?: "auto" | "si" | "en";
  expect?: R0Expect;
}

export interface R0Scenario {
  id: string;
  lang: ConvLang;
  /** The FIRST tag is the metric this scenario's expectations count under. */
  tags: string[];
  turns: R0Turn[];
}
