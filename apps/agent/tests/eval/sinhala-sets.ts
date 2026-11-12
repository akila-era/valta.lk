import type { Intent } from "../../src/router/types";
import { itemId } from "../fixtures/mock-vocab";

/**
 * DEVELOPER-AUTHORED routing sets. NOT an evaluation of Sinhala quality or production readiness.
 *
 * - The author wrote the router, the lexicon and these labels, so numbers from these sets are IN-SAMPLE by construction.
 * - SET_B was written (labels fixed) BEFORE the router existed, and its FIRST-RUN result was recorded before any tuning.
 *   After that first run it became development data too. A real held-out set needs independent native speakers (blocker B5).
 * - Vocabulary is the mock one (invented brands). Nothing here says anything about the real catalogue (blocker B2).
 * - Every Sinhala string in the lexicon and templates is provisional and flagged needsNativeReview.
 */
export interface Case {
  text: string;
  intent: Intent;
  tag: "si" | "mixed" | "singlish" | "en" | "abstain";
  /** Optional entity expectations. Only the listed fields are checked. */
  expect?: {
    maxPriceLkr?: number;
    minPriceLkr?: number;
    productIds?: string[];
    brand?: string;
    categorySlug?: string;
    quantity?: number;
    color?: string;
    sort?: "price-asc" | "price-desc" | "newest";
    onSale?: boolean;
    topic?: "delivery_charge" | "other";
    referent?: boolean;
    productAmbiguous?: boolean;
  };
}

const NOVA_X1 = itemId(1);
const ORBIT_PRO = itemId(2);

export const SET_A: Case[] = [
  { text: "රුපියල් 100,000ට අඩු හොඳ phone එකක් පෙන්වන්න", intent: "search_products", tag: "mixed", expect: { maxPriceLkr: 100000, categorySlug: "mobile-phones" } },
  { text: "Nova phone එකක් තියෙනවද?", intent: "search_products", tag: "mixed", expect: { brand: "Nova" } },
  { text: "Nova X1 එකේ camera එක කොහොමද?", intent: "get_product_details", tag: "mixed", expect: { productIds: [NOVA_X1] } },
  { text: "මේ phone එකේ specs මොනවාද?", intent: "get_product_details", tag: "mixed", expect: { referent: true } },
  { text: "Nova X1 සහ Orbit Pro අතර වෙනස මොකක්ද?", intent: "compare_products", tag: "mixed", expect: { productIds: [NOVA_X1, ORBIT_PRO] } },
  { text: "මේ දෙකෙන් මොකක්ද හොඳ?", intent: "compare_products", tag: "si", expect: { referent: true } },
  { text: "මේක දැන් තොගේ තියෙනවද?", intent: "check_stock", tag: "si", expect: { referent: true } },
  { text: "Black color එක stock එකේ තියෙනවද?", intent: "check_stock", tag: "mixed", expect: { color: "black" } },
  { text: "මේ phone එකට case එකක් සහ screen protector එකක් තියෙනවද?", intent: "get_accessories", tag: "mixed", expect: { referent: true } },
  { text: "ගැළපෙන charger එකක් කියන්න", intent: "get_accessories", tag: "mixed" },
  { text: "මේක cart එකට දාන්න", intent: "cart_add", tag: "mixed", expect: { referent: true } },
  { text: "cart එකෙන් charger එක අයින් කරන්න", intent: "cart_remove", tag: "mixed" },
  { text: "මගේ order එක කොහෙද?", intent: "order_status", tag: "mixed" },
  { text: "order එක track කරන්න ඕන", intent: "order_status", tag: "mixed" },
  { text: "Delivery charge කීයද?", intent: "store_info", tag: "mixed", expect: { topic: "delivery_charge" } },
  { text: "ආයුබෝවන්!", intent: "smalltalk", tag: "si" },
  { text: "ස්තූතියි", intent: "smalltalk", tag: "si" },
  { text: "ඔබ කවුද?", intent: "smalltalk", tag: "si" },
  { text: "මට ඇණවුම අවලංගු කරන්න ඕන", intent: "order_support", tag: "si" },
  { text: "ඇණවුමක් කරන්න ඕන", intent: "checkout_handoff", tag: "si" },
  { text: "Pulse earbuds වල මිල කීයද?", intent: "get_product_details", tag: "mixed", expect: { productIds: [itemId(3)] } },
  { text: "රුපියල් 50,000 ක budget එකකට හොඳ tablet එකක්", intent: "search_products", tag: "mixed", expect: { maxPriceLkr: 50000, categorySlug: "tablets" } },
  { text: "ලාභම phone එක මොකක්ද?", intent: "search_products", tag: "mixed", expect: { sort: "price-asc" } },
  { text: "අලුත්ම watch එක පෙන්වන්න", intent: "search_products", tag: "mixed", expect: { sort: "newest", categorySlug: "wearables" } },
  { text: "වට්ටම් තියෙන phones පෙන්වන්න", intent: "search_products", tag: "mixed", expect: { onSale: true } },
  { text: "cart එක පෙන්වන්න", intent: "cart_view", tag: "mixed" },
  { text: "charger එකේ ප්‍රමාණය 2 කරන්න", intent: "cart_update_quantity", tag: "mixed", expect: { quantity: 2 } },
  { text: "Atlas smartwatch එක 2ක් cart එකට දාන්න", intent: "cart_add", tag: "mixed", expect: { productIds: [itemId(8)], quantity: 2 } },
  { text: "මේ දෙක compare කරන්න", intent: "compare_products", tag: "mixed", expect: { referent: true } },
  { text: "Echo speaker එකේ battery කොච්චරද?", intent: "get_product_details", tag: "mixed", expect: { productAmbiguous: true } },
  { text: "phone ekak ganna one, budget eka 80000i", intent: "search_products", tag: "singlish", expect: { maxPriceLkr: 80000 } },
  { text: "meka stock eke thiyenawada?", intent: "check_stock", tag: "singlish", expect: { referent: true } },
  { text: "mage order eka koheda?", intent: "order_status", tag: "singlish" },
  { text: "meken ekata case ekak thiyenawada?", intent: "get_accessories", tag: "singlish" },
  { text: "cart ekata danna", intent: "cart_add", tag: "singlish" },
  { text: "delivery charge eka kiyada?", intent: "store_info", tag: "singlish", expect: { topic: "delivery_charge" } },
  { text: "hello kohomada", intent: "smalltalk", tag: "singlish" },
  { text: "Nova X1 ekata charger ekak thiyenawada", intent: "get_accessories", tag: "singlish", expect: { productIds: [NOVA_X1] } },
  { text: "Orbit Pro eka vs Nova X1 eka compare karanna", intent: "compare_products", tag: "singlish", expect: { productIds: [ORBIT_PRO, NOVA_X1] } },
  { text: "order eka cancel karanna one", intent: "order_support", tag: "singlish" },
  { text: "Show me phones under 150000 rupees", intent: "search_products", tag: "en", expect: { maxPriceLkr: 150000, categorySlug: "mobile-phones" } },
  { text: "Compare Nova X1 and Orbit Pro", intent: "compare_products", tag: "en", expect: { productIds: [NOVA_X1, ORBIT_PRO] } },
  { text: "Is the Nova X1 in stock?", intent: "check_stock", tag: "en", expect: { productIds: [NOVA_X1] } },
  { text: "What accessories fit the Nova X1?", intent: "get_accessories", tag: "en", expect: { productIds: [NOVA_X1] } },
  { text: "Add this to my cart", intent: "cart_add", tag: "en", expect: { referent: true } },
  { text: "Where is my order?", intent: "order_status", tag: "en" },
  { text: "How much is delivery?", intent: "store_info", tag: "en", expect: { topic: "delivery_charge" } },
  { text: "Hi", intent: "smalltalk", tag: "en" },
  { text: "I want to place an order", intent: "checkout_handoff", tag: "en" },
  { text: "Tell me about the Atlas Smartwatch", intent: "get_product_details", tag: "en", expect: { productIds: [itemId(8)] } },
  { text: "ඒක", intent: "unknown", tag: "abstain" },
  { text: "asdf qwerty", intent: "unknown", tag: "abstain" },
  { text: "What's the weather today?", intent: "unknown", tag: "abstain" },
  { text: "මට උදව්වක් ඕන", intent: "smalltalk", tag: "si" },
];

/** Labels fixed BEFORE the router was written. First-run score recorded in the M1-B report. */
export const SET_B: Case[] = [
  { text: "150000ට අඩු smartphone එකක් තියෙනවද", intent: "search_products", tag: "mixed", expect: { maxPriceLkr: 150000 } },
  { text: "Orbit Pro එකේ ram එක කීයද?", intent: "get_product_details", tag: "mixed", expect: { productIds: [ORBIT_PRO] } },
  { text: "Atlas Fitness Band එක තොගේ තියෙනවද?", intent: "check_stock", tag: "mixed", expect: { productIds: [itemId(9)] } },
  { text: "Volt power bank එකක් cart එකට දාන්න", intent: "cart_add", tag: "mixed", expect: { productIds: [itemId(14)] } },
  { text: "headphones පෙන්වන්න", intent: "search_products", tag: "mixed", expect: { categorySlug: "audio" } },
  { text: "echo mini speaker එක ගැන කියන්න", intent: "get_product_details", tag: "mixed", expect: { productIds: [itemId(15)] } },
  { text: "Pulse earbuds සහ Pulse headphones වල වෙනස මොකක්ද", intent: "compare_products", tag: "mixed", expect: { productIds: [itemId(3), itemId(4)] } },
  { text: "tablet එකක් ඕන, රුපියල් ලක්ෂයක් විතර", intent: "search_products", tag: "mixed", expect: { maxPriceLkr: 100000, categorySlug: "tablets" } },
  { text: "මගේ ඇණවුමේ තත්ත්වය බලන්න", intent: "order_status", tag: "si" },
  { text: "ඩිලිවරි ගාස්තුව කීයද", intent: "store_info", tag: "si", expect: { topic: "delivery_charge" } },
  { text: "phone ekak balanna one", intent: "search_products", tag: "singlish" },
  { text: "mage cart eka pennanna", intent: "cart_view", tag: "singlish" },
  { text: "meka cart eken ain karanna", intent: "cart_remove", tag: "singlish" },
  { text: "Nova Lite eka kiyada", intent: "get_product_details", tag: "singlish", expect: { productIds: [itemId(11)] } },
  { text: "which is cheaper Nova Lite or Orbit Tablet", intent: "compare_products", tag: "en", expect: { productIds: [itemId(11), itemId(12)] } },
  { text: "do you have Pulse headphones in black?", intent: "check_stock", tag: "en", expect: { productIds: [itemId(4)], color: "black" } },
  { text: "i want to buy this", intent: "cart_add", tag: "en", expect: { referent: true } },
  { text: "show my cart", intent: "cart_view", tag: "en" },
  { text: "I need a charger for my Nova X1", intent: "get_accessories", tag: "en", expect: { productIds: [NOVA_X1] } },
  { text: "ස්තූතියි, ඔබට පිං", intent: "smalltalk", tag: "si" },
  { text: "goodbye", intent: "smalltalk", tag: "en" },
  { text: "can I pay now", intent: "checkout_handoff", tag: "en" },
  { text: "refund eka denna", intent: "order_support", tag: "singlish" },
  { text: "අලුත් phones මොනවාද තියෙන්නේ", intent: "search_products", tag: "mixed", expect: { sort: "newest" } },
  { text: "ලාභ earbuds ටිකක් පෙන්වන්න", intent: "search_products", tag: "mixed", expect: { sort: "price-asc" } },
  { text: "මේකේ බැටරි එක කොච්චර කාලයක් පාවිච්චි කරන්න පුළුවන්ද", intent: "get_product_details", tag: "si", expect: { referent: true } },
  { text: "Glide tempered glass එක තියෙනවද", intent: "check_stock", tag: "mixed", expect: { productIds: [itemId(7)] } },
  { text: "මට 2 ක් ඕන", intent: "unknown", tag: "abstain" },
  { text: "hello, ඔයාට මට උදව් කරන්න පුළුවන්ද?", intent: "smalltalk", tag: "mixed" },
  { text: "Which phone has the best camera?", intent: "search_products", tag: "en" },
  { text: "mage ekata wadiya hodama phone eka mokakda", intent: "search_products", tag: "singlish" },
  { text: "free delivery thiyenawada?", intent: "store_info", tag: "singlish", expect: { topic: "delivery_charge" } },
  { text: "where can I see my order", intent: "order_status", tag: "en" },
  { text: "How many days for delivery", intent: "store_info", tag: "en" },
  { text: "iPhone 15 ekak ganna one", intent: "search_products", tag: "singlish" },
  { text: "Samsung phone එකක් තියෙනවද?", intent: "search_products", tag: "mixed" },
  { text: "ඔයාලගේ shop එක කොහෙද තියෙන්නේ", intent: "store_info", tag: "mixed", expect: { topic: "other" } },
  { text: "පිළිතුර සිංහලෙන් දෙන්න", intent: "unknown", tag: "abstain" },
  { text: "100k walata adu earbuds", intent: "search_products", tag: "singlish", expect: { maxPriceLkr: 100000 } },
  { text: "compare these", intent: "compare_products", tag: "en", expect: { referent: true } },
];

/**
 * SET_C: written AFTER SET_A and SET_B had been run, deliberately WITHOUT consulting the lexicon, with colloquial phrasing,
 * word-order changes, typos and spoken numbers. Its FIRST-RUN score is the least biased number available here, but the author
 * is still the same person, so it is still not an independent evaluation (blocker B5). Labels are fixed before it is run.
 */
export const SET_C: Case[] = [
  { text: "රුපියල් හැට දාහකට වඩා අඩු ෆෝන් එකක් තියෙනවද", intent: "search_products", tag: "mixed" },
  { text: "Samsung එකක් නැද්ද?", intent: "search_products", tag: "mixed" },
  { text: "මේ ෆෝන් එකේ කැමරාව හොඳද", intent: "get_product_details", tag: "si", expect: { referent: true } },
  { text: "Pulse earbuds එකේ මිල කීයද කියලා කියන්න", intent: "get_product_details", tag: "mixed", expect: { productIds: [itemId(3)] } },
  { text: "මට ෆෝන් එකක් ගන්න ඕන, 70000ක් විතර budget", intent: "search_products", tag: "mixed", expect: { maxPriceLkr: 70000 } },
  { text: "ඔයාලගෙ delivery එක කීයක්ද", intent: "store_info", tag: "mixed", expect: { topic: "delivery_charge" } },
  { text: "Orbit Pro එක cart එකට දාන්න", intent: "cart_add", tag: "mixed", expect: { productIds: [ORBIT_PRO] } },
  { text: "කරුණාකර මගේ ඇණවුම ගැන බලන්න", intent: "order_status", tag: "si" },
  { text: "මේ දෙකම ගැන සසඳලා කියන්න", intent: "compare_products", tag: "si", expect: { referent: true } },
  { text: "tablet එක තොග තියෙනවද", intent: "check_stock", tag: "mixed" },
  { text: "ස්තූතියි ගොඩක්!", intent: "smalltalk", tag: "si" },
  { text: "ඔයා මොනවද කරන්නේ", intent: "smalltalk", tag: "si" },
  { text: "ශුභ උදෑසනක්", intent: "smalltalk", tag: "si" },
  { text: "මගේ cart එකේ ඇති ඔක්කොම බලන්න ඕන", intent: "cart_view", tag: "mixed" },
  { text: "cart එකේ තියෙන Atlas smartwatch එක ඉවත් කරන්න", intent: "cart_remove", tag: "mixed", expect: { productIds: [itemId(8)] } },
  { text: "මොන phone එකද හොඳම camera එකක් තියෙන්නේ", intent: "search_products", tag: "mixed" },
  { text: "ඇණවුමක් අවලංගු කරන්න පුළුවන්ද", intent: "order_support", tag: "si" },
  { text: "COD වලට ගෙවන්න පුළුවන්ද", intent: "store_info", tag: "mixed" },
  { text: "මේ watch එකේ battery life එක කොච්චරද", intent: "get_product_details", tag: "mixed", expect: { referent: true } },
  { text: "mata phone ekak onee, 90k wage", intent: "search_products", tag: "singlish", expect: { maxPriceLkr: 90000 } },
  { text: "oyalage delivery charge eka kiyada", intent: "store_info", tag: "singlish", expect: { topic: "delivery_charge" } },
  { text: "meka kiyada", intent: "get_product_details", tag: "singlish", expect: { referent: true } },
  { text: "Nova X1 stock thiyenawada", intent: "check_stock", tag: "singlish", expect: { productIds: [NOVA_X1] } },
  { text: "cart eke thiyena ewa pennanna", intent: "cart_view", tag: "singlish" },
  { text: "order eka dala thiyenne, koheda ynne", intent: "order_status", tag: "singlish" },
  { text: "Pulse earbuds walata hodama case ekak monawada", intent: "get_accessories", tag: "singlish" },
  { text: "thanks machan", intent: "smalltalk", tag: "singlish" },
  { text: "hi bro", intent: "smalltalk", tag: "singlish" },
  { text: "ayubowan, mata udaw karanna puluwanda", intent: "smalltalk", tag: "singlish" },
  { text: "me deka compare karala kiyanna", intent: "compare_products", tag: "singlish", expect: { referent: true } },
  { text: "kalu color eka thiyenawada", intent: "check_stock", tag: "singlish", expect: { color: "black" } },
  { text: "free delivery ekak thiyenawada", intent: "store_info", tag: "singlish", expect: { topic: "delivery_charge" } },
  { text: "Do you ship to Kandy?", intent: "store_info", tag: "en" },
  { text: "I'd like to see some smartwatches", intent: "search_products", tag: "en", expect: { categorySlug: "wearables" } },
  { text: "what's the cheapest phone you have", intent: "search_products", tag: "en", expect: { sort: "price-asc" } },
  { text: "does the Nova X1 come in blue", intent: "check_stock", tag: "en", expect: { productIds: [NOVA_X1], color: "blue" } },
  { text: "Can you tell me how much the Atlas Fitness Band costs", intent: "get_product_details", tag: "en", expect: { productIds: [itemId(9)] } },
  { text: "which one is better, Pulse earbuds or Pulse headphones", intent: "compare_products", tag: "en", expect: { productIds: [itemId(3), itemId(4)] } },
  { text: "Any accessories for the Orbit Pro?", intent: "get_accessories", tag: "en", expect: { productIds: [ORBIT_PRO] } },
  { text: "remove the charger from my cart", intent: "cart_remove", tag: "en" },
  { text: "change the quantity of the Atlas Smartwatch to 3", intent: "cart_update_quantity", tag: "en", expect: { quantity: 3, productIds: [itemId(8)] } },
  { text: "I'd like to pay now", intent: "checkout_handoff", tag: "en" },
  { text: "my parcel hasn't arrived", intent: "order_status", tag: "en" },
  { text: "cancel it please", intent: "order_support", tag: "en" },
  { text: "thx!", intent: "smalltalk", tag: "en" },
  { text: "tell me a joke", intent: "unknown", tag: "abstain" },
  { text: "How do I reset my password", intent: "unknown", tag: "abstain" },
  { text: "ඔයාගේ නම මොකක්ද", intent: "smalltalk", tag: "si" },
];
