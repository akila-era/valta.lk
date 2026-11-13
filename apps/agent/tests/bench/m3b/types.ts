import type { Intent } from "../../../src/router/types";

/**
 * M3-B datasets: fresh messages for Sinhala script, Singlish, English and mixed Sinhala-English.
 *
 * HOW THESE WERE MADE (and their limits, to be repeated by anyone quoting a number):
 *  - Written for M3-B by the AI engineering assistant, from everyday shopping phrasing, WITHOUT opening the router's cue lists and
 *    without copying the earlier sets (SET_A/B/C, the M3-A set). The author is still the same project: this is fresher, not blind.
 *  - Two files with different jobs. DEV is used to find gaps and tune. TEST is FROZEN: it is run once for the baseline before any
 *    change and once after, and its failures are not used to write rules. A TEST failure that is looked at to fix a rule makes that
 *    case development data, and the report must say so.
 *  - NOT native-reviewed and NOT independent. Sinhala wording is plain and provisional. A review pack is generated from these files
 *    (see docs/AI_M3B_NATIVE_REVIEW_PACK.md). No quality claim may be made until native speakers have reviewed labels and wording.
 *  - Mock vocabulary only (invented brands). Small: about 30 per language group per file.
 */
export type Group = "si" | "singlish" | "en" | "mixed";

/** What the message should be treated as. The last four are scope labels, not shopping intents. */
export type Want =
  | Intent
  /** Store policy question (warranty, returns, shipping policy): the router's store_info is acceptable until M3-D adds an index. */
  | "website_policy"
  /** Asks to use another website or a search engine. Must be refused politely, never turned into a shopping tool. */
  | "external_site"
  /** General knowledge, writing, coding or explanation request unrelated to a catalogue lookup. */
  | "general"
  /** Too vague to act on: the right behaviour is to ask a question. */
  | "ambiguous";

export type Style = "plain" | "typo" | "colloquial" | "paraphrase" | "long" | "short" | "negative";

export interface M3BCase {
  id: string;
  group: Group;
  text: string;
  want: Want;
  style: Style;
  entities?: { maxPriceLkr?: number; sort?: "price-asc" | "price-desc" | "newest"; referent?: boolean; quantity?: number; topic?: "delivery_charge" | "other" };
}

let n = 0;
export const mk =
  (prefix: string, group: Group) =>
  (text: string, want: Want, style: Style = "plain", entities?: M3BCase["entities"]): M3BCase => ({ id: `${prefix}-${group}-${String(++n).padStart(3, "0")}`, group, text, want, style, ...(entities ? { entities } : {}) });
