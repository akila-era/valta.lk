import { CAT, type Expect, type Scenario, type Turn } from "./types";
import type { ConvLang } from "../m4-conversation/types";

/**
 * DEV (M5): the set the reasoning layer is tuned on (EVAL, in eval-set.ts, is not). Author-written, not native-reviewed, on the invented
 * fixture catalogue. Expectations come from the fixture numbers and the intended behaviour. It was written after the first EVAL run, so
 * the failure classes that run showed are covered here; that is why EVAL's first-run result, not DEV's, is the held-out number.
 */
const T = (say: string, expect: Expect = {}, extra: Partial<Turn> = {}): Turn => ({ say, expect, ...extra });
const S = (id: string, lang: ConvLang, tags: string[], turns: Turn[]): Scenario => ({ id, lang, tags, turns });

export const DEV_SET: readonly Scenario[] = [
  // ================= English: discovery with budget and usage
  S("d-e01", "en", ["camera", "budget"], [T("I need a phone with a great camera under 100000", { topId: "ph02", fitHas: ["best_camera"], maxPrice: 100000, profile: { budgetMax: 100000, usage: ["camera"] } })]),
  S("d-e02", "en", ["camera", "budget"], [T("best camera phone below 70000", { topId: "ph01", maxPrice: 70000 })]),
  S("d-e03", "en", ["camera", "budget"], [T("phone for photography under 50000", { topId: "ph04", maxPrice: 50000, profile: { usage: ["camera"] } })]),
  S("d-e04", "en", ["camera"], [T("I want a phone for taking photos", { topAmong: ["ph03", "ph09"], ask: "budget", profile: { usage: ["camera"] } })]),
  S("d-e05", "en", ["gaming", "budget"], [T("gaming phone under 150000", { topId: "ph06", fitHas: ["most_memory"], maxPrice: 150000 })]),
  S("d-e06", "en", ["gaming", "budget"], [T("I need a phone for games under 100000", { topAmong: ["ph02", "ph08"], maxPrice: 100000 })]),
  S("d-e07", "en", ["gaming", "budget"], [T("phone for gaming below 60000", { topId: "ph01", maxPrice: 60000 })]),
  S("d-e08", "en", ["battery"], [T("phone with the best battery life", { topId: "ph06", ask: "budget", profile: { usage: ["battery"] } })]),
  S("d-e09", "en", ["battery", "budget"], [T("long lasting battery phone under 100000", { topAmong: ["ph01", "ph02"], maxPrice: 100000 })]),
  S("d-e10", "en", ["programming"], [T("laptop for coding under 250000", { topId: "lp06", maxPrice: 250000, profile: { usage: ["programming"], budgetMax: 250000 } })]),
  S("d-e11", "en", ["programming"], [T("I need a laptop for programming", { ask: "budget", category: CAT.laptops, profile: { usage: ["programming"] } })]),
  S("d-e12", "en", ["design"], [T("laptop for video editing under 350000", { topId: "lp06", maxPrice: 350000, profile: { usage: ["design"] } })]),
  S("d-e13", "en", ["gaming"], [T("gaming laptop under 200000", { topId: "lp02", maxPrice: 200000 })]),
  S("d-e14", "en", ["gaming"], [T("gaming laptop under 150000", { topId: "lp01", maxPrice: 150000 })]),
  S("d-e15", "en", ["office"], [T("laptop for office work under 120000", { topId: "lp07", maxPrice: 120000, profile: { usage: ["office"] } })]),
  S("d-e16", "en", ["student"], [T("I need a laptop for studies under 150000", { topAmong: ["lp07", "lp01"], maxPrice: 150000, profile: { usage: ["student"] } })]),
  S("d-e17", "en", ["questions"], [
    T("show me laptops", { ask: "budget" }),
    T("300000", { ask: "usage", maxPrice: 300000 }),
    T("office", { topAmong: ["lp07", "lp01"], noAsk: true, profile: { usage: ["office"], budgetMax: 300000 } }),
  ]),
  S("d-e18", "en", ["questions"], [
    T("I want a phone", { ask: "budget" }),
    T("around 90000", { maxPrice: 90000, profile: { budgetMax: 90000 } }),
  ]),
  S("d-e19", "en", ["questions", "no-repeat"], [
    T("show me phones", { ask: "budget" }),
    T("camera", { profile: { usage: ["camera"] }, topAmong: ["ph03", "ph09"] }),
    T("under 100000", { topId: "ph02", noAsk: true, profile: { budgetMax: 100000, usage: ["camera"] } }),
  ]),
  S("d-e20", "en", ["questions"], [T("I need a phone for under 100000 for gaming", { topAmong: ["ph02", "ph08"], maxPrice: 100000 })]),
  // ================= English: reference, opinion, price, stock, comparison
  S("d-e21", "en", ["reference"], [
    T("show me laptops under 200000", { minCards: 2 }),
    T("tell me about the first one", { tools: ["get_product_details"], refersIndex: 1 }),
  ]),
  S("d-e22", "en", ["reference"], [
    T("show me phones under 100000", { minCards: 2 }),
    T("what is the price of the third one", { intent: "price_inquiry", refersIndex: 3 }),
  ]),
  S("d-e23", "en", ["reference"], [
    T("show me phones", { minCards: 2 }),
    T("is the last one in stock", { intent: "stock_check", tools: ["check_stock"] }),
  ]),
  S("d-e24", "en", ["reference", "memory"], [
    T("tell me about Lumen P1", { refers: "ph01" }),
    T("tell me about Orbit A5", { refers: "ph04" }),
    T("is the one I mentioned before any good", { refers: "ph01" }),
  ]),
  S("d-e25", "en", ["opinion"], [
    T("tell me about Zenix Z9 Gamer", { refers: "ph06" }),
    T("is this good?", { template: "opinion_facts", refers: "ph06" }),
  ]),
  S("d-e26", "en", ["opinion", "fit"], [
    T("gaming phone under 150000", { topId: "ph06" }),
    T("is it worth it?", { template: "opinion_facts", refersIndex: 1, fitHas: ["within_budget"] }),
  ]),
  S("d-e27", "en", ["comparison"], [T("compare Orbit A5 and Kite K1", { intent: "product_comparison", tools: ["compare_products"], comparison: 2 })]),
  S("d-e28", "en", ["comparison"], [T("Lumen P1 vs Orbit A5", { intent: "product_comparison", comparison: 2 })]),
  S("d-e29", "en", ["comparison", "reference"], [
    T("show me phones under 60000", { minCards: 2 }),
    T("compare the first two", { intent: "product_comparison", comparison: 2 }),
  ]),
  S("d-e30", "en", ["price"], [T("price of Lumen P3 Ultra", { intent: "price_inquiry", refers: "ph03" })]),
  S("d-e31", "en", ["stock"], [T("do you have the Kite K0 in stock", { intent: "stock_check", tools: ["check_stock"] })]),
  S("d-e32", "en", ["stock"], [T("is the Lumen P2 Pro available", { intent: "stock_check", tools: ["check_stock"] })]),
  // ================= English: brand advice, no match, alternatives
  S("d-e33", "en", ["brand", "context"], [
    T("phone with good camera under 100000", { profile: { budgetMax: 100000, usage: ["camera"] } }),
    T("what about Samsung?", { template: "brand_advice", brand: "Samsung", maxPrice: 100000, containsIds: ["ph08"] }),
  ]),
  S("d-e34", "en", ["brand"], [T("show me Samsung phones", { brand: "Samsung", containsIds: ["ph08", "ph09"], noAsk: true })]),
  S("d-e35", "en", ["brand"], [T("Lumen phones under 100000", { brand: "Lumen", maxPrice: 100000, containsIds: ["ph01", "ph02"], excludesIds: ["ph03"] })]),
  S("d-e36", "en", ["no-match"], [T("show me Apple phones", { template: "no_match_alternatives", minCards: 1, category: CAT.phones })]),
  S("d-e37", "en", ["no-match", "budget"], [T("a laptop under 50000", { template: "no_match_alternatives", minCards: 1, category: CAT.laptops, fitOf: { id: "lp07", tradeoffs: ["over_budget"] } })]),
  S("d-e38", "en", ["no-match"], [T("I want a Sony camera", { intent: "shopping_search", noAsk: true })]),
  S("d-e39", "en", ["stock"], [T("Kite phones", { brand: "Kite", containsIds: ["ph10"], excludesIds: ["ph11"] })]),
  S("d-e40", "en", ["sort"], [T("most expensive phone", { topId: "ph03", noAsk: true })]),
  S("d-e41", "en", ["sort"], [T("cheapest phone", { topId: "ph10", noAsk: true })]),
  S("d-e42", "en", ["accessories"], [T("do you have a power bank", { containsIds: ["ac05", "ac06"], noAsk: true })]),
  S("d-e43", "en", ["accessories"], [T("I need a usb cable", { containsIds: ["ac02"] })]),
  S("d-e44", "en", ["accessories"], [T("phone case", { containsIds: ["ac04"] })]),
  S("d-e45", "en", ["accessories", "questions"], [
    T("show me accessories", { template: "clarify_accessory_for" }),
    T("Orbit A5", { tools: ["get_accessories"], template: "no_accessories" }),
  ]),
  // ================= English: general knowledge, greeting, ambiguity
  S("d-e46", "en", ["general"], [T("what is an SSD", { intent: "general_knowledge", tools: [], noCards: true })]),
  S("d-e47", "en", ["general"], [T("explain what megapixels mean", { intent: "general_knowledge", tools: [], noCards: true })]),
  S("d-e48", "en", ["general"], [T("what is the weather today", { intent: "general_knowledge", tools: [], noCards: true })]),
  S("d-e49", "en", ["general"], [T("write a poem about the sea", { intent: "general_knowledge", tools: [], noCards: true })]),
  S("d-e50", "en", ["greeting"], [T("good morning", { intent: "greeting", tools: [], noCards: true })]),
  S("d-e51", "en", ["greeting"], [T("how are you", { intent: "greeting", tools: [], noCards: true })]),
  S("d-e52", "en", ["conversation"], [T("thanks", { intent: "general_conversation", tools: [], noCards: true })]),
  S("d-e53", "en", ["ambiguous"], [T("hmm", { tools: [], noCards: true })]),
  S("d-e54", "en", ["ambiguous"], [T("that one", { tools: [], noCards: true })]),
  S("d-e55", "en", ["context-switch"], [
    T("laptop for programming under 300000", { profile: { category: CAT.laptops, usage: ["programming"] } }),
    T("show me phones", { category: CAT.phones, profile: { category: CAT.phones, noBudget: true } }),
  ]),
  S("d-e56", "en", ["context-switch", "no-leak"], [
    T("gaming phone under 150000", { profile: { usage: ["gaming"], budgetMax: 150000 } }),
    T("show me chargers", { profile: { category: CAT.accessories, noBudget: true }, containsIds: ["ac01"] }),
  ]),
  S("d-e57", "en", ["erp-down"], [T("show me laptops", { template: "tool_failed", noCards: true }, { setup: "erp_down" })]),
  S("d-e58", "en", ["cart", "reference"], [
    T("show me phones under 50000", { minCards: 2 }),
    T("add the first one to my cart", { cartAddIndex: 1 }),
  ]),
  // ================= Singlish
  S("d-s01", "singlish", ["camera", "budget"], [T("camera eka hondai phone ekak oni 100000 ta adu", { topId: "ph02", maxPrice: 100000, profile: { usage: ["camera"], budgetMax: 100000 } })]),
  S("d-s02", "singlish", ["camera", "budget"], [T("70000 ta adu camera phone ekak", { topId: "ph01", maxPrice: 70000 })]),
  S("d-s03", "singlish", ["gaming"], [T("game gahanna phone ekak oni 150000 ta adu", { topId: "ph06", maxPrice: 150000 })]),
  S("d-s04", "singlish", ["battery"], [T("battery eka hondai phone ekak oni 100000 ta adu", { topAmong: ["ph01", "ph02"], maxPrice: 100000 })]),
  S("d-s05", "singlish", ["programming"], [T("programming walata laptop ekak oni 250000 ta adu", { topId: "lp06", maxPrice: 250000 })]),
  S("d-s06", "singlish", ["office"], [T("office wada walata laptop ekak 150000 ta adu", { topAmong: ["lp07", "lp01"], maxPrice: 150000 })]),
  S("d-s07", "singlish", ["questions"], [
    T("laptop ekak pennanna", { ask: "budget" }),
    T("200000 ta adu", { ask: "usage", maxPrice: 200000 }),
    T("gaming", { topId: "lp02", noAsk: true }),
  ]),
  S("d-s08", "singlish", ["questions"], [
    T("phone ekak oni", { ask: "budget" }),
    T("100000 ta adu", { ask: "usage", maxPrice: 100000 }),
    T("battery", { topAmong: ["ph01", "ph02"], noAsk: true }),
  ]),
  S("d-s09", "singlish", ["reference"], [
    T("phone ekak pennanna 100000 ta adu", { minCards: 2 }),
    T("palaweni eka kiyada", { intent: "price_inquiry", refersIndex: 1 }),
  ]),
  S("d-s10", "singlish", ["reference"], [
    T("laptop ekak pennanna", { minCards: 2 }),
    T("deweni eka stock eke thiyenawada", { intent: "stock_check", tools: ["check_stock"] }),
  ]),
  S("d-s11", "singlish", ["opinion", "reference"], [
    T("Lumen P1 eka kiyada", { refers: "ph01" }),
    T("meka hondada?", { template: "opinion_facts", refers: "ph01" }),
  ]),
  S("d-s12", "singlish", ["reference", "memory"], [
    T("Lumen P1 eka kiyada", { refers: "ph01" }),
    T("Orbit A5 eka kiyada", { refers: "ph04" }),
    T("kalin kiyapu eka hondada", { refers: "ph01" }),
  ]),
  S("d-s13", "singlish", ["brand", "context"], [
    T("phone ekak oni 100000 ta adu camera ekata", { profile: { budgetMax: 100000, usage: ["camera"] } }),
    T("Samsung hodaida?", { template: "brand_advice", brand: "Samsung", maxPrice: 100000, containsIds: ["ph08"] }),
  ]),
  S("d-s14", "singlish", ["brand"], [T("samsung phone thiyenawada", { brand: "Samsung", containsIds: ["ph08", "ph09"] })]),
  S("d-s15", "singlish", ["brand", "no-match"], [T("Xiaomi phone ekak thiyenawada", { template: "no_match_alternatives", minCards: 1 })]),
  S("d-s16", "singlish", ["accessories", "typo"], [T("power banak thiyanawada", { containsIds: ["ac05", "ac06"] })]),
  S("d-s17", "singlish", ["accessories"], [T("charger ekak oni", { containsIds: ["ac01"], noAsk: true })]),
  S("d-s18", "singlish", ["accessories", "reference"], [
    T("Lumen P1 eka kiyada", { refers: "ph01" }),
    T("meyata cable ekak thiyenawada", { intent: "accessory_compatibility", tools: ["get_accessories"] }),
  ]),
  S("d-s19", "singlish", ["comparison"], [T("Lumen P1 saha Orbit A5 compare karanna", { intent: "product_comparison", comparison: 2 })]),
  S("d-s20", "singlish", ["price"], [T("Kite K1 eka kiyada", { intent: "price_inquiry", refers: "ph10" })]),
  S("d-s21", "singlish", ["stock"], [T("Kite K0 stock eke thiyenawada", { intent: "stock_check", tools: ["check_stock"] })]),
  S("d-s22", "singlish", ["sort"], [T("cheapest laptop eka pennanna", { topId: "lp07", noAsk: true })]),
  S("d-s23", "singlish", ["clarification"], [T("monada product thiyenne", { intent: "clarification", tools: [], noCards: true })]),
  S("d-s24", "singlish", ["greeting"], [T("kohomada oyata", { intent: "greeting", tools: [], noCards: true })]),
  S("d-s25", "singlish", ["conversation"], [T("oyata puluwanda udaw karanna", { intent: "general_conversation", tools: [], noCards: true })]),
  S("d-s26", "singlish", ["conversation"], [T("istuti", { intent: "general_conversation", tools: [], noCards: true })]),
  S("d-s27", "singlish", ["context-switch"], [
    T("phone ekak oni 100000 ta adu", { profile: { category: CAT.phones, budgetMax: 100000 } }),
    T("laptop ekak pennanna", { category: CAT.laptops, profile: { category: CAT.laptops, noBudget: true } }),
  ]),
  S("d-s28", "singlish", ["context", "budget"], [
    T("laptop ekak pennanna", { minCards: 1 }),
    T("150000 ta adu", { category: CAT.laptops, maxPrice: 150000, profile: { category: CAT.laptops, budgetMax: 150000 } }),
  ]),
  S("d-s29", "singlish", ["no-match", "budget"], [T("20000 ta adu phone ekak", { template: "no_match_alternatives", minCards: 1 })]),
  S("d-s30", "singlish", ["general"], [T("RAM kiyanne mokakda", { intent: "general_knowledge", tools: [], noCards: true })]),
  // ================= Sinhala script
  S("d-si01", "si", ["camera", "budget"], [T("මට camera එක හොඳ phone එකක් ඕන 100000 ට අඩු", { topId: "ph02", maxPrice: 100000, profile: { usage: ["camera"], budgetMax: 100000 } })]),
  S("d-si02", "si", ["gaming", "budget"], [T("ගේම් වලට phone එකක් ඕන 150000 ට අඩු", { topId: "ph06", maxPrice: 150000 })]),
  S("d-si03", "si", ["questions"], [
    T("laptop එකක් පෙන්වන්න", { ask: "budget" }),
    T("200000 ට අඩු", { ask: "usage", maxPrice: 200000 }),
    T("ගේම්", { topId: "lp02", profile: { usage: ["gaming"] } }),
  ]),
  S("d-si04", "si", ["reference"], [
    T("phone එකක් පෙන්වන්න 100000 ට අඩු", { minCards: 2 }),
    T("පළවෙනි එකේ මිල කීයද", { intent: "price_inquiry", refersIndex: 1 }),
  ]),
  S("d-si05", "si", ["opinion"], [
    T("Lumen P1 එකේ මිල කීයද", { refers: "ph01" }),
    T("මේක හොඳද", { template: "opinion_facts", refers: "ph01" }),
  ]),
  S("d-si06", "si", ["brand"], [T("Samsung phone එකක් පෙන්වන්න", { brand: "Samsung", containsIds: ["ph08", "ph09"] })]),
  S("d-si07", "si", ["stock"], [T("Kite K0 තොගේ තියෙනවද", { intent: "stock_check", tools: ["check_stock"] })]),
  S("d-si08", "si", ["comparison"], [T("Lumen P1 සහ Orbit A5 සසඳන්න", { intent: "product_comparison", comparison: 2 })]),
  S("d-si09", "si", ["greeting"], [T("ආයුබෝවන්", { intent: "greeting", tools: [], noCards: true })]),
  S("d-si10", "si", ["conversation"], [T("ස්තුතියි", { intent: "general_conversation", tools: [], noCards: true })]),
  S("d-si11", "si", ["general"], [T("කාලගුණය කොහොමද", { intent: "general_knowledge", tools: [], noCards: true })]),
  S("d-si12", "si", ["no-match"], [T("Apple phone එකක් තියෙනවද", { template: "no_match_alternatives", minCards: 1 })]),
  // ================= Mixed
  S("d-m01", "mixed", ["camera", "budget"], [T("camera phone එකක් ඕන 100000 ට අඩු", { topId: "ph02", maxPrice: 100000, profile: { usage: ["camera"] } })]),
  S("d-m02", "mixed", ["questions", "context"], [
    T("laptop එකක් ඕන", { ask: "budget" }),
    T("budget එක 150000", { maxPrice: 150000, profile: { budgetMax: 150000 } }),
  ]),
  S("d-m03", "mixed", ["price"], [T("Lumen P3 Ultra එකේ price එක කීයද", { intent: "price_inquiry", refers: "ph03" })]),
  S("d-m04", "mixed", ["stock"], [T("Kite K1 stock එකේ තියෙනවද", { intent: "stock_check", tools: ["check_stock"] })]),
  S("d-m05", "mixed", ["accessories"], [T("power bank එකක් තියෙනවද", { containsIds: ["ac05", "ac06"] })]),
  S("d-m06", "mixed", ["greeting"], [T("hi කොහොමද", { intent: "greeting", tools: [], noCards: true })]),
  S("d-m07", "mixed", ["brand"], [T("Samsung phone එකක් තියෙනවද", { brand: "Samsung", containsIds: ["ph08", "ph09"] })]),
  S("d-m08", "mixed", ["reference"], [
    T("phone එකක් පෙන්වන්න 100000 ට අඩු", { minCards: 2 }),
    T("second one එකේ price එක කීයද", { intent: "price_inquiry", refersIndex: 2 }),
  ]),
];
