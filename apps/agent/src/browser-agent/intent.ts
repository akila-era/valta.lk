import { sanitizeText } from "../browser/policy";
import { hasSinhala } from "../util/script";

/**
 * Which messages are an EXPLICIT request to look at, or press something on, the page the shopper is on. Ordinary shopping ("laptop for office
 * work", "VOLTA website eke gaming laptop ekak hoyala denna") is NOT a browse request: it stays on the verified catalogue tools, which are the
 * only source of prices, stock and specifications. Pure text rules: no model, no I/O.
 *
 * `lang` says which wording the reply should use ("si" for Sinhala script and Singlish cues, "en" otherwise); the reply still carries the native
 * review flag for anything that is not English.
 */
export type BrowseIntent = { kind: "read_page"; lang: "si" | "en" } | { kind: "press"; name: string; lang: "si" | "en" };

const norm = (s: string) => s.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();

// "what is on this page", "summarise this page", "read this page to me", "what does this page say"
const EN_READ = [
  /\b(?:what(?:'s| is| does)|summari[sz]e|read|describe|explain|tell me (?:about|what))\b[^.?!]{0,40}\b(?:this|the current|current) page\b/,
  /\bthis page\b[^.?!]{0,30}\b(?:say|show|have|contain|about|mean)\b/,
  /\bwhat(?:'s| is) on (?:this|the) page\b/,
];
// Singlish: "me page eke monawada thiyenne", "page eke thiyena eka kiyala denna", "meka page eka kiyawala denna"
const SI_LATIN_READ = [
  /\b(?:me|mee|meke|mekhe)\s+page\s*(?:eke|eka|ekata|ekee)\b/,
  /\bpage\s*(?:eke|ekee)\s+(?:monawada|mokakda|mokada|mokak|kiyala|kiyawala|thiyenne|thiyena)\b/,
  /\bpage\s*eka\s+(?:kiyawala|kiyala|balala|balan)\b/,
];
// Sinhala script: "මේ පිටුවේ මොනවද තියෙන්නේ", "මෙම පිටුව කියවන්න"
const SI_SCRIPT_READ = [/(?:මේ|මෙම)\s*පිටුව/, /පිටුවේ\s*(?:මොනවද|මොකද|තියෙන)/, /(?:මේ|මෙම)\s*page\s*එක/];

// "click the "Add to cart" button", "press Search", "tap the Compare link"
const EN_PRESS = /^(?:please\s+)?(?:click|press|tap|hit)(?:\s+on)?(?:\s+the)?\s+(?:["“'‘]([^"”'’]{2,40})["”'’]|([a-z0-9][a-z0-9 &'-]{1,38}?)\s+(?:button|link))(?:\s+(?:button|link))?(?:\s+on this page)?[.!]?$/;
// Singlish: "\"Add to cart\" button eka click karanna", "search button eka press karanna"
const SI_PRESS = /^(?:["“'‘]([^"”'’]{2,40})["”'’]|([a-z0-9][a-z0-9 &'-]{1,38}?))\s+(?:button|link)\s*(?:eka|ekata)?\s*(?:click|press|tap)\s+(?:karanna|karala|kara)/;

function pressName(m: RegExpExecArray | null): string | null {
  const raw = m?.[1] ?? m?.[2];
  if (!raw) return null;
  const name = sanitizeText(raw, 40).replace(/[“”"<>]/g, "").trim();
  return name.length >= 2 ? name : null;
}

export function detectBrowseIntent(message: string): BrowseIntent | null {
  const text = norm(message);
  if (text.length === 0 || text.length > 300) return null;

  const en = EN_PRESS.exec(text);
  const enName = pressName(en);
  if (enName) return { kind: "press", name: enName, lang: "en" };
  const si = SI_PRESS.exec(text);
  const siName = pressName(si);
  if (siName) return { kind: "press", name: siName, lang: "si" };

  if (SI_SCRIPT_READ.some((r) => r.test(text)) || (hasSinhala(text) && /පිටුව/.test(text))) return { kind: "read_page", lang: "si" };
  if (SI_LATIN_READ.some((r) => r.test(text))) return { kind: "read_page", lang: "si" };
  if (EN_READ.some((r) => r.test(text))) return { kind: "read_page", lang: "en" };
  return null;
}
