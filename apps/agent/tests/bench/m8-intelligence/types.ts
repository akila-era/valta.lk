import type { Expect as BaseExpect, Scenario as BaseScenario, Turn as BaseTurn } from "../m5-reasoning/types";
import type { QuestionKey } from "../../../src/reasoning/profile";

/**
 * M8 scenarios (DEV ONLY, tuned on). The M5 expectation vocabulary plus checks for things a customer notices: "cheaper" really is cheaper than what was
 * shown, a rejected product is not offered again, "more" does not repeat, a question is never asked twice, consecutive replies do not repeat.
 */
export interface Expect extends BaseExpect {
  /** Every product card costs less than the top card of the previous turn. */
  cheaperThanPrevTop?: true;
  /** The top card of the previous turn is not shown again. */
  excludesPrevTop?: true;
  /** None of the cards of the previous turn is shown again. */
  excludesPrevShown?: true;
  /** The assistant must not end this reply with this question again. */
  askNot?: QuestionKey;
  /** The first reply sentence differs from the previous turn's. */
  variesFromPrevious?: true;
}
export interface Turn extends Omit<BaseTurn, "expect"> {
  expect?: Expect;
}
export interface Scenario extends Omit<BaseScenario, "turns"> {
  turns: Turn[];
}
export { CAT } from "../m5-reasoning/types";
