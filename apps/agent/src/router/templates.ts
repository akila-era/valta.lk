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
    en: "Hi! Welcome to VOLTA.LK. How can I help you today?",
    si: "ආයුබෝවන්! VOLTA.LK වෙත සාදරයෙන් පිළිගන්නවා. අද මම ඔයාට කොහොමද උදව් කරන්න ඕන?",
    polishable: true,
  },
  greeting_again: {
    en: "Hello again! What can I help you find?",
    si: "නැවතත් ආයුබෝවන්! මම ඔයාට මොනවද හොයලා දෙන්න ඕන?",
    polishable: true,
  },
  how_are_you: {
    en: "I'm doing well, thanks for asking! 😊 How are you? What are you looking for today?",
    si: "මට හොඳින් ඉන්නවා! 😊 ඔයාට කොහොමද? අද මොනවද හොයන්නේ?",
    polishable: true,
  },
  acknowledged: {
    en: "Okay! Tell me what you're looking for whenever you're ready.",
    si: "හරි! ඔයාට ඕන දේ කියන්න, මම හොයලා දෙන්නම්.",
    polishable: true,
  },
  help_yes: {
    en: "Of course! Tell me what you're looking for, or ask me to compare products or check stock, and I'll help.",
    si: "ඔව්, අනිවාර්යයෙන්ම! ඔයාට මොනවද ඕන කියන්න. product එකක් හොයන්න, compare කරන්න, stock බලන්න මම උදව් කරන්නම්.",
    polishable: true,
  },
  browse_categories: {
    en: "Tell me what kind of product you're looking for (for example a phone, laptop, charger or power bank) or your budget, and I'll search our store.",
    si: "ඔයාට මොන වගේ product එකක්ද ඕන කියන්න (උදා: phone, laptop, charger, power bank) නැත්නම් budget එක කියන්න, මම අපේ store එකේ හොයලා දෙන්නම්.",
    polishable: true,
  },
  clarify_budget_what: {
    en: "What would you like to find within that budget? For example a phone, a laptop or a charger.",
    si: "ඒ budget එකට මොනවද හොයන්න ඕන? උදා: phone, laptop, charger.",
    polishable: true,
  },
  opinion_facts: {
    en: "I can't judge what is best for you, but here are the details so you can decide. I can also compare it with another product.",
    si: "ඒක ඔයාට හොඳද නැද්ද කියලා මට කියන්න බැහැ, ඒත් තීරණය කරන්න විස්තර මෙන්න. තව product එකක් එක්ක සසඳන්නත් පුළුවන්.",
    polishable: false,
  },
  recommend_intro: {
    en: "Based on what you've told me, these look like the best fits.",
    si: "ඔයා කියපු දේවල් අනුව, මේවා තමයි වඩාත්ම ගැළපෙන ඒවා.",
    polishable: false,
  },
  recommend_intro_b: {
    en: "Here are my top picks for what you've described.",
    si: "ඔයා කියපු දේට ගැළපෙන හොඳම තේරීම් මෙන්න.",
    polishable: false,
  },
  recommend_intro_c: {
    en: "These match what you're after most closely.",
    si: "ඔයා හොයන දේට වඩාත්ම ළං ඒවා මේවා.",
    polishable: false,
  },
  recommend_limited_data: {
    en: "Here are the closest matches. The store's product data doesn't list the details I'd need to rank them for that, so please check each product page.",
    si: "මෙන්න ළඟම ගැළපෙන ඒවා. ඒ අනුව ඒවා පෙළගස්වන්න ඕන විස්තර අපේ product දත්තවල නැති නිසා, එක් එක් product පිටුව බලන්න.",
    polishable: false,
  },
  no_match_alternatives: {
    en: "I couldn't find exactly that, but these are close options in the same category.",
    si: "හරියටම ඒක හොයාගන්න බැරි වුණා, ඒත් එකම ප්‍රවර්ගයේ ළඟම විකල්ප මෙන්න.",
    polishable: false,
  },
  brand_advice: {
    en: "I can't say whether a brand is better for you, but here is what we have that fits what you've told me.",
    si: "brand එකක් ඔයාට හොඳද කියලා මට කියන්න බැහැ, ඒත් ඔයා කියපු දේවලට ගැළපෙන ඒවා මෙන්න.",
    polishable: false,
  },
  ask_budget: { en: "What budget do you have in mind?", si: "ඔයාගේ budget එක කීයද?", polishable: false },
  ask_usage_phone: {
    en: "What matters most to you in a phone: camera, battery, gaming or everyday use?",
    si: "phone එකක ඔයාට වැදගත්ම දේ මොකක්ද: camera, battery, gaming නැත්නම් සාමාන්‍ය පාවිච්චිය?",
    polishable: false,
  },
  ask_usage_laptop: {
    en: "What will you use the laptop for: gaming, office work, programming or design?",
    si: "laptop එක මොකටද පාවිච්චි කරන්නේ: gaming, office වැඩ, programming නැත්නම් design?",
    polishable: false,
  },
  ask_brand: { en: "Do you prefer a particular brand?", si: "ඔයා කැමති brand එකක් තියෙනවද?", polishable: false },
  ask_device: { en: "Which phone or device is it for?", si: "මේක මොන phone එකටද / device එකටද?", polishable: false },
  thanks: { en: "You're welcome! 😊 Let me know if you need anything else.", si: "ඕනෑම වෙලාවක! 😊 තවත් දෙයක් අවශ්‍ය නම් කියන්න.", polishable: true },
  thanks_again: { en: "Happy to help! 😊 Just say the word if there's something else you'd like to see.", si: "සතුටුයි! 😊 තවත් මොනවා හරි බලන්න ඕන නම් කියන්න.", polishable: true },
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
  tools_ran_b: { en: "Here you go.", si: "මෙන්න බලන්න.", polishable: false },
  tools_ran_c: { en: "This is what I can show you.", si: "මට පෙන්වන්න පුළුවන් දේ මෙන්න.", polishable: false },
  clarify_what_b: {
    en: "Sorry, I still didn't get that. Could you tell me the product, brand or budget you have in mind?",
    si: "සමාවෙන්න, මට තාමත් තේරුණේ නැහැ. ඔයා හිතන product එක, brand එක හෝ budget එක කියන්න පුළුවන්ද?",
    polishable: true,
  },
  no_match_alternatives_b: {
    en: "Nothing matches that exactly, but here are some close options in the same category.",
    si: "හරියටම ඒකට ගැළපෙන ඒවා නැහැ, ඒත් එකම ප්‍රවර්ගයේ ළඟම විකල්ප කිහිපයක් මෙන්න.",
    polishable: false,
  },
  no_results_b: {
    en: "Sorry, nothing matched that. Try another brand, category or budget.",
    si: "සමාවෙන්න, ඒකට ගැළපෙන දෙයක් නැහැ. වෙන brand එකක්, ප්‍රවර්ගයක් හෝ budget එකක් උත්සාහ කරන්න.",
    polishable: false,
  },
  greeting_c: { en: "Hi there! What would you like to look at?", si: "ආයුබෝවන්! ඔයාට මොනවද බලන්න ඕන?", polishable: true },
  thanks_c: { en: "Glad I could help! 😊 Ask me anything else about the store.", si: "උදව් කරන්න පුළුවන් වුණාට සතුටුයි! 😊 store එක ගැන තව මොනවා හරි අහන්න.", polishable: true },
  // R0: the shopper says the assistant misunderstood ("mama kiwwe eka nemei", "that's not what I asked"). No fact in any of these.
  correction_ask: {
    en: "Sorry, I misunderstood. What did you mean? Tell me what you're looking for.",
    si: "සමාවෙන්න, මට වැරදුණා. ඔයා කිව්වේ මොකක්ද? ඔයාට ඕන දේ කියන්න.",
    polishable: false,
  },
  correction_ask_b: {
    en: "My mistake! Could you say it again, maybe with the product name, brand or budget?",
    si: "මගේ වැරැද්ද! ආයෙත් කියන්න පුළුවන්ද, product නම, brand එක හෝ budget එකත් එක්ක?",
    polishable: false,
  },
  correction_search: { en: "Sorry about that! Let me try again. Here is what I found.", si: "සමාවෙන්න! ආයෙත් බලමු. මෙන්න මට හොයාගත්ත දේ.", polishable: false },
  correction_search_b: { en: "Got it, my mistake. Here is what matches that.", si: "තේරුණා, මගේ වැරැද්ද. ඒකට ගැළපෙන ඒවා මෙන්න.", polishable: false },
  // R0: an explicit exclusion ("don't recommend Samsung", "Samsung epa") and what it leads to.
  exclusion_noted: { en: "Noted, I'll leave that out. What are you looking for?", si: "හරි, ඒක මම අතහරිනවා. ඔයා හොයන්නේ මොකක්ද?", polishable: false },
  exclusion_applied: { en: "Okay, leaving that out. Here is what's left.", si: "හරි, ඒක අතහැරලා. ඉතුරු ඒවා මෙන්න.", polishable: false },
  no_results_excluded: {
    en: "Once I leave out what you asked me not to show, nothing in stock matches. Try another brand, category or budget, or tell me if I should include it again.",
    si: "ඔයා එපා කියපු දේ අතහැරියම, තොගයේ ගැළපෙන ඒවා නැහැ. වෙන brand එකක්, ප්‍රවර්ගයක් හෝ budget එකක් උත්සාහ කරන්න, නැත්නම් ඒක ආයෙත් ඇතුළත් කරන්න කියන්න.",
    polishable: false,
  },
  // R0: conversation preferences ("reply in Sinhala", "keep it short", "stop asking questions"). Held for this conversation only, in memory.
  pref_lang_si: { en: "Okay, I'll reply in Sinhala from now on.", si: "හරි, මම මෙතැන් සිට සිංහලෙන් පිළිතුරු දෙන්නම්.", polishable: false },
  pref_lang_en: { en: "Okay, I'll reply in English from now on.", si: "හරි, මම මෙතැන් සිට ඉංග්‍රීසියෙන් පිළිතුරු දෙන්නම්.", polishable: false },
  pref_short: { en: "Okay, I'll keep my answers short.", si: "හරි, මම පිළිතුරු කෙටියෙන් දෙන්නම්.", polishable: false },
  pref_no_questions: { en: "Okay, I'll stop asking questions and just show you options.", si: "හරි, මම ප්‍රශ්න අහන එක නවත්තලා විකල්ප පෙන්වන්නම්.", polishable: false },
  pref_no_budget: { en: "Okay, I won't ask about your budget.", si: "හරි, ඔයාගේ budget එක ගැන මම අහන්නේ නැහැ.", polishable: false },
  // R0: password and sign-in trouble. The "Forgot password?" link exists on the sign-in form (src/components/account/auth-form.tsx).
  account_help: {
    en: "I can't see or reset passwords, and please don't type yours here. On the sign-in page, use the \"Forgot password?\" link to get a reset link by email. If that doesn't work, please contact the store.",
    si: "මට මුරපද බලන්න හෝ වෙනස් කරන්න බැහැ, ඒ නිසා ඔබේ මුරපදය මෙතන ටයිප් කරන්න එපා. Sign in පිටුවේ \"Forgot password?\" link එක භාවිතා කරලා email එකට reset link එකක් ගන්න. ඒකෙන් හරි නොගියොත් වෙළඳසැල අමතන්න.",
    polishable: false,
  },
  tool_failed: {
    en: "Sorry, I couldn't get that information right now. Please try again in a moment.",
    si: "සමාවෙන්න, ඒ තොරතුරු දැන් ලබාගන්න බැරි වුණා. කරුණාකර ටිකකින් නැවත උත්සාහ කරන්න.",
    polishable: false,
  },
  language_support: {
    en: "Yes, you can write to me in English, in Sinhala, or in Singlish (Sinhala in English letters). My Sinhala is still being reviewed, so it may sound a little unnatural.",
    si: "ඔව්, ඔබට මට ඉංග්‍රීසියෙන්, සිංහලෙන් හෝ සිංග්ලිෂ් (ඉංග්‍රීසි අකුරින් සිංහල) වලින් ලියන්න පුළුවන්. මගේ සිංහල තවමත් සමාලෝචනය වෙමින් පවතින නිසා ටිකක් අස්වාභාවික විය හැක.",
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
  external_site_refused: {
    en: "I can only help within the VOLTA.LK website, so I can't search Google or open other websites. I can look up VOLTA.LK products, check stock and help with your cart.",
    si: "මට VOLTA.LK වෙබ් අඩවිය තුළ පමණක් උදව් කළ හැකියි, ඒ නිසා Google හෝ වෙනත් වෙබ් අඩවි විවෘත කරන්න බැහැ. VOLTA.LK නිෂ්පාදන සොයන්න, තොග බලන්න සහ ඔබේ cart එකට උදව් කරන්න මට පුළුවන්.",
    polishable: false,
  },
  live_info_unavailable: {
    en: "I can't check live information such as the weather, news, the time or exchange rates. I can help you find VOLTA.LK products, compare them, check stock and manage your cart.",
    si: "කාලගුණය, පුවත්, වේලාව හෝ මුදල් අනුපාත වැනි සජීවී තොරතුරු මට පරීක්ෂා කළ නොහැක. VOLTA.LK නිෂ්පාදන සොයන්න, සසඳන්න, තොග බලන්න සහ ඔබේ cart එකට උදව් කරන්න මට පුළුවන්.",
    polishable: false,
  },
  busy_degraded: {
    en: "I'm busy right now, so I'll keep this short.",
    si: "මම දැන් කාර්යබහුලයි, ඒ නිසා කෙටියෙන් පිළිතුරු දෙමි.",
    polishable: false,
  },
};

/** A reply may be two fixed templates (for example a recommendation intro, then one follow-up question) joined by a blank line. */
export const REPLY_PART_SEPARATOR = "\n\n";

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

/**
 * Wording variants of the same fixed reply, so consecutive replies are not word for word the same. Every variant is a registered template (the
 * verifier checks the exact text of the key it is given), carries no fact, and says the same thing. `seed` is any per-conversation counter.
 */
const VARIANTS: Partial<Record<TemplateKey, readonly TemplateKey[]>> = {
  recommend_intro: ["recommend_intro", "recommend_intro_b", "recommend_intro_c"],
  greeting: ["greeting", "greeting_again"],
  thanks: ["thanks", "thanks_again"],
};
export function pickVariant(key: TemplateKey, seed: number): TemplateKey {
  const list = VARIANTS[key];
  return list ? list[((seed % list.length) + list.length) % list.length]! : key;
}

/**
 * Wording families (R0): replies that say the same thing in different words. `varyFrom` makes two consecutive replies of one family differ without any
 * randomness or counter: it needs only the key of the PREVIOUS reply of this conversation. Every member is a registered template, so the verifier accepts
 * each of them, none carries a fact, and the Sinhala members keep `needsNativeReview` like every other Sinhala text.
 */
const FAMILIES: readonly (readonly TemplateKey[])[] = [
  ["greeting", "greeting_again", "greeting_c"],
  ["thanks", "thanks_again", "thanks_c"],
  ["tools_ran", "tools_ran_b", "tools_ran_c"],
  ["recommend_intro", "recommend_intro_b", "recommend_intro_c"],
  ["correction_ask", "correction_ask_b"],
  ["correction_search", "correction_search_b"],
  ["clarify_what", "clarify_what_b"],
  ["no_match_alternatives", "no_match_alternatives_b"],
  ["no_results", "no_results_b"],
];

/** The next member of `key`'s family after the previous reply's key; `key` itself when there is no previous reply of that family. */
export function varyFrom(key: TemplateKey, previous: string | undefined): TemplateKey {
  const family = FAMILIES.find((f) => f.includes(key));
  if (!family || previous === undefined) return key;
  const at = family.indexOf(previous as TemplateKey);
  return at < 0 ? key : family[(at + 1) % family.length]!;
}

/** True for the reply keys that introduce search results (the family of "Here is what I found."): they are followed by refinement chips. */
const isResultsIntro = (key: TemplateKey): boolean => key === "tools_ran" || key === "tools_ran_b" || key === "tools_ran_c";

/** For tests and the native-review export: every Sinhala string that needs review. */
export function allSinhalaTemplates(): Record<string, string> {
  return Object.fromEntries(TEMPLATE_KEYS.map((k) => [k, T[k].si]));
}

/**
 * Tap-to-send suggestions that go with a reply. Fixed texts, none naming a product, price or stock level, so they are always true
 * of any catalogue; each one is something the assistant understands (a test sends every one through the router). The Sinhala set
 * is PROVISIONAL and needs native review like every other Sinhala text.
 */
const CHIPS_EN = {
  start: ["Show me phones", "Show me laptops", "What is on sale?", "Show my cart"],
  browse: ["Show me phones", "Show me laptops", "Show me chargers", "What is on sale?"],
  sale: ["What is on sale?", "Show me phones", "Show me laptops"],
  cart: ["Show me phones", "Show me laptops", "Show my cart"],
  after_search: ["Show the cheapest", "What is on sale?", "Show my cart"],
  usage_phone: ["Camera", "Battery", "Gaming", "Everyday use"],
  usage_laptop: ["Gaming", "Office work", "Programming", "Design"],
} as const;
const CHIPS_SI = {
  start: ["phones පෙන්වන්න", "laptops පෙන්වන්න", "වට්ටම් phones පෙන්වන්න", "මගේ cart එක බලන්න"],
  browse: ["phones පෙන්වන්න", "laptops පෙන්වන්න", "chargers පෙන්වන්න", "වට්ටම් phones පෙන්වන්න"],
  sale: ["වට්ටම් phones පෙන්වන්න", "phones පෙන්වන්න", "laptops පෙන්වන්න"],
  cart: ["phones පෙන්වන්න", "laptops පෙන්වන්න", "මගේ cart එක බලන්න"],
  after_search: ["ලාභම ඒවා පෙන්වන්න", "වට්ටම් phones පෙන්වන්න", "මගේ cart එක බලන්න"],
  usage_phone: ["Camera එක", "Battery එක", "Gaming", "සාමාන්‍ය පාවිච්චිය"],
  usage_laptop: ["Gaming", "Office වැඩ", "Programming", "Design"],
} as const;

const CHIP_SET: Partial<Record<TemplateKey, keyof typeof CHIPS_EN>> = {
  greeting: "start",
  greeting_again: "start",
  how_are_you: "start",
  acknowledged: "start",
  help_yes: "start",
  browse_categories: "browse",
  clarify_budget_what: "browse",
  opinion_facts: "after_search",
  ask_usage_phone: "usage_phone",
  ask_usage_laptop: "usage_laptop",
  identity: "start",
  capabilities: "start",
  language_support: "start",
  thanks: "start",
  thanks_again: "start",
  thanks_c: "start",
  greeting_c: "start",
  clarify_what: "browse",
  clarify_what_b: "browse",
  no_results_b: "browse",
  account_help: "browse",
  correction_ask: "browse",
  correction_ask_b: "browse",
  correction_search: "after_search",
  correction_search_b: "after_search",
  exclusion_noted: "browse",
  exclusion_applied: "after_search",
  no_results_excluded: "browse",
  pref_lang_si: "start",
  pref_lang_en: "start",
  pref_short: "start",
  pref_no_questions: "start",
  pref_no_budget: "start",
  clarify_product: "browse",
  clarify_ambiguous_product: "browse",
  clarify_two_products: "browse",
  clarify_accessory_for: "browse",
  clarify_budget: "browse",
  clarify_variant: "browse",
  no_results: "browse",
  no_accessories: "browse",
  popular_unavailable: "sale",
  external_site_refused: "start",
  live_info_unavailable: "start",
  store_info_other: "browse",
  cart_proposed: "cart",
  cart_unavailable: "browse",
  cart_not_in_cart: "browse",
  order_none: "browse",
  tool_failed: "browse",
};

export function suggestionsFor(key: TemplateKey, lang: "en" | "si", ctx: { afterSearch?: boolean } = {}): string[] {
  // Results of a search are followed by prompts that refine it; everything else uses the fixed set for its reply.
  const set = isResultsIntro(key) && ctx.afterSearch ? "after_search" : CHIP_SET[key];
  return set ? [...(lang === "si" ? CHIPS_SI[set] : CHIPS_EN[set])] : [];
}
