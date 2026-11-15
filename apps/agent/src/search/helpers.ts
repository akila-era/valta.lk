import type { ToolEvidence } from "../tools/llm/evidence";
import type { SearchQuota } from "./quota";
import type { SearchProvider } from "./types";

/**
 * Pure helpers the turn loop uses around the research tools.
 *
 * `shouldOfferSearch` makes sure a search tool is only OFFERED to the model when it can actually run (a provider is configured and the quota allows a call).
 * A model that is not offered `web_search` cannot call it, so it cannot pretend a search happened: when search is off, the turn must say so honestly.
 */
export interface SearchAvailability {
  provider?: Pick<SearchProvider, "name"> | undefined;
  /** An adapter that has a key/fetch reports itself here. The fake provider is always enabled. Defaults to true when a provider is present. */
  providerEnabled?: boolean | undefined;
  quota?: SearchQuota | undefined;
}

export function shouldOfferSearch(a: SearchAvailability): boolean {
  if (!a.provider || a.providerEnabled === false) return false;
  if (!a.quota) return false;
  return a.quota.enabled("search");
}

export function shouldOfferFetch(a: SearchAvailability): boolean {
  return shouldOfferSearch(a) && a.quota !== undefined && a.quota.enabled("fetch");
}

export const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
};

/** True when `url`'s host is the allowed domain or a subdomain of it. */
export const hostMatches = (url: string, domains: readonly string[]): boolean => {
  const h = hostOf(url);
  return h !== "" && domains.some((d) => h === d.toLowerCase().replace(/^www\./, "") || h.endsWith(`.${d.toLowerCase().replace(/^www\./, "")}`));
};

export interface Citation {
  /** The number the model writes as [n]. */
  n: number;
  title: string;
  url: string;
  domain: string;
  /** "page" when the page itself was fetched this turn; "result" when only the search result (title and snippet) was seen. */
  retrieved: "page" | "result";
}

/**
 * The citations a reply may carry, built ONLY from evidence the server produced this turn (a model cannot add a source). Deduplicated by URL; a fetched page
 * outranks the search result for the same URL. `usedUrls`, when given, keeps only sources the answer actually relies on.
 */
export function buildCitations(evidence: readonly ToolEvidence[], opts: { usedUrls?: ReadonlySet<string> } = {}): Citation[] {
  const byUrl = new Map<string, Omit<Citation, "n">>();
  for (const e of evidence) {
    if ((e.kind !== "search_source" && e.kind !== "page_excerpt") || !e.sourceUrl) continue;
    if (opts.usedUrls && !opts.usedUrls.has(e.sourceUrl)) continue;
    const retrieved = e.kind === "page_excerpt" ? "page" : "result";
    const prev = byUrl.get(e.sourceUrl);
    if (prev && prev.retrieved === "page") continue;
    byUrl.set(e.sourceUrl, { title: e.title && e.title !== "" ? e.title : hostOf(e.sourceUrl), url: e.sourceUrl, domain: hostOf(e.sourceUrl), retrieved });
  }
  return [...byUrl.values()].map((c, i) => ({ n: i + 1, ...c }));
}

// ---------- the server floor for search queries (the model decides WHEN to search, the server decides what may be sent) ----------

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE = /(?:\(?\+?\d[\d\s().-]{7,}\d)/g;

/**
 * A digit run is only a PHONE NUMBER when it looks like one: it starts with + or with a 0 (national format) and has 9 to 15 digits, or it is the grouped
 * 3-3-4 shape. A list of years or specifications ("2024 2025 2026", "6.1 inch 120 Hz 5000") has the same characters but is ordinary search text and must stay.
 */
function looksLikePhone(run: string): boolean {
  const digits = run.replace(/\D/g, "");
  if (digits.length < 9 || digits.length > 15) return false;
  const t = run.trim().replace(/^\(/, "");
  if (t.startsWith("+") || t.startsWith("0")) return true;
  return /^\d{3}[\s.-]\d{3}[\s.-]\d{4}$/.test(t);
}
const NIC = /\b(?:\d{9}[vVxX]|\d{12})\b/g;
const LONG_DIGITS = /\b\d{9,}\b/g;
const URL_LIKE = /\bhttps?:\/\/\S+/gi;

export interface QueryCheck {
  ok: boolean;
  /** The query that may be sent (personal tokens removed). */
  query: string;
  redacted: boolean;
  refusal?: "empty" | "not_searchable" | "use_store_tools";
}

const GREETING = /^(?:hi|hello|hey|thanks?|thank you|ayubowan|kohomada|ok(?:ay)?|bye)\b[\s!.?]*$/i;
const STORE_LOOKUP = /\b(?:volta|valta)\b.{0,40}\b(?:price|stock|available|availability|in stock)\b|\b(?:price|stock|availability)\b.{0,40}\b(?:at|in|on|of) (?:volta|valta)\b/i;

/** Removes e-mail addresses, phone numbers, NIC-like and long digit runs and URLs from a query, and refuses queries that must never leave the shop. */
export function checkSearchQuery(raw: string): QueryCheck {
  const stripped = raw.replace(EMAIL, " ").replace(NIC, " ").replace(PHONE, (m) => (looksLikePhone(m) ? " " : m)).replace(LONG_DIGITS, " ").replace(URL_LIKE, " ").replace(/\s+/g, " ").trim();
  const redacted = stripped !== raw.replace(/\s+/g, " ").trim();
  if (stripped.length === 0) return { ok: false, query: "", redacted, refusal: "empty" };
  if (GREETING.test(stripped)) return { ok: false, query: stripped, redacted, refusal: "not_searchable" };
  if (STORE_LOOKUP.test(stripped)) return { ok: false, query: stripped, redacted, refusal: "use_store_tools" };
  return { ok: true, query: stripped.slice(0, 200), redacted };
}
