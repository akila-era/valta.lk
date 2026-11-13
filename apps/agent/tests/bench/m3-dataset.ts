import type { Intent } from "../../src/router/types";
import { itemId } from "../fixtures/mock-vocab";

/**
 * M3-A benchmark dataset: Sinhala script, Singlish, English and mixed-language messages, with the intent each one should get.
 *
 * HONESTY NOTES (read before quoting any number from this set):
 *  - Written by the AI engineering assistant in one session, NOT by native speakers and NOT independently reviewed.
 *    `REVIEW_STATUS` says so and every consumer must print it. Sinhala wording is plain and provisional.
 *  - Written after the existing router sets, without copying them, but by the same project: it is not a blind test of the router.
 *  - Mock vocabulary only (invented brands such as Nova and Orbit). It says nothing about the real catalogue.
 *  - The three NEW categories (general, website_policy, external_site) are things the current router was never built to handle. They
 *    are included on purpose, to measure the gap: for them a correct router answer is to abstain or hand over, never to run a shopping tool.
 *  - Small (about 25 per group): good for spotting gaps and regressions, too small for confidence intervals.
 */
export const REVIEW_STATUS = "developer-authored, not native-reviewed, not independent" as const;

export type BenchIntent = Intent | "general" | "website_policy" | "external_site";
export type Group = "si" | "singlish" | "en" | "mixed";

export interface BenchCase {
  group: Group;
  text: string;
  want: BenchIntent;
  /** Optional entity expectations (only these fields are checked). */
  entities?: { maxPriceLkr?: number; sort?: "price-asc" | "price-desc" | "newest"; productIds?: string[]; referent?: boolean; topic?: "delivery_charge" | "other" };
}

const NOVA = itemId(1);
const ORBIT = itemId(2);
const c = (group: Group, text: string, want: BenchIntent, entities?: BenchCase["entities"]): BenchCase => ({ group, text, want, ...(entities ? { entities } : {}) });

export const BENCH_CASES: readonly BenchCase[] = Object.freeze([
  // ---- Sinhala script
  c("si", "මට හොඳම ෆෝන් එකක් හොයලා දෙන්න", "search_products"),
  c("si", "රුපියල් ලක්ෂයකට අඩු ෆෝන් පෙන්වන්න", "search_products", { maxPriceLkr: 100000 }),
  c("si", "ලාභම ෆෝන් එක මොකක්ද?", "search_products", { sort: "price-asc" }),
  c("si", "ටැබ්ලට් එකක් පෙන්වන්න", "search_products"),
  c("si", "මේ ෆෝන් එකේ විස්තර කියන්න", "get_product_details", { referent: true }),
  c("si", "මම කලින් බැලූ ෆෝන් එකේ විස්තර කියන්න", "get_product_details", { referent: true }),
  c("si", "මේ දෙකෙන් බැටරිය හොඳ මොකක්ද?", "compare_products", { referent: true }),
  c("si", "මේක තොගේ තියෙනවද?", "check_stock", { referent: true }),
  c("si", "මේකට ගැළපෙන චාජර් එකක් තියෙනවද?", "get_accessories"),
  c("si", "මේක කරත්තයට දාන්න", "cart_add", { referent: true }),
  c("si", "කරත්තයෙන් මේක ඉවත් කරන්න", "cart_remove"),
  c("si", "මගේ ඇණවුම කොහෙද?", "order_status"),
  c("si", "ඇණවුම ට්‍රැක් කරන්නේ කොහොමද?", "order_status"),
  c("si", "ඇණවුම අවලංගු කරන්න ඕන", "order_support"),
  c("si", "ගෙවීම කරන්න ඕන", "checkout_handoff"),
  c("si", "බෙදාහැරීමේ ගාස්තුව කීයද?", "store_info", { topic: "delivery_charge" }),
  c("si", "වගකීම් ප්‍රතිපත්තිය මොකක්ද?", "website_policy"),
  c("si", "ආපසු දීමේ ප්‍රතිපත්තිය කියන්න", "website_policy"),
  c("si", "ආයුබෝවන්", "smalltalk"),
  c("si", "ස්තූතියි", "smalltalk"),
  c("si", "පරිගණකයක ප්‍රොසෙසරය වැඩ කරන්නේ කොහොමද?", "general"),
  c("si", "මට ව්‍යාපාරික ඊමේල් එකක් ලියලා දෙන්න", "general"),
  c("si", "ගූගල් එකට ගිහින් මේ ෆෝන් එක සොයන්න", "external_site"),
  c("si", "වෙනත් වෙබ් අඩවියක මිල බලන්න", "external_site"),

  // ---- Singlish (Sinhala in English letters)
  c("singlish", "mata hodama phone ekak hoyala denna", "search_products"),
  c("singlish", "rupiyal lakshayakata adu phone pennanna", "search_products", { maxPriceLkr: 100000 }),
  c("singlish", "laabama phone eka monawada?", "search_products", { sort: "price-asc" }),
  c("singlish", "tablet ekak pennanna", "search_products"),
  c("singlish", "mama kalin balapu phone eke details kiyanna", "get_product_details", { referent: true }),
  c("singlish", "me phone eke specs mokakda?", "get_product_details", { referent: true }),
  c("singlish", "mata kalin balapu laptop eka compare karala denna", "compare_products"),
  c("singlish", "me deken battery eka hondama monawada?", "compare_products", { referent: true }),
  c("singlish", "meka stock eke thiyenawada?", "check_stock", { referent: true }),
  c("singlish", "meka ekata hari charger ekak thiyenawada?", "get_accessories"),
  c("singlish", "meka cart ekata danna", "cart_add", { referent: true }),
  c("singlish", "cart eken charger eka ain karanna", "cart_remove"),
  c("singlish", "mage order eka koheda?", "order_status"),
  c("singlish", "order eka track karanne kohomada?", "order_status"),
  c("singlish", "order eka cancel karanna one", "order_support"),
  c("singlish", "mata gewanna one", "checkout_handoff"),
  c("singlish", "delivery charge eka kiyada?", "store_info", { topic: "delivery_charge" }),
  c("singlish", "warranty policy eka mokakda?", "website_policy"),
  c("singlish", "return policy eka kiyanna", "website_policy"),
  c("singlish", "hello", "smalltalk"),
  c("singlish", "bohoma sthuthi", "smalltalk"),
  c("singlish", "RAM eken karanne mokakda kiyala explain karanna", "general"),
  c("singlish", "mata professional email ekak liyala denna", "general"),
  c("singlish", "google eka open karala me phone eka search karanna", "external_site"),

  // ---- English
  c("en", "Can you recommend a laptop for programming?", "search_products"),
  c("en", "Show me phones under 100000 rupees", "search_products", { maxPriceLkr: 100000 }),
  c("en", "What is your cheapest phone?", "search_products", { sort: "price-asc" }),
  c("en", "Do you have any tablets?", "search_products"),
  c("en", "Tell me about the Nova X1", "get_product_details", { productIds: [NOVA] }),
  c("en", "What are the specs of this phone?", "get_product_details", { referent: true }),
  c("en", "Compare the Nova X1 and the Orbit Pro", "compare_products", { productIds: [NOVA, ORBIT] }),
  c("en", "Which of these two has the better battery life?", "compare_products", { referent: true }),
  c("en", "Is this one in stock?", "check_stock", { referent: true }),
  c("en", "What charger works with this phone?", "get_accessories"),
  c("en", "Open the product page and add this item to my cart.", "cart_add", { referent: true }),
  c("en", "Remove the charger from my cart", "cart_remove"),
  c("en", "How can I track my order?", "order_status"),
  c("en", "Where is my order?", "order_status"),
  c("en", "I want to cancel my order", "order_support"),
  c("en", "I'd like to pay now", "checkout_handoff"),
  c("en", "How much is delivery?", "store_info", { topic: "delivery_charge" }),
  c("en", "Find the warranty policy on VOLTA.LK.", "website_policy"),
  c("en", "What is your returns policy?", "website_policy"),
  c("en", "Hello there", "smalltalk"),
  c("en", "Thanks a lot", "smalltalk"),
  c("en", "Can you explain what RAM does?", "general"),
  c("en", "Explain how a computer processor works.", "general"),
  c("en", "Write a professional email for me.", "general"),
  c("en", "Open Google and search for this product.", "external_site"),
  c("en", "Check the price of this phone on Amazon", "external_site"),

  // ---- Mixed (Sinhala and English in one sentence)
  c("mixed", "රුපියල් ලක්ෂයකට හොඳ phone එක මොකක්ද?", "search_products", { maxPriceLkr: 100000 }),
  c("mixed", "මට හොඳ laptop එකක් programming වලට පෙන්වන්න", "search_products"),
  c("mixed", "ලාභම phone එක මොකක්ද?", "search_products", { sort: "price-asc" }),
  c("mixed", "tablet එකක් තියෙනවද?", "search_products"),
  c("mixed", "මට මේ product එක ගැන විස්තර කියන්න.", "get_product_details", { referent: true }),
  c("mixed", "Me phone eke camera quality eka gaming walata hondada?", "get_product_details"),
  c("mixed", "මේ දෙකෙන් battery life එක හොඳ මොකක්ද?", "compare_products", { referent: true }),
  c("mixed", "Nova X1 සහ Orbit Pro අතර වෙනස මොකක්ද?", "compare_products", { productIds: [NOVA, ORBIT] }),
  c("mixed", "මේක stock එකේ තියෙනවද?", "check_stock", { referent: true }),
  c("mixed", "මේ phone එකට case එකක් තියෙනවද?", "get_accessories"),
  c("mixed", "මේක cart එකට දාන්න", "cart_add", { referent: true }),
  c("mixed", "cart එකෙන් charger එක අයින් කරන්න", "cart_remove"),
  c("mixed", "මගේ order එක කොහෙද?", "order_status"),
  c("mixed", "order එක track කරන්න ඕන", "order_status"),
  c("mixed", "order එක cancel කරන්න ඕන", "order_support"),
  c("mixed", "checkout එකට යන්න ඕන", "checkout_handoff"),
  c("mixed", "Delivery charge එක කීයද?", "store_info", { topic: "delivery_charge" }),
  c("mixed", "warranty policy එක VOLTA.LK එකේ කොහෙද තියෙන්නේ?", "website_policy"),
  c("mixed", "return policy එක කියන්න", "website_policy"),
  c("mixed", "ආයුබෝවන් hello", "smalltalk"),
  c("mixed", "thanks ස්තූතියි", "smalltalk"),
  c("mixed", "RAM එකෙන් කරන්නේ මොකක්ද explain කරන්න", "general"),
  c("mixed", "professional email එකක් ලියලා දෙන්න", "general"),
  c("mixed", "Google එකට ගිහින් මේ product එක search කරන්න", "external_site"),
]);

export const GROUPS: readonly Group[] = ["si", "singlish", "en", "mixed"];
