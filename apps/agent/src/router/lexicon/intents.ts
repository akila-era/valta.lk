import type { Intent } from "../types";

/**
 * Weighted cue phrases per intent. PROVISIONAL, engineer-drafted, `needsNativeReview` (see meta.ts).
 *
 * Weights: 4 = decisive phrase, 3 = strong, 2 = medium, 1 = weak.
 * Matching rules (see cues.ts): a Latin phrase must match whole words; a Sinhala phrase matches as a substring; a phrase ending in
 * "*" is a word prefix; a phrase starting with "!" cancels the whole group when present.
 * The lexicon text is normalised the same way as user text, so writing a Sinhala conjunct with or without a joiner is fine.
 */
export interface CueGroup {
  w: number;
  p: string[];
}

export const INTENT_CUES: Record<Exclude<Intent, "unknown">, CueGroup[]> = {
  search_products: [
    { w: 3, p: ["show me", "find me", "looking for", "i need", "i want", "i am looking", "suggest", "recommend", "hoyanna", "pennanna", "which phone", "which phones", "what phones", "which smartphone", "wadiya hodama", "ganna one", "ganna oni", "ganna ona", "balanna one", "පෙන්වන්න", "හොයන්න", "හොයලා දෙන්න", "ගන්න ඕන", "ගන්න ඕනේ", "ගන්න ඕනෙ", "මොනවාද තියෙන්නේ", "do you have", "have any", "any phones", "i d like", "i would like", "would like to see", "let me see", "see some", "මොන phone", "මොන ෆෝන්", "onee", "denna", "ekak denna", "dennako", "mata denna", "ganna puluwan", "ganna puluwanda", "ganna puluwandha", "hoyala denna", "hoyaganna", "walata mila", "wala mila", "mila monawada", "mila range", "ගන්න පුළුවන්"] },
    { w: 3, p: ["තියෙනවද", "තියෙනවාද", "තියේද", "නැද්ද", "නැතිද", "thiyenawada", "thiyanawada", "tiyenawada"] },
    { w: 2, p: ["under", "below", "less than", "upto", "up to", "within", "budget", "cheap", "cheapest", "best", "good", "latest", "newest", "popular", "බජට්", "අඩු", "හොඳ", "ලාභ", "ලාභම", "අලුත්", "අලුත්ම", "adu", "hodama", "honda", "rupees", "රුපියල්", "rs", "lkr", "on sale", "sale", "discount", "discounts", "offers", "offer", "වට්ටම්", "වට්ටමක්", "ඕන", "ඕනේ", "ඕනෙ", "balanna", "oni", "ona"] },
  ],
  get_product_details: [
    { w: 4, p: ["tell me about", "more about", "about the", "about this", "details of", "details about", "specs", "specifications", "spec", "features", "විශේෂාංග", "විස්තර", "ගැන කියන්න", "gana kiyanna", "specs mokakda", "specs monawada"] },
    { w: 3, p: ["how much is", "how much does", "price of", "what is the price", "price", "how much", "cost", "costs", "kiyada", "කීයද", "මිල", "camera", "battery", "display", "screen", "ram", "storage", "processor", "chipset", "warranty", "weight", "colours", "colors", "කැමරා", "බැටරි", "තිරය", "රැම්", "ගබඩා", "වගකීම", "වර්ණ"] },
  ],
  compare_products: [
    { w: 4, p: ["compare", "comparison", "versus", "vs", "difference between", "differences between", "which is better", "which one is better", "better than", "which is cheaper", "cheaper than", "දෙකෙන්", "වෙනස", "සසඳ", "wenasa", "!වෙනස් කරන්න", "!වෙනස් කිරීම"] },
  ],
  check_stock: [
    { w: 4, p: ["in stock", "out of stock", "stock", "availability", "is it available", "available", "තොග", "තොගේ", "තොගයේ", "තොගයක්", "stock eke", "stock eka", "stock ekak", "come in", "comes in", "available in"] },
    { w: 2, p: ["තියෙනවද", "තියෙනවාද", "තියේද", "thiyenawada", "thiyanawada", "tiyenawada", "do you have", "have"] },
  ],
  get_accessories: [
    { w: 4, p: ["accessories", "accessory", "compatible with", "compatible", "goes with", "fits", "fit the", "fit my", "screen protector", "tempered glass", "back cover", "phone case", "case for", "charger for", "cable for", "cover for", "ekata charger", "ekata case", "ekata cable", "ekata cover", "ekata protector", "එකට case", "එකට charger", "එකට cover", "එකට cable", "එකට screen", "එකට කේස්", "ගැළපෙන", "ගැලපෙන"] },
    { w: 3, p: ["case", "cover", "charger", "cable", "protector", "power bank", "adaptor", "adapter", "කේස්", "කවරය", "චාජර්", "කේබල්", "ආරක්ෂක"] },
  ],
  cart_add: [
    { w: 4, p: ["add to cart", "add to my cart", "add it to cart", "add this to cart", "add this to my cart", "add it to my cart", "add to basket", "put in cart", "put it in my cart", "cart ekata danna", "cart ekata dapan", "cart ekata ekathu karanna", "basket ekata danna", "cart එකට දාන්න", "cart එකට දාපන්", "cart එකට එකතු", "කාට් එකට", "කාර්ට් එකට", "ekathu karanna", "එකතු කරන්න", "i want to buy", "want to buy", "would like to buy", "buy this", "buy it", "i ll take", "i will take", "take this", "take it", "මේක ගන්නම්", "ගන්නම්"] },
    { w: 3, p: ["add"] },
    { w: 1, p: ["cart", "කාට්", "basket"] },
  ],
  cart_remove: [
    { w: 4, p: ["remove from cart", "remove from my cart", "remove it from cart", "delete from cart", "take out of cart", "cart eken ain karanna", "cart eken ain", "cart එකෙන් අයින් කරන්න", "cart එකෙන් ඉවත් කරන්න", "cart එකෙන් අයින්", "cart එකෙන් ඉවත්", "කාට් එකෙන්"] },
    { w: 4, p: ["remove", "ain karanna", "අයින් කරන්න", "ඉවත් කරන්න", "delete"] },
    { w: 1, p: ["cart", "කාට්", "basket"] },
  ],
  cart_update_quantity: [
    { w: 4, p: ["change quantity", "update quantity", "set quantity", "change the quantity", "quantity to", "ප්‍රමාණය"] },
    { w: 3, p: ["quantity", "qty"] },
    { w: 2, p: ["make it"] },
  ],
  cart_view: [
    { w: 4, p: ["show my cart", "show cart", "view cart", "view my cart", "open my cart", "what s in my cart", "what is in my cart", "whats in my cart", "cart total", "cart eka pennanna", "cart eka balanna", "mage cart eka", "cart eke monawada", "cart එක පෙන්වන්න", "cart එක බලන්න", "cart එකේ මොනවාද", "cart එකේ ඇති", "කාට් එක පෙන්වන්න"] },
    { w: 3, p: ["my cart", "මගේ cart", "cart eke", "cart එකේ"] },
    { w: 1, p: ["cart", "කාට්", "basket"] },
  ],
  order_status: [
    { w: 4, p: ["where is my order", "where s my order", "where can i see my order", "track my order", "track order", "track my parcel", "order status", "status of my order", "my order status", "order eka koheda", "order eka track", "order eka kohomada", "mage order", "order eka balanna", "ඇණවුම කොහෙද", "ඇණවුමේ තත්ත්වය", "මගේ ඇණවුම", "order එක කොහෙද", "order එක track", "order එකේ තත්ත්වය", "ඕඩර් එක කොහෙද", "ඇණවුම track", "ඇණවුම බලන්න", "මගේ order"] },
    { w: 2, p: ["order", "orders", "ඇණවුම", "ඇණවුමේ", "ඕඩර්", "track", "tracking", "parcel", "status", "කොහෙද", "තත්ත්වය", "koheda", "kohed", "kohe"] },
    { w: 4, p: ["has not arrived", "hasn t arrived", "not arrived", "not received", "haven t received", "didn t arrive", "still waiting"] },
  ],
  order_support: [
    { w: 4, p: ["cancel my order", "cancel order", "cancel the order", "cancel this order", "refund", "return my order", "return this", "change my address", "change delivery address", "replace my order", "exchange", "order eka cancel", "refund eka", "ඇණවුම අවලංගු", "අවලංගු කරන්න", "ආපසු දෙන්න", "ආපසු ගෙවන්න", "cancel", "cancel karanna"] },
  ],
  checkout_handoff: [
    { w: 4, p: ["checkout", "check out", "place order", "place an order", "place my order", "pay now", "proceed to payment", "complete my order", "can i pay", "how to pay", "how do i pay", "buy now", "order karanna", "order eka karanna", "order ekak", "payment karanna", "ඇණවුම් කරන්න", "ඇණවුමක් කරන්න", "ඇණවුමක් දාන්න", "ඇණවුම දාන්න", "ගෙවීම් කරන්න"] },
    { w: 3, p: ["ගෙවන්න"] },
    { w: 2, p: ["pay", "payment", "ගෙවීම"] },
  ],
  store_info: [
    { w: 4, p: ["delivery charge", "delivery fee", "delivery cost", "shipping cost", "shipping fee", "shipping charge", "how much is delivery", "how much for delivery", "delivery kiyada", "delivery charge eka", "delivery eka kiyada", "delivery ගාස්තු", "ඩිලිවරි ගාස්තු", "ඩිලිවරි කීයද", "delivery කීයද", "free delivery", "delivery free", "how many days for delivery", "delivery time", "how long for delivery", "delivery days", "කොහෙද තියෙන්නේ", "where are you", "where is your shop", "ඔයාලගේ shop", "ඔයාලගේ කඩේ", "cod", "cash on delivery", "do you ship", "ship to", "deliver to", "do you deliver"] },
    { w: 3, p: ["delivery", "shipping", "courier", "ඩිලිවරි", "return policy", "returns policy", "exchange policy", "opening hours", "open hours", "business hours", "contact", "contact number", "address", "location", "your shop", "your store", "shop eka", "කඩේ", "payment methods", "do you accept", "ගෙවීම් ක්‍රම"] },
  ],
  smalltalk: [
    { w: 4, p: ["hi", "hello", "hey", "hiya", "good morning", "good afternoon", "good evening", "thanks", "thank you", "thx", "bye", "goodbye", "see you", "ayubowan", "ආයුබෝවන්", "හායි", "හෙලෝ", "ස්තූතියි", "ස්තුතියි", "istuti", "sthuthi", "who are you", "what can you do", "what do you do", "how can you help", "ඔබ කවුද", "ඔයා කවුද", "umba kauda", "oya kauda", "මොනවද කරන්නේ", "ශුභ උදෑසන", "ශුභ සන්ධ්‍යාවක්", "ඔයාගේ නම", "ඔබේ නම", "your name", "what is your name", "how are you", "how r u", "sinhalen katha", "sinhala katha", "sinhalen puluwan", "sinhala puluwan", "speak sinhala", "sinhala support", "singlish", "සිංහලෙන් කතා", "සිංහලෙන් පුළුවන්", "oyata mokada karanna puluwan", "oyata mokakda karanna puluwan", "oyata mokak karanna puluwan", "oyata mond karann puluwn", "oyata mond karanna puluwan", "mokada karanna puluwan", "mokakda karanna puluwan", "mond karanna puluwan", "oyata mokada karanne", "ඔයාට මොනවද කරන්න පුළුවන්", "ඔයාට මොනවා කරන්න පුළුවන්", "මොනවද කරන්න පුළුවන්"] },
    { w: 3, p: ["kohomada", "kohomd", "kohomda", "kohoma da", "kohomada ado", "පිං", "help me", "උදව්", "උදව්වක්", "උදව් කරන්න"] },
    { w: 2, p: ["can you help", "help"] },
    { w: 1, p: ["කොහොමද"] },
  ],
};

/** Words that make a question about availability ("is there...?") rather than a command. Used to separate search from stock checks. */
export const AVAILABILITY_PHRASES = ["තියෙනවද", "තියෙනවාද", "තියේද", "thiyenawada", "thiyanawada", "tiyenawada", "do you have", "have any", "තියෙන්නේ", "නැද්ද", "නැතිද"];
/** Words that, with a named product, mean the shopper wants a stock check even if a search cue is also present. */
export const COMPATIBILITY_PHRASES = ["compatible", "goes with", "fits", "fit the", "fit my", "ගැළපෙන", "ගැලපෙන", "ekata charger", "ekata case", "ekata cable", "ekata cover", "ekata protector", "එකට case", "එකට charger", "එකට cover", "එකට cable", "එකට screen", "charger for", "case for", "cable for", "cover for"];
export const EXPLICIT_STOCK_PHRASES = ["stock", "in stock", "out of stock", "availability", "available", "තොග", "තොගේ", "තොගයේ", "තොගයක්"];
/** A search needs one of these (or a budget) before an availability question about a brand becomes a search. */
export const DELIVERY_CHARGE_PHRASES = ["charge", "fee", "cost", "how much", "free", "kiyada", "කීයද", "කීයක්ද", "කීයක්", "ගාස්තු", "ගාස්තුව"];
