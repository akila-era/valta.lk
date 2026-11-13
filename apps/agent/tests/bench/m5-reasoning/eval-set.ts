import { CAT, type Expect, type Scenario, type Turn } from "./types";
import type { ConvLang } from "../m4-conversation/types";

/**
 * EVAL (M5): the independent evaluation set. It was written BEFORE the reasoning layer was measured and is never used for tuning;
 * its SHA-256 is recorded in frozen-hashes.json and a test fails if it changes. Author-written, not native-reviewed, on the invented
 * fixture catalogue (tests/fixtures/rich-catalogue.ts). Expectations come from the fixture and the intended behaviour, not from running
 * the system.
 */
const T = (say: string, expect: Expect = {}, extra: Partial<Turn> = {}): Turn => ({ say, expect, ...extra });
const S = (id: string, lang: ConvLang, tags: string[], turns: Turn[]): Scenario => ({ id, lang, tags, turns });

export const EVAL: readonly Scenario[] = [
  // ================= English
  S("e01", "en", ["discovery", "budget", "camera"], [
    T("I want a phone with a good camera under 150000", { intent: "shopping_search", tools: ["search_products"], profile: { category: CAT.phones, budgetMax: 150000, usage: ["camera"] }, topAmong: ["ph02", "ph05"], maxPrice: 150000, fitHas: ["best_camera"] }),
  ]),
  S("e02", "en", ["discovery", "questions", "gaming"], [
    T("show me phones", { intent: "shopping_search", ask: "budget", minCards: 1 }),
    T("150000", { tools: ["search_products"], profile: { category: CAT.phones, budgetMax: 150000 }, ask: "usage", maxPrice: 150000 }),
    T("gaming", { profile: { usage: ["gaming"] }, topId: "ph06", noAsk: true, maxPrice: 150000 }),
  ]),
  S("e03", "en", ["discovery", "programming"], [
    T("laptop for programming under 300000", { intent: "shopping_search", profile: { category: CAT.laptops, budgetMax: 300000, usage: ["programming"] }, topId: "lp06", maxPrice: 300000 }),
  ]),
  S("e04", "en", ["questions", "gaming"], [
    T("gaming laptop", { ask: "budget", minCards: 1, profile: { category: CAT.laptops, usage: ["gaming"] } }),
    T("300000", { topId: "lp06", noAsk: true, maxPrice: 300000, profile: { budgetMax: 300000, usage: ["gaming"] } }),
  ]),
  S("e05", "en", ["sort"], [T("cheapest laptop", { topId: "lp07", noAsk: true, category: CAT.laptops })]),
  S("e06", "en", ["comparison"], [
    T("show me laptops", { minCards: 2 }),
    T("compare these two", { intent: "product_comparison", tools: ["compare_products"], comparison: 2 }),
  ]),
  S("e07", "en", ["reference"], [
    T("show me phones", { minCards: 2 }),
    T("tell me about the second one", { tools: ["get_product_details"], refersIndex: 2 }),
  ]),
  S("e08", "en", ["reference", "opinion"], [
    T("tell me about Lumen P2 Pro", { tools: ["get_product_details"], refers: "ph02" }),
    T("is it worth it?", { intent: "general_conversation", template: "opinion_facts", refers: "ph02", tools: ["get_product_details"] }),
  ]),
  S("e09", "en", ["context", "budget"], [
    T("phones under 100000", { maxPrice: 100000, profile: { budgetMax: 100000 } }),
    T("show me the cheapest", { maxPrice: 100000, topId: "ph10", profile: { budgetMax: 100000, category: CAT.phones } }),
  ]),
  S("e10", "en", ["context-switch"], [
    T("phones under 100000 for camera", { profile: { category: CAT.phones, budgetMax: 100000, usage: ["camera"] } }),
    T("show me laptops", { category: CAT.laptops, profile: { category: CAT.laptops, noBudget: true } }),
  ]),
  S("e11", "en", ["brand", "context"], [
    T("I want a phone with a good camera under 150000", { profile: { budgetMax: 150000, usage: ["camera"] } }),
    T("is Samsung good?", { tools: ["search_products"], template: "brand_advice", brand: "Samsung", maxPrice: 150000, containsIds: ["ph08"], excludesIds: ["ph09"], profile: { category: CAT.phones } }),
  ]),
  S("e12", "en", ["no-match", "budget"], [
    T("do you have a phone for under 20000", { template: "no_match_alternatives", minCards: 1, category: CAT.phones, fitOf: { id: "ph10", tradeoffs: ["over_budget"] } }),
  ]),
  S("e13", "en", ["no-match", "brand"], [T("show me Xiaomi phones", { template: "no_match_alternatives", minCards: 1, category: CAT.phones })]),
  S("e14", "en", ["questions"], [T("what is the best phone", { ask: "budget", minCards: 1 })]),
  S("e15", "en", ["accessories"], [T("I need a charger", { tools: ["search_products"], containsIds: ["ac01"], noAsk: true })]),
  S("e16", "en", ["accessories", "questions"], [
    T("show me accessories", { ask: "device", minCards: 1 }),
    T("Lumen P2 Pro", { intent: "accessory_compatibility", tools: ["get_accessories"], template: "no_accessories" }),
  ]),
  S("e17", "en", ["accessories"], [T("power bank", { containsIds: ["ac05", "ac06"], excludesIds: ["ac01"], noAsk: true })]),
  S("e18", "en", ["general"], [T("what is RAM", { intent: "general_knowledge", tools: [], noCards: true })]),
  S("e19", "en", ["general"], [T("explain AMOLED versus LCD", { intent: "general_knowledge", tools: [], noCards: true })]),
  S("e20", "en", ["greeting", "discovery"], [
    T("hello", { intent: "greeting", tools: [], noCards: true }),
    T("I need a laptop for office work under 150000", { topAmong: ["lp07", "lp01"], profile: { usage: ["office"], budgetMax: 150000 }, maxPrice: 150000 }),
  ]),
  S("e21", "en", ["stock"], [T("is the Kite K0 in stock", { intent: "stock_check", tools: ["check_stock"] })]),
  S("e22", "en", ["price"], [T("how much is the Zenix Z9 Gamer", { intent: "price_inquiry", refers: "ph06" })]),
  S("f01", "en", ["questions", "gaming", "context"], [
    T("show me laptops", { ask: "budget" }),
    T("gaming", { profile: { usage: ["gaming"] }, topId: "lp06", noAsk: true }),
    T("300000", { topId: "lp06", maxPrice: 300000, profile: { budgetMax: 300000, usage: ["gaming"] } }),
  ]),
  S("f02", "en", ["accessories", "reference"], [
    T("tell me about Lumen P2 Pro", { refers: "ph02" }),
    T("do you have a case for it", { tools: ["get_accessories"], template: "no_accessories" }),
  ]),
  S("f03", "en", ["follow-up"], [
    T("show me phones under 100000", { maxPrice: 100000 }),
    T("which one has the best camera", { profile: { usage: ["camera"] }, topId: "ph02" }),
  ]),
  S("f04", "en", ["brand", "context"], [
    T("phone ekak oni", { ask: "budget" }),
    T("samsung ekak nadda", { brand: "Samsung", containsIds: ["ph08", "ph09"] }),
  ]),
  // ================= Singlish
  S("s01", "singlish", ["discovery", "budget", "camera"], [
    T("mata camera eka hondai phone ekak oni 150000 ta adu", { intent: "shopping_search", profile: { category: CAT.phones, budgetMax: 150000, usage: ["camera"] }, topAmong: ["ph02", "ph05"], maxPrice: 150000 }),
  ]),
  S("s02", "singlish", ["questions", "gaming"], [
    T("gaming laptop ekak oni", { ask: "budget", minCards: 1 }),
    T("250000", { topId: "lp06", maxPrice: 250000, noAsk: true }),
  ]),
  S("s03", "singlish", ["questions", "camera"], [
    T("phone ekak pennanna", { ask: "budget" }),
    T("100000 ta adu", { ask: "usage", maxPrice: 100000 }),
    T("camera", { topId: "ph02", noAsk: true, profile: { usage: ["camera"], budgetMax: 100000 } }),
  ]),
  S("s04", "singlish", ["brand", "context"], [
    T("phone ekak oni 150000 ta adu camera ekata", { profile: { category: CAT.phones, budgetMax: 150000, usage: ["camera"] } }),
    T("Samsung hodaida?", { template: "brand_advice", brand: "Samsung", maxPrice: 150000, containsIds: ["ph08"], profile: { category: CAT.phones, budgetMax: 150000 } }),
  ]),
  S("s05", "singlish", ["reference", "opinion"], [
    T("laptop ekak pennanna", { minCards: 2 }),
    T("eka hondada?", { intent: "general_conversation", template: "opinion_facts", refersIndex: 1 }),
  ]),
  S("s06", "singlish", ["reference", "price"], [
    T("phone ekak pennanna", { minCards: 2 }),
    T("deweni eka kiyada", { intent: "price_inquiry", refersIndex: 2 }),
  ]),
  S("s07", "singlish", ["reference", "stock"], [
    T("laptop ekak oni", { minCards: 2 }),
    T("palaweni eka stock eke thiyenawada", { intent: "stock_check", tools: ["check_stock"] }),
  ]),
  S("s08", "singlish", ["typo", "accessories"], [T("power banak nadd", { containsIds: ["ac05", "ac06"], tools: ["search_products"] })]),
  S("s09", "singlish", ["accessories"], [T("charger ekak nadda", { containsIds: ["ac01"], noAsk: true })]),
  S("s10", "singlish", ["accessories", "reference"], [
    T("Lumen P2 Pro eka kiyada", { refers: "ph02" }),
    T("mekata case ekak thiyenawada", { intent: "accessory_compatibility", tools: ["get_accessories"], template: "no_accessories" }),
  ]),
  S("s11", "singlish", ["reference", "opinion"], [
    T("phone ekak pennanna", { minCards: 2 }),
    T("ara eka hondada", { template: "opinion_facts", intent: "general_conversation" }),
  ]),
  S("s12", "singlish", ["clarification"], [T("monawada thiyenne", { intent: "clarification", tools: [], noCards: true })]),
  S("s13", "singlish", ["greeting", "discovery"], [
    T("kohomada", { intent: "greeting", tools: [], noCards: true }),
    T("phone ekak oni", { ask: "budget", minCards: 1 }),
  ]),
  S("s14", "singlish", ["budget", "gaming"], [T("300000 ta adu gaming laptop ekak", { topId: "lp06", maxPrice: 300000, profile: { budgetMax: 300000, usage: ["gaming"] } })]),
  S("s15", "singlish", ["conversation"], [
    T("phone ekak pennanna", { minCards: 1 }),
    T("ok", { intent: "general_conversation", tools: [], noCards: true }),
  ]),
  S("s16", "singlish", ["conversation"], [T("udaw karanna puluwanda", { intent: "general_conversation", tools: [], noCards: true })]),
  // ================= Sinhala script
  S("si01", "si", ["discovery", "budget", "camera"], [
    T("මට camera එක හොඳ phone එකක් ඕන 150000 ට අඩු", { intent: "shopping_search", profile: { category: CAT.phones, budgetMax: 150000, usage: ["camera"] }, topAmong: ["ph02", "ph05"] }),
  ]),
  S("si02", "si", ["discovery", "questions"], [T("ලැප්ටොප් එකක් පෙන්වන්න", { intent: "shopping_search", ask: "budget", category: CAT.laptops })]),
  S("si03", "si", ["questions", "camera"], [
    T("phone පෙන්වන්න", { ask: "budget" }),
    T("100000 ට අඩු", { maxPrice: 100000, profile: { budgetMax: 100000 } }),
    T("කැමරාව", { topId: "ph02", profile: { usage: ["camera"] } }),
  ]),
  S("si04", "si", ["cart"], [T("මගේ cart එක බලන්න", { intent: "cart_query", tools: ["get_cart"] })]),
  S("si05", "si", ["conversation"], [T("ස්තූතියි", { intent: "general_conversation", tools: [], noCards: true })]),
  S("si06", "si", ["reference", "price"], [
    T("phone එකක් පෙන්වන්න", { minCards: 2 }),
    T("දෙවෙනි එකේ මිල කීයද", { intent: "price_inquiry", refersIndex: 2 }),
  ]),
  S("si07", "si", ["conversation"], [T("ඔයාට උදව් කරන්න පුළුවන්ද", { intent: "general_conversation", tools: [], noCards: true })]),
  S("si08", "si", ["general"], [T("ඩොලර් එක කීයද", { intent: "general_knowledge", tools: [], noCards: true })]),
  S("si09", "si", ["brand"], [T("Samsung phone එකක් තියෙනවද", { brand: "Samsung", containsIds: ["ph08", "ph09"], noAsk: true })]),
  S("si10", "si", ["discovery", "gaming"], [T("ගේම් වලට laptop එකක් ඕන", { ask: "budget", category: CAT.laptops, profile: { usage: ["gaming"] } })]),
  // ================= Mixed
  S("m01", "mixed", ["price"], [T("Zenix Z9 Gamer එකේ price එක කීයද", { intent: "price_inquiry", refers: "ph06" })]),
  S("m02", "mixed", ["stock"], [T("Lumen P2 Pro stock එකේ තියෙනවද", { intent: "stock_check", tools: ["check_stock"] })]),
  S("m03", "mixed", ["context", "budget"], [
    T("camera phone එකක් ඕන", { profile: { usage: ["camera"], category: CAT.phones } }),
    T("budget එක 100000", { topId: "ph02", maxPrice: 100000, profile: { budgetMax: 100000, usage: ["camera"] } }),
  ]),
  S("m04", "mixed", ["questions", "office"], [
    T("laptop එකක් ඕන", { ask: "budget" }),
    T("office වැඩ වලට", { profile: { usage: ["office"], category: CAT.laptops }, noAsk: true }),
  ]),
  S("m05", "mixed", ["greeting", "discovery"], [T("hi මට phone එකක් ඕන", { ask: "budget", minCards: 1, category: CAT.phones })]),
  S("m06", "mixed", ["conversation"], [T("thanks ස්තූතියි", { intent: "general_conversation", tools: [], noCards: true })]),
  // ================= Context switching, ambiguity, missing or incorrect catalogue information
  S("x01", "en", ["context-switch", "budget"], [
    T("show me phones", { minCards: 1 }),
    T("show me laptops", { category: CAT.laptops }),
    T("100000 ta adu", { category: CAT.laptops, containsIds: ["lp07"], excludesIds: ["lp01"], profile: { category: CAT.laptops, budgetMax: 100000 } }),
  ]),
  S("x02", "singlish", ["context-switch", "questions"], [
    T("laptop ekak oni", { ask: "budget" }),
    T("phone ekak oni", { ask: "budget", category: CAT.phones, profile: { category: CAT.phones, noBudget: true } }),
  ]),
  S("x03", "en", ["ambiguous"], [T("asdfgh", { intent: "unknown", tools: [], noCards: true })]),
  S("x05", "en", ["discovery", "battery"], [T("I want a phone with the best battery", { ask: "budget", topId: "ph06", fitHas: ["best_battery"], profile: { usage: ["battery"] } })]),
  S("x06", "en", ["discovery", "camera"], [T("phone with good camera", { ask: "budget", topAmong: ["ph03", "ph09"], fitHas: ["best_camera"] })]),
  S("x07", "en", ["missing-data", "camera"], [
    T("phone with good camera under 80000", { topId: "ph01", fitOf: { id: "ph07", tradeoffs: ["no_camera_data"] }, maxPrice: 80000 }),
  ]),
  S("x09", "en", ["description-data", "battery"], [T("phone with a big battery under 120000", { topAmong: ["ph01", "ph02"], maxPrice: 120000, fitHas: ["best_battery"] })]),
  S("x10", "en", ["stock"], [T("show me Kite phones", { brand: "Kite", containsIds: ["ph10"], excludesIds: ["ph11"], noAsk: true })]),
  S("x12", "en", ["stock"], [T("is Kite K0 available", { intent: "stock_check", tools: ["check_stock"] })]),
  S("x13", "en", ["comparison"], [T("compare Lumen P2 Pro and Samsung Test A1", { intent: "product_comparison", tools: ["compare_products"], comparison: 2 })]),
  S("x15", "en", ["erp-down"], [T("show me phones", { template: "tool_failed", noCards: true }, { setup: "erp_down" })]),
  S("x17", "en", ["sort"], [T("cheapest phone", { topId: "ph10", noAsk: true })]),
  S("x20", "en", ["sort"], [T("most expensive laptop", { topId: "lp04", noAsk: true })]),
  S("c01", "en", ["cart", "reference"], [
    T("show me laptops", { minCards: 2 }),
    T("add the second one to my cart", { intent: "cart_query", cartAddIndex: 2 }),
  ]),
];
