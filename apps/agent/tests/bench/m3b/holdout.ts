import { mk, type M3BCase } from "./types";

/**
 * HOLDOUT set: written AFTER the M3-B rules were frozen, run once, never used for tuning. It deliberately mixes plain requests with
 * tricky ones: general-sounding sentences that carry a shopping anchor, shopping-sounding sentences that are not shopping, long vowels,
 * split question particles, and polite or indirect wording. Same author as the router, so still not independent: it is the best
 * estimate available before native speakers write and review a set (see docs/AI_M3B_NATIVE_REVIEW_PACK.md).
 */
const si = mk("hold", "si");
const sl = mk("hold", "singlish");
const en = mk("hold", "en");
const mx = mk("hold", "mixed");

export const HOLDOUT: readonly M3BCase[] = Object.freeze([
  // ---------------- Sinhala script
  si("සාමාන්‍ය මිලකට හොඳ ලැප්ටොප් එකක් තියෙනවද බලන්න", "search_products", "long"),
  si("මේ ෆෝන් එකේ ගබඩා ධාරිතාව කීයද", "get_product_details", "paraphrase", { referent: true }),
  si("කළු එකයි සුදු එකයි දෙකෙන් කුමක් ගන්නද", "compare_products", "paraphrase"),
  si("මේක තවම විකුණන්න තියෙනවද", "check_stock", "paraphrase", { referent: true }),
  si("ඒකේ බැක් කවර් එකක් තියෙනවද", "get_accessories", "short"),
  si("කරත්තයට එකක් එකතු කරන්න", "cart_add", "short"),
  si("මගේ කරත්තය හිස් කරන්න ඕන", "cart_remove", "paraphrase"),
  si("ඇණවුම කොහොමද ට්‍රැක් කරන්නේ", "order_status", "plain"),
  si("මගේ ඇණවුම වෙනස් කරන්න ඕන", "order_support", "paraphrase"),
  si("ගෙවීම් කරන්නේ කොහොමද", "checkout_handoff", "plain"),
  si("බෙදාහැරීමට ගාස්තුවක් අය කරනවද", "store_info", "paraphrase", { topic: "delivery_charge" }),
  si("නිෂ්පාදකයාගේ වගකීම් කාලය කොච්චරද", "website_policy", "paraphrase"),
  si("ඔයා කවුද", "smalltalk", "short"),
  si("ගණිතය පැහැදිලි කරලා දෙන්න", "general", "negative"),
  si("වෙන වෙබ් අඩවියක මේ ෆෝන් එක තියෙනවද බලන්න", "external_site", "negative"),

  // ---------------- Singlish
  sl("sadharana milakata honda laptop ekak thiyenawada balanna", "search_products", "long"),
  sl("me phone eke storage eka keeyada", "get_product_details", "typo", { referent: true }),
  sl("kalu ekayi sudu ekayi deken monawada ganna", "compare_products", "paraphrase"),
  sl("meka thawama sale karanawada", "check_stock", "paraphrase", { referent: true }),
  sl("eke back cover ekak thiyenawada", "get_accessories", "short"),
  sl("cart ekata ekak ekathu karanna", "cart_add", "short"),
  sl("mage cart eka empty karanna one", "cart_remove", "paraphrase"),
  sl("order eka track karanne kohomada", "order_status", "plain"),
  sl("mage order eka wenas karanna one", "order_support", "paraphrase"),
  sl("gewim karanne kohomada", "checkout_handoff", "plain"),
  sl("delivery walata gaanak ayada karanawada", "store_info", "paraphrase", { topic: "delivery_charge" }),
  sl("karmaanthashalawe warranty kalaya kiyada", "website_policy", "paraphrase"),
  sl("oya kauda", "smalltalk", "short"),
  sl("ganithaya pahadili karala denna", "general", "negative"),
  sl("wena website ekaka me phone eka thiyenawada balanna", "external_site", "negative"),

  // ---------------- English
  en("Could you recommend a laptop that's good value?", "search_products", "long"),
  en("what's the storage capacity of that phone", "get_product_details", "paraphrase", { referent: true }),
  en("black or white, which one should I go for", "compare_products", "paraphrase"),
  en("is this still being sold", "check_stock", "paraphrase", { referent: true }),
  en("any back covers for it?", "get_accessories", "short"),
  en("add one to my basket", "cart_add", "short"),
  en("empty my cart please", "cart_remove", "paraphrase"),
  en("how do I follow my order", "order_status", "plain"),
  en("I need to change my order", "order_support", "paraphrase"),
  en("how do I make the payment", "checkout_handoff", "plain"),
  en("do you charge for delivery?", "store_info", "paraphrase", { topic: "delivery_charge" }),
  en("how long is the manufacturer's warranty", "website_policy", "paraphrase"),
  en("who are you", "smalltalk", "short"),
  en("explain algebra to me", "general", "negative"),
  en("see if another website has this phone cheaper", "external_site", "negative"),

  // ---------------- Mixed
  mx("sadharana price එකට හොඳ laptop එකක් තියෙනවද බලන්න", "search_products", "long"),
  mx("මේ phone එකේ storage capacity එක කීයද", "get_product_details", "paraphrase", { referent: true }),
  mx("black එකයි white එකයි දෙකෙන් මොකක්ද ගන්නේ", "compare_products", "paraphrase"),
  mx("මේක තවම sale කරනවද", "check_stock", "paraphrase", { referent: true }),
  mx("ඒකට back cover එකක් තියෙනවද", "get_accessories", "short"),
  mx("cart එකට එකක් add කරන්න", "cart_add", "short"),
  mx("මගේ cart එක empty කරන්න ඕන", "cart_remove", "paraphrase"),
  mx("order එක follow කරන්නේ කොහොමද", "order_status", "plain"),
  mx("මගේ order එක change කරන්න ඕන", "order_support", "paraphrase"),
  mx("payment එක කරන්නේ කොහොමද", "checkout_handoff", "plain"),
  mx("delivery එකට charge කරනවද", "store_info", "paraphrase", { topic: "delivery_charge" }),
  mx("manufacturer warranty එක කොච්චර කාලයක්ද", "website_policy", "paraphrase"),
  mx("ඔයා කවුද bro", "smalltalk", "short"),
  mx("algebra එක මට explain කරන්න", "general", "negative"),
  mx("වෙන website එකක මේ phone එක cheap ද බලන්න", "external_site", "negative"),

  // ---------------- Tricky: scope boundaries (group = the script they are written in)
  en("Write a short description for my phone listing", "general", "negative"),
  en("explain how the battery of this phone works", "get_product_details", "negative", { referent: true }),
  en("what is the difference between RAM and storage", "general", "negative"),
  en("tell me a story about a phone", "general", "negative"),
  en("what is a good phone for a student under 80000", "search_products", "negative", { maxPriceLkr: 80000 }),
  mx("phone එකක් ගැන poem එකක් ලියන්න", "general", "negative"),
  mx("මේ phone එකේ battery එක ගැන explain කරන්න", "get_product_details", "negative", { referent: true }),
  sl("phone eka gana kathandaraya liyanna", "general", "negative"),
  sl("meke battery eka explain karanna", "get_product_details", "negative", { referent: true }),
  en("Open the VOLTA.LK warranty page", "website_policy", "negative"),
]);
