import type { ConvLang } from "../m4-conversation/types";
import { CAT, type Expect, type Scenario, type Turn } from "./types";

/**
 * M8 DEV SET. DEV ONLY: this set is tuned on (the router and reasoning layer were changed in response to its failures), so its result is NOT held-out
 * evidence. Author-written (an engineer, no native review) on the invented fixture catalogue (tests/fixtures/rich-catalogue.ts). Expectations come
 * from the fixture numbers and the intended behaviour, written BEFORE the system was run on it.
 *
 * Fixture facts used (cheapest first, in stock): phones ph10 29900, ph04 44900, ph01 59900, ph07 74900, ph08 84900, ph02 94900, ph05 112000, ph06 129900
 * (sale), ph09 169900, ph03 189900. Laptops lp07 99900, lp01 129900, lp05 159900, lp02 199900, lp06 249900, lp03 289900, lp08 329900, lp04 399900.
 * An explicit "cheapest" sort shows 5 cards in price order, which makes "the second one" / "the last one" exactly known.
 */
const T = (say: string, expect: Expect = {}, extra: Partial<Turn> = {}): Turn => ({ say, expect, ...extra });
const S = (id: string, lang: ConvLang, tags: string[], turns: Turn[]): Scenario => ({ id, lang, tags, turns });

export const M8_DEV_SET: readonly Scenario[] = [
  // ============================================================ English
  S("m8-e01", "en", ["greeting"], [T("hi there", { intent: "greeting", tools: [], noCards: true })]),
  S("m8-e02", "en", ["questions"], [T("hello, I want to buy a phone", { category: CAT.phones, ask: "budget" })]),
  S("m8-e03", "en", ["student", "budget"], [T("my daughter needs a laptop for school, budget is about 120000", { topId: "lp07", maxPrice: 120000, profile: { budgetMax: 120000, usage: ["student"] } })]),
  S("m8-e04", "en", ["budget-change"], [
    T("phones under 100000", { maxPrice: 100000, profile: { budgetMax: 100000 } }),
    T("actually make it 60000", { maxPrice: 60000, minCards: 1, profile: { budgetMax: 60000, category: CAT.phones } }),
  ]),
  S("m8-e05", "en", ["budget-change"], [
    T("phones under 50000", { maxPrice: 50000, minCards: 1 }),
    T("I can go up to 100000", { maxPrice: 100000, minCards: 2, profile: { budgetMax: 100000, category: CAT.phones } }),
  ]),
  S("m8-e06", "en", ["rejection", "cheaper"], [
    T("gaming phone under 150000", { topId: "ph06" }),
    T("something cheaper please", { cheaperThanPrevTop: true, minCards: 1, category: CAT.phones }),
  ]),
  S("m8-e07", "en", ["reference"], [
    T("cheapest phones", { minCards: 5, topId: "ph10" }),
    T("the second one", { refers: "ph04" }),
    T("and the last one", { refers: "ph08" }),
  ]),
  S("m8-e08", "en", ["reference"], [
    T("cheapest phones", { minCards: 5, topId: "ph10" }),
    T("tell me about the third one", { tools: ["get_product_details"], refers: "ph01" }),
  ]),
  S("m8-e09", "en", ["reference", "price"], [
    T("cheapest laptops", { minCards: 5, topId: "lp07" }),
    T("what's the price of the last one", { intent: "price_inquiry", refers: "lp06" }),
  ]),
  S("m8-e10", "en", ["comparison", "reference"], [
    T("cheapest phones", { minCards: 5 }),
    T("compare the first and the last one", { intent: "product_comparison", comparison: 2 }),
  ]),
  S("m8-e11", "en", ["comparison", "context"], [
    T("tell me about Lumen P3 Ultra", { refers: "ph03" }),
    T("compare it with the Orbit A7 Camera Edition", { intent: "product_comparison", comparison: 2 }),
  ]),
  S("m8-e12", "en", ["usage", "context"], [
    T("phones under 100000", { maxPrice: 100000 }),
    T("I mostly take photos", { topId: "ph02", maxPrice: 100000, profile: { usage: ["camera"], budgetMax: 100000 } }),
  ]),
  S("m8-e13", "en", ["no-repeat"], [
    T("I need a laptop for programming", { ask: "budget", category: CAT.laptops }),
    T("I don't have a budget", { askNot: "budget", minCards: 1 }),
  ]),
  S("m8-e14", "en", ["no-repeat"], [
    T("show me phones", { ask: "budget" }),
    T("not sure", { askNot: "budget" }),
  ]),
  S("m8-e15", "en", ["amount-format"], [T("phone under 1 lakh", { maxPrice: 100000, profile: { budgetMax: 100000 } })]),
  S("m8-e16", "en", ["amount-format"], [T("phone below 75k", { maxPrice: 75000, profile: { budgetMax: 75000 } })]),
  S("m8-e17", "en", ["amount-format"], [T("phone under Rs. 75,000", { maxPrice: 75000, profile: { budgetMax: 75000 } })]),
  S("m8-e18", "en", ["amount-format", "range"], [T("phones between 50000 and 100000", { maxPrice: 100000, excludesIds: ["ph10", "ph04"], minCards: 2 })]),
  S("m8-e19", "en", ["typo"], [T("labtop for gamming under 300000", { category: CAT.laptops, maxPrice: 300000, profile: { usage: ["gaming"], budgetMax: 300000 } })]),
  S("m8-e20", "en", ["typo", "brand"], [T("samsng phones", { containsIds: ["ph08"], minCards: 1 })]),
  S("m8-e21", "en", ["accessories"], [T("powerbank", { containsIds: ["ac05", "ac06"] })]),
  S("m8-e22", "en", ["comparison"], [T("which is cheaper, Lumen P1 or Orbit A5?", { intent: "product_comparison", comparison: 2 })]),
  S("m8-e23", "en", ["price"], [T("how much is the Zenix Z9", { intent: "price_inquiry", refers: "ph06" })]),
  S("m8-e24", "en", ["stock"], [T("is the Orbit A7 in stock", { intent: "stock_check", tools: ["check_stock"] })]),
  S("m8-e25", "en", ["price", "stock"], [T("Kite K0 price", { intent: "price_inquiry", refers: "ph11" })]),
  S("m8-e26", "en", ["sale"], [T("is there anything on sale", { intent: "shopping_search", containsIds: ["ph06"] })]),
  S("m8-e27", "en", ["long-message", "battery"], [T("hey so my phone fell in the water yesterday and i need a new one under 60000 preferably with a good battery", { maxPrice: 60000, topAmong: ["ph01", "ph04"], profile: { usage: ["battery"], budgetMax: 60000 } })]),
  S("m8-e28", "en", ["caps"], [T("SHOW ME LAPTOPS!!!", { category: CAT.laptops, ask: "budget" })]),
  S("m8-e29", "en", ["general"], [T("what is an OLED screen", { intent: "general_knowledge", tools: [], noCards: true })]),
  S("m8-e30", "en", ["conversation"], [T("thanks a lot, that was helpful", { intent: "general_conversation", tools: [], noCards: true })]),
  S("m8-e31", "en", ["rejection"], [
    T("tell me about Lumen P1", { refers: "ph01" }),
    T("I don't like this one, show me another phone", { excludesPrevTop: true, minCards: 1, category: CAT.phones }),
  ]),
  S("m8-e32", "en", ["rejection", "cheaper"], [
    T("gaming laptop under 300000", { category: CAT.laptops, minCards: 1 }),
    T("a bit cheaper please", { cheaperThanPrevTop: true, minCards: 1, category: CAT.laptops }),
  ]),
  S("m8-e33", "en", ["more"], [
    T("show me phones under 100000", { minCards: 2 }),
    T("show me more", { excludesPrevShown: true, minCards: 1 }),
  ]),
  S("m8-e34", "en", ["topic-switch"], [
    T("phone for camera under 100000", { profile: { usage: ["camera"], budgetMax: 100000 } }),
    T("now I need a laptop for office", { category: CAT.laptops, profile: { category: CAT.laptops, usage: ["office"], noBudget: true } }),
  ]),
  S("m8-e35", "en", ["accessories"], [T("I need a charger for my phone", { containsIds: ["ac01"] })]),
  S("m8-e36", "en", ["accessories", "context"], [
    T("Lumen P1", { refers: "ph01" }),
    T("any case for it?", { intent: "accessory_compatibility", tools: ["get_accessories"], template: "no_accessories" }),
  ]),
  S("m8-e37", "en", ["opinion"], [T("is the Lumen P2 Pro good for gaming?", { refers: "ph02" })]),
  S("m8-e38", "en", ["not-in-catalogue"], [T("do you have the Pixel 9", { intent: "shopping_search" })]),
  S("m8-e39", "en", ["questions"], [T("gaming laptop", { category: CAT.laptops, ask: "budget", profile: { usage: ["gaming"] } })]),
  S("m8-e40", "en", ["missing-data"], [T("gaming phone under 80000", { topId: "ph01", fitHas: ["most_memory"], maxPrice: 80000 })]),
  S("m8-e41", "en", ["general"], [T("tell me a joke", { intent: "general_knowledge", tools: [], noCards: true })]),
  S("m8-e42", "en", ["cart", "reference"], [
    T("cheapest phones", { minCards: 5 }),
    T("add the second one to my cart", { cartAddIndex: 2 }),
  ]),
  // ============================================================ Singlish
  S("m8-s01", "singlish", ["questions"], [T("mata phone ekak oni", { category: CAT.phones, ask: "budget" })]),
  S("m8-s02", "singlish", ["student", "budget"], [T("school yana duwata laptop ekak oni 120000 wage", { topId: "lp07", maxPrice: 120000, profile: { usage: ["student"] } })]),
  S("m8-s03", "singlish", ["budget-change"], [
    T("phone ekak oni 100000 ta adu", { maxPrice: 100000 }),
    T("naa 60000 ta adu karanna", { maxPrice: 60000, minCards: 1, profile: { budgetMax: 60000, category: CAT.phones } }),
  ]),
  S("m8-s04", "singlish", ["rejection", "cheaper"], [
    T("camera hodai phone ekak 100000 ta adu", { topId: "ph02" }),
    T("poddak adu ekak thiyenawada", { cheaperThanPrevTop: true, minCards: 1, category: CAT.phones }),
  ]),
  S("m8-s05", "singlish", ["reference", "price"], [
    T("cheapest laptop eka pennanna", { minCards: 5, topId: "lp07" }),
    T("anthima eka kiyada", { intent: "price_inquiry", refers: "lp06" }),
  ]),
  S("m8-s06", "singlish", ["reference", "stock"], [
    T("cheapest phone eka pennanna", { minCards: 5, topId: "ph10" }),
    T("thunweni eka stock eke thiyenawada", { intent: "stock_check", tools: ["check_stock"] }),
  ]),
  S("m8-s07", "singlish", ["memory", "reference"], [
    T("Lumen P1 eka kiyada", { refers: "ph01" }),
    T("Orbit A5 eka kiyada", { refers: "ph04" }),
    T("Kite K1 eka kiyada", { refers: "ph10" }),
    T("mulinma kiyapu eka", { refers: "ph01" }),
  ]),
  S("m8-s08", "singlish", ["memory", "reference"], [
    T("Lumen P1 eka kiyada", { refers: "ph01" }),
    T("Orbit A5 eka kiyada", { refers: "ph04" }),
    T("Kite K1 eka kiyada", { refers: "ph10" }),
    T("kalin kiyapu eka hondada", { refers: "ph04" }),
  ]),
  S("m8-s09", "singlish", ["rejection"], [
    T("Lumen P1 eka kiyada", { refers: "ph01" }),
    T("meka epa, wena ekak pennanna", { excludesPrevTop: true, minCards: 1, category: CAT.phones }),
  ]),
  S("m8-s10", "singlish", ["cart", "reference"], [
    T("Lumen P1 eka kiyada", { refers: "ph01" }),
    T("meka cart ekata damanna", { cartAddIndex: 1 }),
  ]),
  S("m8-s11", "singlish", ["price"], [T("Zenix Z9 eka kiyada", { intent: "price_inquiry", refers: "ph06" })]),
  S("m8-s12", "singlish", ["stock"], [T("Orbit A7 eka stock eke thiyenawada", { intent: "stock_check", tools: ["check_stock"] })]),
  S("m8-s13", "singlish", ["comparison"], [T("Lumen P1 ekai Orbit A5 ekai compare karanna", { intent: "product_comparison", comparison: 2 })]),
  S("m8-s14", "singlish", ["comparison"], [T("Lumen P2 Pro eka Samsung Test A1 ekata wada hondada", { intent: "product_comparison", comparison: 2 })]),
  S("m8-s15", "singlish", ["typo"], [T("labtop ekak oni gamming walata 300000 ta adu", { category: CAT.laptops, maxPrice: 300000, profile: { usage: ["gaming"] } })]),
  S("m8-s16", "singlish", ["brand", "no-match"], [T("oppo phone thiyenawada", { template: "no_match_alternatives", minCards: 1 })]),
  S("m8-s17", "singlish", ["accessories", "typo"], [T("powerbank ekak oni", { containsIds: ["ac05", "ac06"] })]),
  S("m8-s18", "singlish", ["accessories"], [T("phone cover ekak", { containsIds: ["ac04"] })]),
  S("m8-s19", "singlish", ["accessories"], [T("mage phone ekata charger ekak oni", { containsIds: ["ac01"] })]),
  S("m8-s20", "singlish", ["general"], [T("SSD kiyanne mokakda", { intent: "general_knowledge", tools: [], noCards: true })]),
  S("m8-s21", "singlish", ["identity"], [T("oyage nama mokakda", { tools: [], noCards: true })]),
  S("m8-s22", "singlish", ["greeting"], [T("ayubowan", { intent: "greeting", tools: [], noCards: true })]),
  S("m8-s23", "singlish", ["conversation"], [T("bohoma sthuthiyi", { intent: "general_conversation", tools: [], noCards: true })]),
  S("m8-s24", "singlish", ["more"], [
    T("phone ekak pennanna 100000 ta adu", { minCards: 2 }),
    T("thawa pennanna", { excludesPrevShown: true, minCards: 1 }),
  ]),
  S("m8-s25", "singlish", ["topic-switch"], [
    T("game gahanna phone ekak 150000 ta adu", { profile: { usage: ["gaming"], budgetMax: 150000 } }),
    T("dan laptop ekak pennanna", { category: CAT.laptops, profile: { category: CAT.laptops, noBudget: true } }),
  ]),
  S("m8-s26", "singlish", ["gaming", "budget"], [T("mata gaming laptop ekak oni, budget eka 300000", { category: CAT.laptops, maxPrice: 300000, topId: "lp06", profile: { usage: ["gaming"], budgetMax: 300000 } })]),
  S("m8-s27", "singlish", ["no-repeat"], [
    T("phone ekak pennanna", { ask: "budget" }),
    T("budget ekak nane", { askNot: "budget", minCards: 1 }),
  ]),
  S("m8-s28", "singlish", ["reference", "context"], [
    T("Lumen P2 Pro eka kiyada", { refers: "ph02" }),
    T("battery eka kohomada", { refers: "ph02" }),
  ]),
  S("m8-s29", "singlish", ["usage", "context"], [
    T("phone ekak pennanna 100000 ta adu", { maxPrice: 100000 }),
    T("mama wadiyenma photo gahanawa", { topId: "ph02", maxPrice: 100000, profile: { usage: ["camera"], budgetMax: 100000 } }),
  ]),
  // ============================================================ Sinhala script
  S("m8-i01", "si", ["questions"], [T("මට ෆෝන් එකක් ඕන", { category: CAT.phones, ask: "budget" })]),
  S("m8-i02", "si", ["questions"], [T("ලැප්ටොප් එකක් පෙන්නන්න", { category: CAT.laptops, ask: "budget" })]),
  S("m8-i03", "si", ["camera", "budget"], [T("කැමරාව හොඳ ෆෝන් එකක් රු. 100000ට අඩු", { topId: "ph02", maxPrice: 100000 })]),
  S("m8-i04", "si", ["gaming", "budget"], [T("ගේම් ගහන්න ෆෝන් එකක් 150000ට අඩු", { topId: "ph06", maxPrice: 150000 })]),
  S("m8-i05", "si", ["reference", "price"], [
    T("ලාභම ෆෝන් පෙන්නන්න", { minCards: 5, topId: "ph10" }),
    T("පළවෙනි එකේ මිල කීයද", { intent: "price_inquiry", refersIndex: 1 }),
  ]),
  S("m8-i06", "si", ["reference", "stock"], [
    T("ලාභම ෆෝන් පෙන්නන්න", { minCards: 5 }),
    T("අන්තිම එක තොගේ තියෙනවද", { intent: "stock_check", tools: ["check_stock"] }),
  ]),
  S("m8-i07", "si", ["greeting"], [T("ආයුබෝවන්", { intent: "greeting", tools: [], noCards: true })]),
  S("m8-i08", "si", ["conversation"], [T("ස්තූතියි", { intent: "general_conversation", tools: [], noCards: true })]),
  S("m8-i09", "si", ["general"], [T("SSD එකක් කියන්නේ මොකක්ද", { intent: "general_knowledge", tools: [], noCards: true })]),
  S("m8-i10", "si", ["budget-change"], [
    T("ෆෝන් එකක් 100000ට අඩු", { maxPrice: 100000 }),
    T("නෑ 60000ට අඩු කරන්න", { maxPrice: 60000, minCards: 1, profile: { budgetMax: 60000 } }),
  ]),
  S("m8-i11", "si", ["price"], [T("Lumen P1 එකේ මිල කීයද", { intent: "price_inquiry", refers: "ph01" })]),
  S("m8-i12", "si", ["comparison"], [T("Lumen P1 එක සහ Orbit A5 එක සසඳන්න", { intent: "product_comparison", comparison: 2 })]),
  S("m8-i13", "si", ["accessories"], [T("power bank එකක් තියෙනවද", { containsIds: ["ac05", "ac06"] })]),
  S("m8-i14", "si", ["programming"], [T("ලැප්ටොප් එකක් programming වලට 250000ට අඩු", { topId: "lp06", maxPrice: 250000 })]),
  // ============================================================ Mixed
  S("m8-x01", "mixed", ["programming"], [T("Show me a laptop eka for programming 250000 ta adu", { topId: "lp06", maxPrice: 250000 })]),
  S("m8-x02", "mixed", ["comparison"], [T("Lumen P1 eka compare with Orbit A5", { intent: "product_comparison", comparison: 2 })]),
  S("m8-x03", "mixed", ["camera", "budget"], [T("I need a phone ekak, camera eka hodai wenna oni, budget 100000", { topId: "ph02", maxPrice: 100000 })]),
  S("m8-x04", "mixed", ["rejection", "cheaper"], [
    T("Lumen P2 Pro eka kiyada", { refers: "ph02" }),
    T("meka cheaper ekak thiyenawada", { cheaperThanPrevTop: true, minCards: 1, category: CAT.phones }),
  ]),
  S("m8-x05", "mixed", ["conversation"], [T("thanks bro, hari hondai", { intent: "general_conversation", tools: [], noCards: true })]),
  S("m8-x06", "mixed", ["reference", "price"], [
    T("cheapest phones pennanna", { minCards: 5 }),
    T("what's the price of palaweni eka", { intent: "price_inquiry", refersIndex: 1 }),
  ]),
  S("m8-x07", "mixed", ["topic-switch"], [
    T("gaming phone ekak under 150000", { profile: { usage: ["gaming"], budgetMax: 150000 } }),
    T("ok now show me a laptop", { category: CAT.laptops, profile: { category: CAT.laptops, noBudget: true } }),
  ]),
  S("m8-x08", "mixed", ["questions"], [
    T("show me phones", { ask: "budget" }),
    T("100000 ta adu, camera ekata", { topId: "ph02", noAsk: true, profile: { budgetMax: 100000, usage: ["camera"] } }),
  ]),
  // ============================================================ Wording variety (consecutive replies must not repeat word for word)
  S("m8-v01", "en", ["variety"], [
    T("phones under 100000 for camera", { topId: "ph02" }),
    T("what about under 60000", { minCards: 1, variesFromPrevious: true }),
    T("and under 50000", { minCards: 1, variesFromPrevious: true }),
  ]),
  S("m8-v02", "singlish", ["variety"], [
    T("camera hodai phone ekak 100000 ta adu", { topId: "ph02" }),
    T("60000 ta adu", { minCards: 1, variesFromPrevious: true }),
    T("50000 ta adu", { minCards: 1, variesFromPrevious: true }),
  ]),
  S("m8-v03", "en", ["variety"], [
    T("thanks", { intent: "general_conversation" }),
    T("thanks again", { intent: "general_conversation", variesFromPrevious: true }),
  ]),
  S("m8-v04", "en", ["variety"], [
    T("hi", { intent: "greeting" }),
    T("hello", { intent: "greeting", variesFromPrevious: true }),
  ]),
];
