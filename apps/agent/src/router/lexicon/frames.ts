import type { ScoredIntent } from "../types";

/**
 * Co-occurrence frames (M3-B). A frame matches when the message contains at least one phrase from EVERY listed set, and none from
 * `not`. This covers paraphrases by structure ("order" + "where/when/arrive", in any wording and any script) instead of needing every
 * whole sentence in the cue lists. Phrase syntax is the same as in intents.ts (whole-word Latin, substring Sinhala, trailing "*" =
 * word prefix). PROVISIONAL and engineer-drafted like the rest of the lexicon: Sinhala wording needs native review.
 *
 * Weights follow intents.ts (4 = decisive). A frame never creates an action on its own: the router still resolves entities,
 * asks when something is missing, and only plans tools whose arguments validate.
 */
export interface Frame {
  w: number;
  all: string[][];
  not?: string[];
  /** Only counts when the shopper already has items in the cart (the message may refer to them without saying "cart"). */
  needsCartItems?: boolean;
}

const ORDER_THING = ["order", "orders", "parcel", "package", "shipment", "delivery", "ඇණවුම", "ඇණවුමේ", "ඇණවුමක්", "පාර්සල", "ඕඩර්", "ඕඩරය", "paarsal", "parsal"];
const CART_THING = ["cart", "basket", "bag", "trolley", "කරත්ත", "කාට්", "බැස්කට්"];
const ACCESSORY_THING = ["charger", "chargers", "cable", "cables", "case", "cases", "cover", "covers", "protector", "protectors", "screen guards", "adapters", "adaptors", "power banks", "screen guard", "tempered glass", "adapter", "adaptor", "power bank", "earphone", "earphones", "චාජර්", "කේබල්", "කේස්", "කවර", "ගාඩ්", "ආරක්ෂක", "ඇඩැප්ටර්"];
const COLOUR = ["black", "white", "red", "blue", "green", "gold", "silver", "grey", "gray", "pink", "purple", "kalu", "sudu", "rathu", "nil", "kola", "කළු", "සුදු", "රතු", "නිල්", "කොළ", "රන්", "රිදී"];
const REMOVE_WORD = ["remove", "delete", "take out", "take that out", "take it out", "take this out", "take them out", "out of", "take off", "drop", "get rid", "ain", "අයින්", "ඉවත්", "ඉවත"];
const NUMBER_WORD = ["two", "three", "four", "five", "dekak", "hathak", "pahak", "දෙකක්", "හතරක්", "පහක්", "දෙකක", "2", "3", "4", "5"];

export const FRAMES: Partial<Record<ScoredIntent, Frame[]>> = {
  order_status: [
    {
      w: 4,
      all: [
        ORDER_THING,
        ["where", "when", "status", "track", "tracking", "arrive", "arrived", "arrives", "reach", "reached", "come", "came", "coming", "turn up", "turned up", "late", "delay", "delayed", "yet", "received", "kawadada", "kawada", "koheda", "kothanada", "kohe", "enne", "enawada", "awa", "labune", "labuna", "labenne", "labuneda", "ලැබුණේ", "ලැබෙන්නේ", "ලැබුණා", "කොහෙද", "කොතනද", "කවදාද", "කොයි වෙලාවට", "ආවේ", "ඇවිත්", "එන්නේ", "එනවද", "තත්ත්ව", "තත්වය"],
      ],
      not: ["cancel", "nawattanna", "නවත්වන්න", "අවලංගු", "refund", "place", "ganna", "ගන්න"],
    },
  ],
  order_support: [
    { w: 5, all: [ORDER_THING, ["cancel", "stop", "nawattanna", "නවත්වන්න", "නවත්තන්න", "අවලංගු", "cancel karanna", "exchange", "replace"]] },
  ],
  checkout_handoff: [
    {
      w: 4,
      all: [
        ["ready", "want", "need", "like", "wish", "can", "how", "where", "now", "dan", "one", "ඕන", "යන්න", "දැන්", "ගෙවමු", "ready to"],
        ["pay", "payment", "gewanna", "gewima", "gewanawa", "ගෙවන්න", "ගෙවීම", "ගෙවමු", "ගෙවලා"],
      ],
    },
  ],
  cart_add: [
    { w: 5, all: [CART_THING, ["add", "put", "drop in", "throw in", "place", "danna", "dagannna", "dagenna", "දාන්න", "දාගන්න", "දාලා", "එකතු", "ඇතුල්", "ekathu"]], not: [...REMOVE_WORD, "view", "show", "what", "total"] },
    { w: 4, all: [["put", "add", "place"], ["basket", "cart", "bag"]], not: [...REMOVE_WORD] },
  ],
  cart_remove: [{ w: 5, all: [CART_THING, REMOVE_WORD] }],
  cart_update_quantity: [
    { w: 4, all: [["make it", "change it", "change to", "set it", "set to", "kara", "karanna", "කරන්න", "වෙනස් කරන්න", "wenas karanna"], NUMBER_WORD], not: ["phone", "phones", "ෆෝන්"], needsCartItems: true },
    { w: 4, all: [["quantity", "qty", "ප්‍රමාණය", "ගණන", "count", "pieces", "units"], [...NUMBER_WORD, "change", "make", "set", "update"]] },
  ],
  cart_view: [
    { w: 4, all: [CART_THING, ["show", "see", "view", "what", "whats", "list", "everything", "contents", "inside", "got", "thiyenne", "thiyena", "thiyenawa", "monawada", "pennanna", "balanna", "බලන්න", "පෙන්නන්න", "මොනවද", "තියෙන්නේ", "තියෙන", "තියෙනවා", "තියෙන දේවල්", "තියෙන ඒවා"]], not: [...REMOVE_WORD, "add", "put", "danna", "දාන්න", "දාගන්න"] },
  ],
  get_accessories: [
    { w: 5, all: [ACCESSORY_THING, ["fit", "fits", "go with", "goes with", "work with", "works with", "compatible", "for this", "for it", "for my", "for that", "also need", "also want", "ekata", "mekata", "eyata", "meyata", "meta", "මේකට", "ඒකට", "එකට", "ගැළපෙන", "ගැලපෙන", "ගැළපේ", "hari yana", "hariyana", "hari yanawa", "හරි යන", "ගන්න ඕන", "ganna one", "ඕන"]], not: CART_THING },
  ],
  check_stock: [
    { w: 4, all: [COLOUR, ["available", "stock", "have", "thiyenawada", "thiyenawa", "තියෙනවද", "තියෙනවාද", "තියේද", "ඇද්ද", "තොග", "still"]] },
    { w: 6, all: [["can i buy", "can i get", "able to get", "will i be able", "sold out", "still have", "still available"]] },
    { w: 5, all: [["ganna puluwan", "ganna puluwanda", "ganna labenawada", "ගන්න පුළුවන්", "ගන්න ලැබෙ", "labenawada", "ලැබෙනවද", "තාම තියෙනවද", "තාමත්"], ["meka", "eka", "this", "it", "මේක", "ඒක", "dan", "දැන්", "ada", "අද", "today", "thama", "තාම"]] },
  ],
  compare_products: [
    {
      w: 4,
      all: [
        ["two", "both", "them", "they", "these", "those", "between", "deka", "deken", "දෙක", "දෙකම", "දෙකෙන්", "දෙකේ", "දෙකේම", "අතර", "අතරින්", "athara"],
        ["better", "best", "which", "pick", "choose", "hodama", "hondama", "හොඳ", "wenas", "වෙනස", "difference", "differ", "different", "longer", "lasts", "side by side", "compare", "sasanda", "සසඳ", "කුමක්ද", "කොහෙද", "kohomada", "monawada", "මොකක්ද", "වඩා", "wada"],
      ],
    },
  ],
  search_products: [
    // "gaming laptop", "camera phone", "laptop for programming": a product kind together with what it is for is a search.
    {
      w: 4,
      all: [
        ["phone", "phones", "laptop", "laptops", "tablet", "smartphone", "mobile", "ෆෝන්", "ලැප්ටොප්", "fone", "labtop"],
        ["gaming", "game", "games", "camera", "photography", "battery", "office", "programming", "coding", "design", "editing", "student", "කැමරා", "ගේම්", "බැටරි"],
      ],
      not: ["this", "that", "meka", "eka kohomada", "how is", "how are", "මේක", "ඒක", "මේ", "මෙම", "compare", "vs"],
    },
    { w: 5, all: [["new", "newest", "latest", "just come in", "just arrived", "arrivals", "aluth", "aluthma", "aluthin", "අලුත්", "අලුත්ම", "අලුතින්"], ["items", "stuff", "products", "goods", "arrivals", "show", "what", "monawada", "මොනවද", "පෙන්නන්න", "pennanna", "බඩු", "badu", "ආපු", "ena", "come", "came"]] },
    { w: 4, all: [["cost", "costs", "price", "priced", "pay", "spend", "budget", "mila", "මිල", "බජට්", "salli", "රුපියල්", "rupees", "rs", "lkr"], ["less", "under", "below", "within", "adu", "අඩු", "at most", "max", "not more", "wadi nowana"]] },
    { w: 4, all: [["pick out", "pick", "select", "choose", "recommend", "suggest", "find", "hoyala", "hoya", "therala", "තෝරලා", "තෝරා", "හොයලා", "හොයන්න", "pennanna", "පෙන්නන්න", "look for", "looking for", "buying", "shopping", "gannawa", "ගන්න හිතාගෙන", "බලනවා", "balanawa", "ඕන", "one"], ["phone", "phones", "laptop", "laptops", "tablet", "tablets", "earbuds", "headphones", "headphone", "watch", "speaker", "ෆෝන්", "ටැබ්ලට්", "ඉයර්බඩ්ස්", "හෙඩ්ෆෝන්", "ලැප්ටොප්", "වොච්"]] },
    { w: 4, all: [["lowest", "least", "cheapest", "cheap", "ලාභම", "labama", "labhama", "mila adu", "මිල අඩුම", "අඩුම"], ["price", "priced", "one", "ones", "eka", "එක", "ඒවා", "model", "models", "expensive"]] },
  ],
  get_product_details: [
    { w: 4, all: [["price", "cost", "costs", "how much", "mila", "මිල", "ගාන", "ගාණ", "gaana", "gana", "kiyada", "කීයද", "kochchara", "කොච්චර", "කොච්චරද", "kochcharada"], ["this", "that", "it", "meka", "meke", "eka", "eke", "මේක", "මේකේ", "ඒක", "ඒකේ", "මේ", "ඒ"]] },
    { w: 4, all: [["how long", "how big", "how heavy", "how fast", "how good", "how many", "kochchara", "කොච්චර", "kiyak", "කීයක්"], ["battery", "camera", "storage", "memory", "display", "screen", "ram", "weight", "බැටරි", "බැටරිය", "කැමරා", "කැමරාව", "වෙලා", "last", "lasts"]] },
    { w: 4, all: [["tell me", "more", "know", "details", "info", "information", "about", "gana", "ගැන", "kiyanna", "කියන්න", "wisthara", "විස්තර", "විස්තරය", "wistara"], ["this", "that", "it", "phone", "product", "meka", "meke", "eka", "eke", "මේක", "මේකේ", "ඒක", "ඒකේ", "මේ", "ඒ"]], not: ["compare", "two", "both", "difference"] },
  ],
  store_info: [
    { w: 5, all: [["deliver", "delivery", "shipping", "send", "ship", "ewanna", "එවන්න", "බෙදා හැරීම්", "බෙදාහැරීම්", "ඩිලිවරි", "courier", "ගෙනත්", "gaana", "gaan"], ["charge", "charges", "fee", "cost", "how much", "price", "gana", "gaana", "ගාන", "ගාණ", "ගාස්තු", "ගාස්තුව", "kiyada", "කීයද", "කොච්චර", "kochchara", "salli", "සල්ලි"]] },
    { w: 6, all: [["warranty", "guarantee", "warrenty", "warrantee", "වරන්තිය", "වගකීම", "වගකීමක්", "සහතික", "සහතිකය", "sahathika", "sahathikaya"]] },
    { w: 6, all: [["return", "returns", "send back", "send it back", "give back", "give it back", "return it", "refund", "money back", "exchange", "ආපසු", "ආපහු", "ayeth", "ayet"], ["policy", "can i", "possible", "puluwan", "puluwanda", "පුළුවන්ද", "denawada", "දෙනවද", "if i", "salli"]], not: ["my order", "cancel"] },
  ],
  smalltalk: [
    { w: 4, all: [["cheers", "that s all", "thats all", "ok thanks", "thanks a lot", "thank you so much", "much appreciated", "sanasenawa", "සනීපෙන්ද", "සනීප", "istuti", "sthuthi", "stuti", "ස්තුති", "ස්තූති", "ස්තුතියි", "bohoma", "බොහොම", "ගොඩක්"]] },
    { w: 4, all: [["how are you", "how s it going", "hows it going", "how is it going", "how are things", "සනීපෙන්ද", "කොහොමද"], ["hello", "hi", "hey", "today", "you", "ayubowan", "ආයුබෝවන්", "hondada", "හොඳද", "සනීපෙන්ද", "ඔයා"]] },
  ],
};
