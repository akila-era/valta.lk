/**
 * Concept words used by entity extraction: product categories, colours, referents and a few spoken numbers.
 * PROVISIONAL and `needsNativeReview` (see meta.ts). Catalogue words are matched against the CATALOGUE's own category names,
 * so a concept only resolves to a category that really exists in the vocabulary.
 */
export interface Concept {
  id: string;
  /** Latin and Sinhala words that name the concept. */
  words: string[];
  /** Lower-case fragments looked for in the catalogue's category names. */
  catalogueWords: string[];
  /** A more specific search word when the concept is narrower than its category (for example "charger" in Accessories). */
  queryWord?: string;
}

/** Order matters: the first concept that matches wins, so specific accessories come before generic phones. */
export const CONCEPTS: Concept[] = [
  { id: "powerbank", words: ["power bank", "powerbank"], catalogueWords: ["accessor"], queryWord: "power bank" },
  { id: "charger", words: ["charger*", "adaptor", "adapter", "චාජර්"], catalogueWords: ["accessor"], queryWord: "charger" },
  { id: "cable", words: ["cable*", "කේබල්"], catalogueWords: ["accessor"], queryWord: "cable" },
  { id: "protector", words: ["screen protector", "tempered glass", "protector", "ආරක්ෂක"], catalogueWords: ["accessor"], queryWord: "glass" },
  { id: "case", words: ["case", "cases", "cover", "covers", "කේස්", "කවරය"], catalogueWords: ["accessor"], queryWord: "case" },
  { id: "earbuds", words: ["earbud*", "earphone*", "ඉයර්බඩ්ස්"], catalogueWords: ["audio"], queryWord: "earbuds" },
  { id: "headphones", words: ["headphone*", "headset*", "හෙඩ්ෆෝන්"], catalogueWords: ["audio"], queryWord: "headphones" },
  { id: "speaker", words: ["speaker*", "ස්පීකර්"], catalogueWords: ["audio"], queryWord: "speaker" },
  { id: "watch", words: ["smartwatch*", "smart watch", "watch", "watches", "ඔරලෝසුව", "වොච්"], catalogueWords: ["wearable"], queryWord: "watch" },
  { id: "band", words: ["fitness band", "band", "fitband"], catalogueWords: ["wearable"], queryWord: "band" },
  { id: "laptop", words: ["laptop*", "notebook*", "ලැප්ටොප්"], catalogueWords: ["laptop"] },
  { id: "mouse", words: ["mouse", "mice"], catalogueWords: ["computer"], queryWord: "mouse" },
  { id: "keyboard", words: ["keyboard*"], catalogueWords: ["computer"], queryWord: "keyboard" },
  { id: "hub", words: ["usb hub*", "usb-c hub*", "hub*"], catalogueWords: ["computer"], queryWord: "hub" },
  { id: "computer", words: ["computer accessories", "computer accessory", "pc accessories"], catalogueWords: ["computer"] },
  { id: "tablet", words: ["tablet*", "ටැබ්ලට්", "ටැබ්"], catalogueWords: ["tablet"] },
  { id: "phone", words: ["phone", "phones", "smartphone*", "mobile", "mobiles", "cellphone*", "දුරකථන", "ෆෝන්"], catalogueWords: ["phone", "mobile"] },
  { id: "audio", words: ["audio", "sound"], catalogueWords: ["audio"] },
];

export const COLORS: Record<string, string[]> = {
  black: ["black", "kalu", "කළු"],
  white: ["white", "sudu", "සුදු"],
  blue: ["blue", "nil", "නිල්"],
  red: ["red", "ratu", "රතු"],
  green: ["green", "kola", "කොළ"],
  gold: ["gold", "රන්වන්"],
  silver: ["silver", "ridi", "රිදී"],
  grey: ["grey", "gray", "අළු"],
};

/** "this one" and "these". */
export const REFERENT_SINGLE = ["this", "this one", "it", "that one", "meyata", "eyata", "ara eka", "e model eka", "e eka", "that model", "meka", "meke", "mekata", "meken", "මේක", "මේකේ", "මේකට", "මෙය", "මෙම", "ඒක", "ඒකේ", "මේ"];
export const REFERENT_PLURAL = ["these", "these two", "the first two", "first two", "top two", "the two", "both", "මේ දෙක", "මේ දෙකෙන්", "දෙකම", "මේවා", "mewa", "me deka"];

/** "the first / second / third / fourth one" of the last list, and "the last one". Provisional. */
export const ORDINALS: { n: number; words: string[] }[] = [
  { n: 1, words: ["first one", "the first", "1st one", "palaweni eka", "palaweni ekak", "palaweni", "පළවෙනි", "පළමු", "පළමුවෙනි"] },
  { n: 2, words: ["second one", "the second", "2nd one", "deweni eka", "deweni", "දෙවෙනි", "දෙවැනි"] },
  { n: 3, words: ["third one", "the third", "3rd one", "thunweni eka", "thunweni", "තුන්වෙනි", "තුන්වැනි"] },
  { n: 4, words: ["fourth one", "the fourth", "4th one", "hatharaweni eka", "හතරවෙනි", "හතරවැනි"] },
  { n: -1, words: ["last one", "the last", "anthima eka", "anthima", "අන්තිම", "අවසාන"] },
];
/** "the one I mentioned before". Provisional. */
export const PREVIOUS_REFS = ["kalin kiyapu", "kalin kiwwa", "kalin kiyapu eka", "kalin eka", "the one i mentioned", "the one you mentioned", "the one before", "the earlier one", "the previous one", "previous one", "කලින් කියපු", "කලින් කිව්ව", "කලින් එක"];

/** "the one I mentioned first": the earliest product of the conversation. Provisional. */
export const FIRST_MENTION_REFS = ["mulinma kiyapu", "mulinma kiwwa", "mulinma kiyapu eka", "palamuwa kiyapu", "palamuwenma kiyapu", "the first one i mentioned", "the first one you mentioned", "the first one i asked", "the very first one", "the one i asked first", "මුලින්ම කියපු", "මුලින්ම කිව්ව", "පළමුව කියපු"];

/** Spoken small quantities. Provisional. */
export const NUMBER_WORDS: Record<number, string[]> = {
  1: ["එකක්", "ekak"],
  2: ["දෙකක්", "dekak"],
  3: ["තුනක්", "thunak"],
  4: ["හතරක්", "hatharak"],
  5: ["පහක්", "pahak"],
};

export const SORT_CHEAP = ["cheapest", "cheap", "lowest price", "ලාභම", "ලාභ", "ලාභයි", "කුඩා මිල", "adu mila", "ලාභම", "sort by price", "sort to price", "sorted by price", "order by price", "price low to high", "low to high", "price ascending"];
export const SORT_EXPENSIVE = ["most expensive", "premium", "highest price", "මිල වැඩිම", "ඉහළම", "price high to low", "high to low", "price descending"];
export const SORT_NEWEST = ["newest", "latest", "new arrivals", "new", "අලුත්ම", "අලුත්", "අලුත"];
export const ON_SALE = ["on sale", "sale", "discount", "discounts", "offers", "offer", "වට්ටම්", "වට්ටමක්", "වට්ටම"];

/** Words that are never brand or model names, so they are not reported as unknown terms. */
export const STOPWORDS = new Set([
  "a", "an", "the", "i", "me", "my", "we", "you", "your", "is", "are", "am", "do", "does", "can", "could", "would", "will", "to", "for", "of", "in", "on", "at", "it", "its", "this", "that", "these", "those", "and", "or", "with", "any", "some", "please",
  "show", "tell", "compare", "add", "find", "need", "want", "have", "has", "get", "buy", "what", "which", "where", "when", "how", "much", "many", "price", "stock", "cart", "order", "hi", "hello", "hey", "thanks", "thank", "best", "good", "cheap", "new", "under", "below", "about",
  "rupees", "rs", "lkr", "budget", "delivery", "ekak", "eka", "ekata", "eke", "eken", "ganna", "one", "oni", "ona", "mage", "oyage", "kiyada", "thiyenawada", "koheda", "mokakda", "karanna", "danna", "denna", "pennanna", "balanna", "hoyanna", "walata", "adu", "wadi", "wadiya", "hodama", "honda",
  "meka", "meke", "mekata", "meken", "kohomada", "mata", "oyata", "ain", "vs", "versus", "than", "then", "so", "but", "if", "not", "no", "yes", "ok", "okay", "kiyanna", "balan", "kiyala", "wage", "tikak", "godak", "mokada", "monawada", "ekak",
]);
