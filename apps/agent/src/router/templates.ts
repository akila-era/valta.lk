import { hasSinhala } from "../util/script";
import type { TemplateKey } from "./types";

/**
 * Fixed reply texts. They contain NO product, price, stock, specification, warranty, promotion or delivery facts: facts only ever
 * travel in cards built from backend results. The Sinhala wording is PROVISIONAL, written by an engineer, and flagged
 * `needsNativeReview` (blocker B5); it must not be presented as production-quality Sinhala.
 *
 * `polishable` marks texts a language model may reword (SinhalaLLM, when enabled). None of them contains a fact to protect.
 */
export interface Template {
  en: string;
  si: string;
  polishable: boolean;
}

const T: Record<TemplateKey, Template> = {
  greeting: {
    en: "Hello! I'm the VOLTA.LK shopping assistant. I can help you find products, compare them, check stock and see compatible accessories.",
    si: "ආයුබෝවන්! මම VOLTA.LK සාප්පු සහායකයායි. නිෂ්පාදන සොයන්න, සසඳන්න, තොග තත්ත්වය බලන්න සහ ගැළපෙන උපාංග බලන්න මට ඔබට උදව් කළ හැක.",
    polishable: true,
  },
  thanks: { en: "You're welcome! Let me know if you need anything else.", si: "ඔබට ස්තූතියි! තවත් උදව්වක් අවශ්‍ය නම් කියන්න.", polishable: true },
  goodbye: { en: "Goodbye! Come back any time.", si: "ස්තූතියි, නැවත හමුවෙමු!", polishable: true },
  identity: {
    en: "I'm the VOLTA.LK shopping assistant. I show products and information from our store. I can't place orders or take payments.",
    si: "මම VOLTA.LK සාප්පු සහායකයායි. අපගේ වෙළඳසැලේ නිෂ්පාදන සහ තොරතුරු පෙන්වීමට මට හැක. ඇණවුම් කිරීම හෝ ගෙවීම් කිරීම මට කළ නොහැක.",
    polishable: true,
  },
  capabilities: {
    en: "I can search products, show details and compare them, check stock, suggest compatible accessories and help with your cart. For orders and payment, you confirm everything yourself on the checkout page.",
    si: "නිෂ්පාදන සෙවීම, විස්තර සහ සංසන්දනය, තොග බැලීම, ගැළපෙන උපාංග යෝජනා කිරීම සහ ඔබේ cart එකට උදව් කිරීම මට හැක. ඇණවුම් සහ ගෙවීම් ඔබ විසින්ම checkout පිටුවේදී තහවුරු කළ යුතුයි.",
    polishable: true,
  },
  clarify_what: {
    en: "I'm not sure what you'd like. You can ask me to find a product (for example by brand or budget), compare two products, check stock, or show your cart.",
    si: "ඔබට අවශ්‍ය දේ මට හරියටම තේරුණේ නැහැ. නිෂ්පාදනයක් සොයන්න (brand එක හෝ budget එක කියා), දෙකක් සසඳන්න, තොග බලන්න, නැත්නම් cart එක බලන්න කියන්න.",
    polishable: true,
  },
  clarify_product: {
    en: "Which product do you mean? Please tell me its name or brand, or open the product page and ask again.",
    si: "ඔබ කියන්නේ කුමන නිෂ්පාදනය ගැනද? නම හෝ brand එක කියන්න, නැත්නම් නිෂ්පාදන පිටුව විවෘත කර නැවත අහන්න.",
    polishable: true,
  },
  clarify_two_products: {
    en: "Which two products would you like to compare? Please name both.",
    si: "සසඳන්න ඕන නිෂ්පාදන දෙක මොනවාද? දෙකේම නම් කියන්න.",
    polishable: true,
  },
  clarify_budget: {
    en: "I couldn't read the amount. Please write the budget using digits only.",
    si: "මුදල මට තේරුම් ගන්න බැරි වුණා. කරුණාකර budget එක ඉලක්කම් වලින් පමණක් ලියන්න.",
    polishable: true,
  },
  clarify_accessory_for: {
    en: "Which product should the accessory fit? Please name it or open its page.",
    si: "මේ උපාංගය කුමන නිෂ්පාදනයට ගැළපිය යුතුද? නම කියන්න, නැත්නම් එහි පිටුව විවෘත කරන්න.",
    polishable: true,
  },
  clarify_variant: {
    en: "This product comes in more than one option. Which one would you like (for example colour or storage)?",
    si: "මේ නිෂ්පාදනය විවිධ විකල්ප වලින් තියෙනවා. කුමන එකද ඕන (උදා: වර්ණය හෝ ගබඩා ධාරිතාව)?",
    polishable: true,
  },
  clarify_ambiguous_product: {
    en: "That could be more than one product. Please give me the full name.",
    si: "ඒක නිෂ්පාදන කිහිපයකට ගැළපෙනවා. සම්පූර්ණ නම කියන්න.",
    polishable: true,
  },
  refuse_injection: {
    en: "Sorry, I can't help with that. I can only help you shop: find products, compare them, check stock and see your cart.",
    si: "සමාවෙන්න, ඒ සඳහා මට උදව් කළ නොහැක. නිෂ්පාදන සෙවීම, සසඳන්න, තොග බලන්න සහ cart එක බලන්න පමණක් මට හැක.",
    polishable: false,
  },
  refuse_price: {
    en: "I can't change prices or give discounts. I can only show the current prices and offers from our store.",
    si: "මිල වෙනස් කිරීම හෝ වට්ටම් ලබා දීම මට කළ නොහැක. වෙළඳසැලේ දැනට තිබෙන මිල සහ දීමනා පෙන්වීමට පමණක් මට හැක.",
    polishable: false,
  },
  refuse_exfil: {
    en: "Sorry, I can't share information about other customers, orders or accounts.",
    si: "සමාවෙන්න, වෙනත් පාරිභෝගිකයන්, ඇණවුම් හෝ ගිණුම් ගැන තොරතුරු මට ලබා දිය නොහැක.",
    polishable: false,
  },
  refuse_sensitive: {
    en: "Please don't share card numbers, passwords, one-time codes or ID numbers in this chat. I haven't kept that message.",
    si: "කරුණාකර කාඩ්පත් අංක, මුරපද, එක්-වරක් කේත හෝ හැඳුනුම්පත් අංක මේ chat එකේ යවන්න එපා. ඒ පණිවිඩය මම සුරකින්නේ නැහැ.",
    polishable: false,
  },
  order_guest_handoff: {
    en: "To check an order, please use the Track order page. It will ask for your order reference.",
    si: "ඇණවුමක තත්ත්වය බැලීමට කරුණාකර 'Track order' පිටුව භාවිතා කරන්න. එහිදී ඔබේ ඇණවුම් අංකය අහයි.",
    polishable: false,
  },
  checkout_handoff: {
    en: "I can't place orders or take payment. You review and confirm your order yourself on the checkout page.",
    si: "ඇණවුම් කිරීම හෝ ගෙවීම් කිරීම මට කළ නොහැක. ඔබ විසින්ම checkout පිටුවේදී ඇණවුම පරීක්ෂා කර තහවුරු කළ යුතුයි.",
    polishable: false,
  },
  order_support_handoff: {
    en: "I can't cancel, change or refund orders. Please use the Track order page or contact the store.",
    si: "ඇණවුම් අවලංගු කිරීම, වෙනස් කිරීම හෝ මුදල් ආපසු දීම මට කළ නොහැක. කරුණාකර 'Track order' පිටුව භාවිතා කරන්න හෝ වෙළඳසැල අමතන්න.",
    polishable: false,
  },
  store_info_other: {
    en: "I don't have verified information about that. The delivery charge is confirmed at checkout, and the store contact details are on the Contact page.",
    si: "ඒ ගැන තහවුරු කළ තොරතුරු මා සතුව නැහැ. ඩිලිවරි ගාස්තුව checkout එකේදී තහවුරු වෙනවා, වෙළඳසැලේ සම්බන්ධතා තොරතුරු Contact පිටුවේ තියෙනවා.",
    polishable: false,
  },
  tools_ran: { en: "Here is what I found.", si: "මෙන්න මට සොයාගත හැකි දේ.", polishable: false },
  tool_failed: {
    en: "Sorry, I couldn't get that information right now. Please try again in a moment.",
    si: "සමාවෙන්න, ඒ තොරතුරු දැන් ලබාගන්න බැරි වුණා. කරුණාකර ටිකකින් නැවත උත්සාහ කරන්න.",
    polishable: false,
  },
  popular_unavailable: {
    en: "I don't have sales or popularity data, so I can't tell which products sell fastest. Here are the newest products in stock instead.",
    si: "මා සතුව විකුණුම් හෝ ජනප්‍රියතා දත්ත නැති නිසා වැඩියෙන්ම විකිණෙන්නේ මොනවාද කියා කියන්න බැහැ. ඒ වෙනුවට තොගයේ ඇති අලුත්ම නිෂ්පාදන මෙන්න.",
    polishable: false,
  },
  no_results: {
    en: "I couldn't find matching products. Try another brand, category or budget.",
    si: "ගැළපෙන නිෂ්පාදන සොයාගන්න බැරි වුණා. වෙනත් brand එකක්, ප්‍රවර්ගයක් හෝ budget එකක් උත්සාහ කරන්න.",
    polishable: false,
  },
  no_accessories: {
    en: "The store has not linked any accessories to that product yet.",
    si: "ඒ නිෂ්පාදනයට ගැළපෙන උපාංග තවම වෙළඳසැල විසින් සම්බන්ධ කරලා නැහැ.",
    polishable: false,
  },
  cart_proposed: {
    en: "I've prepared that for your cart. Nothing changes until you confirm it yourself.",
    si: "ඒක ඔබේ cart එක සඳහා සූදානම් කළා. ඔබ ම තහවුරු කරන තුරු කිසිවක් වෙනස් වෙන්නේ නැහැ.",
    polishable: false,
  },
  cart_unavailable: {
    en: "I can't do that right now: the item is out of stock, not available in that quantity, or over the per-item limit.",
    si: "දැනට ඒක කළ නොහැක: අයිතමය තොගයේ නැහැ, ඒ ප්‍රමාණයෙන් නැහැ, නැත්නම් එක් අයිතමයකට ඇති සීමාව ඉක්මවා ඇත.",
    polishable: false,
  },
  cart_not_in_cart: {
    en: "That item isn't in your cart.",
    si: "ඒ අයිතමය ඔබේ cart එකේ නැහැ.",
    polishable: false,
  },
  order_none: {
    en: "I couldn't find that order on your account.",
    si: "ඒ ඇණවුම ඔබේ ගිණුමේ සොයාගන්න බැරි වුණා.",
    polishable: false,
  },
  verification_failed: {
    en: "Sorry, I couldn't confirm that answer against our product data, so I'm not showing it. Please try again or browse the store pages.",
    si: "සමාවෙන්න, ඒ පිළිතුර අපගේ නිෂ්පාදන දත්ත සමඟ තහවුරු කරගන්න බැරි වුණා, ඒ නිසා එය පෙන්වන්නේ නැහැ. කරුණාකර නැවත උත්සාහ කරන්න, නැත්නම් වෙළඳසැල් පිටු බලන්න.",
    polishable: false,
  },
  busy_degraded: {
    en: "I'm busy right now, so I'll keep this short.",
    si: "මම දැන් කාර්යබහුලයි, ඒ නිසා කෙටියෙන් පිළිතුරු දෙමි.",
    polishable: false,
  },
};

export interface RenderedTemplate {
  text: string;
  polishable: boolean;
  /** True when the text contains Sinhala script. Always implies `needsNativeReview`. */
  sinhala: boolean;
}

export function renderTemplate(key: TemplateKey, lang: "en" | "si"): RenderedTemplate {
  const t = T[key];
  const text = lang === "si" ? t.si : t.en;
  return { text, polishable: t.polishable, sinhala: hasSinhala(text) };
}

export const TEMPLATE_KEYS = Object.keys(T) as TemplateKey[];

/** For tests and the native-review export: every Sinhala string that needs review. */
export function allSinhalaTemplates(): Record<string, string> {
  return Object.fromEntries(TEMPLATE_KEYS.map((k) => [k, T[k].si]));
}
