/**
 * Fixed wording for every browser reply. The only variable parts are (a) page-derived strings, which are always shown inside “ ” quotes and
 * checked against what the browser really observed (`verifyBrowseText`), and (b) the element description the Agent built itself. No model
 * writes any of this text. Page text is NEVER presented as a verified price, stock or specification: the summary says so every time.
 * Everything that is not English carries the native-review flag (Sinhala wording is provisional until a native speaker has reviewed it).
 */
export type BrowseTemplateKey =
  | "page_summary"
  | "page_empty"
  | "no_page_context"
  | "unavailable_here"
  | "needs_confirmation"
  | "action_done"
  | "action_unverified"
  | "action_failed"
  | "element_not_found"
  | "element_ambiguous"
  | "refused_financial"
  | "refused_sensitive_field"
  | "refused_injection"
  | "blocked_page"
  | "timeout"
  | "busy"
  | "cancelled"
  | "expired";

export interface BrowseVars {
  title?: string;
  excerpt?: string;
  description?: string;
}

const NOT_VERIFIED_EN = "This is the page's own text, so any price or stock shown there is not verified. Ask me for verified details.";
const NOT_VERIFIED_SI = "මෙය පිටුවේම අකුරු නිසා, එහි මිල සහ තොග තත්ත්වය තහවුරු කළ ඒවා නොවේ. තහවුරු කළ විස්තර මගෙන් අහන්න.";

const quote = (s: string) => `“${s}”`;

const EN: Record<BrowseTemplateKey, (v: BrowseVars) => string> = {
  page_summary: (v) => `Here is what I can see on this page${v.title ? ` ${quote(v.title)}` : ""}: ${quote(v.excerpt ?? "")} ${NOT_VERIFIED_EN}`,
  page_empty: () => "I opened the page but could not read any text on it.",
  no_page_context: () => "I can't tell which page you are on right now. Tell me the product or category you want and I'll look it up for you with verified details.",
  unavailable_here: () => "I can't do that on the page from here. I can still search the VOLTA catalogue for you, with verified prices and stock.",
  needs_confirmation: (v) => `I can do this on the page, but only if you approve it: ${v.description ?? ""}. Please check the details and confirm.`,
  action_done: (v) => `Done. ${v.title ? `The page now shows ${quote(v.title)}. ` : ""}${NOT_VERIFIED_EN}`,
  action_unverified: () => "I pressed it, but I could not see the page change, so I can't say it worked. Please check the page.",
  action_failed: () => "I couldn't do that on the page. Nothing was changed.",
  element_not_found: () => "I couldn't find that on this page, so I did nothing.",
  element_ambiguous: () => "More than one thing on the page matches that name, so I did nothing. Tell me which one you mean.",
  refused_financial: () => "I can't press payment or order buttons. You can complete that step yourself on the checkout page.",
  refused_sensitive_field: () => "I can't type into that field. Please fill it in yourself.",
  refused_injection: () => "That page contains text that looks like instructions to me, so I won't use it. I can look up verified product details instead.",
  blocked_page: () => "I can only open pages on the VOLTA.LK website, and not every page there. I can search the catalogue for you instead.",
  timeout: () => "The page took too long to load. Please try again in a moment.",
  busy: () => "The page viewer is busy right now. Please try again in a moment.",
  cancelled: () => "Okay, I cancelled that. Nothing was changed.",
  expired: () => "That approval has expired or is no longer valid, so nothing was changed. Ask me again if you still want it.",
};

const SI: Record<BrowseTemplateKey, (v: BrowseVars) => string> = {
  page_summary: (v) => `මේ පිටුවේ මට පෙනෙන්නේ${v.title ? ` ${quote(v.title)}` : ""}: ${quote(v.excerpt ?? "")} ${NOT_VERIFIED_SI}`,
  page_empty: () => "පිටුව විවෘත කළත් එහි අකුරු කියවීමට නොහැකි විය.",
  no_page_context: () => "ඔබ දැන් බලන පිටුව මට හඳුනාගත නොහැක. ඔබට අවශ්‍ය භාණ්ඩයේ හෝ වර්ගයේ නම කියන්න, තහවුරු කළ විස්තර සමඟ මම සොයා දෙන්නම්.",
  unavailable_here: () => "පිටුවේ එය කිරීමට මෙතැනින් මට බැහැ. VOLTA නාමාවලියෙන් තහවුරු කළ මිල සහ තොග සමඟ සොයා දීමට මට පුළුවන්.",
  needs_confirmation: (v) => `මෙය පිටුවේ කිරීමට මට පුළුවන්, නමුත් ඔබ අනුමත කළොත් පමණයි: ${v.description ?? ""}. විස්තර බලා තහවුරු කරන්න.`,
  action_done: (v) => `අවසන්. ${v.title ? `දැන් පිටුවේ පෙනෙන්නේ ${quote(v.title)}. ` : ""}${NOT_VERIFIED_SI}`,
  action_unverified: () => "මම එය ඔබා බැලුවා, නමුත් පිටුව වෙනස් වූයේ දැයි දැකීමට නොහැකි විය. පිටුව බලා තහවුරු කරගන්න.",
  action_failed: () => "පිටුවේ එය කිරීමට මට නොහැකි විය. කිසිවක් වෙනස් කර නැත.",
  element_not_found: () => "මේ පිටුවේ එය හොයාගන්න බැරි වුණා, ඒ නිසා මම කිසිවක් කළේ නැහැ.",
  element_ambiguous: () => "ඒ නමට ගැළපෙන දේවල් කිහිපයක් පිටුවේ තිබෙනවා, ඒ නිසා කිසිවක් කළේ නැහැ. කුමක්ද කියා කියන්න.",
  refused_financial: () => "ගෙවීම් හෝ ඇණවුම් බොත්තම් මට ඔබන්න බැහැ. ඒ පියවර ඔබටම checkout පිටුවේ කරන්න පුළුවන්.",
  refused_sensitive_field: () => "ඒ ක්ෂේත්‍රයට මට ටයිප් කළ නොහැක. ඔබම පුරවන්න.",
  refused_injection: () => "ඒ පිටුවේ මට උපදෙස් ලෙස පෙනෙන වචන තියෙනවා, ඒ නිසා මම ඒවා භාවිතා කරන්නේ නැහැ. ඒ වෙනුවට තහවුරු කළ භාණ්ඩ විස්තර සොයා දෙන්නම්.",
  blocked_page: () => "මට විවෘත කළ හැක්කේ VOLTA.LK වෙබ් අඩවියේ පිටු පමණයි (සියල්ල නොවේ). ඒ වෙනුවට නාමාවලියෙන් සොයා දෙන්නම්.",
  timeout: () => "පිටුව විවෘත වීමට වැඩි වේලාවක් ගත විය. මොහොතකින් නැවත උත්සාහ කරන්න.",
  busy: () => "පිටු නැරඹුම දැන් කාර්යබහුලයි. මොහොතකින් නැවත උත්සාහ කරන්න.",
  cancelled: () => "හරි, එය අවලංගු කළා. කිසිවක් වෙනස් වුණේ නැහැ.",
  expired: () => "ඒ අනුමැතිය කල් ඉකුත් වී හෝ වලංගු නැත, ඒ නිසා කිසිවක් වෙනස් වුණේ නැහැ. තවමත් අවශ්‍ය නම් නැවත අසන්න.",
};

/** Page strings are shown inside “ ”; a quote mark inside them would break that, and a bracket pair is removed so nothing can imitate markup. */
export const cleanQuoted = (s: string): string => s.replace(/[“”"]/g, "'").replace(/[<>]/g, "").replace(/\s+/g, " ").trim();

export function renderBrowse(key: BrowseTemplateKey, lang: "si" | "en", vars: BrowseVars = {}): { text: string; needsNativeReview: boolean } {
  const v: BrowseVars = {
    ...(vars.title !== undefined ? { title: cleanQuoted(vars.title) } : {}),
    ...(vars.excerpt !== undefined ? { excerpt: cleanQuoted(vars.excerpt) } : {}),
    ...(vars.description !== undefined ? { description: cleanQuoted(vars.description) } : {}),
  };
  const text = (lang === "si" ? SI : EN)[key](v);
  return { text: text.slice(0, 1_900), needsNativeReview: lang !== "en" };
}

/**
 * The page text in a reply must be text the browser really observed. Every “quoted” segment has to appear (after the same cleaning) inside
 * one of the observed strings (page title, page text, element names). A reply that quotes anything else is refused by the caller.
 */
export function verifyBrowseText(replyText: string, observed: readonly string[]): boolean {
  const haystacks = observed.map((o) => cleanQuoted(o).toLowerCase());
  for (const m of replyText.matchAll(/“([^”]*)”/g)) {
    const seg = (m[1] ?? "").toLowerCase().replace(/…$/, "").trim();
    if (seg.length === 0) continue;
    if (!haystacks.some((h) => h.includes(seg))) return false;
  }
  return true;
}
