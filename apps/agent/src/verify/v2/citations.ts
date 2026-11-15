import { indexProducts } from "./evidence";
import { fold, makeIssue, squeeze, tokens } from "./text";
import type { Issue, SentenceSpan, VerifyV2Input } from "./types";

/**
 * Links, citation markers and "I searched" statements. Only pages the server fetched THIS turn may be cited; a search is only claimed when one ran.
 * A model-knowledge link that matches nothing fetched is stripped (`unsourced_link`); a source dressed up as if it came from a search is `fabricated_source`.
 */
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"'`)\]}]+/giu;
const BARE_DOMAIN_RE = /(?<![\p{L}\p{N}@./-])(?:[a-z0-9-]+\.)+(?:com|org|net|lk|io|dev|gov|edu|co|info|app|ai|me|tech|shop|store)(?![\p{L}\p{N}-])(?:\/[^\s<>"'`)\]}]*)?/giu;

export interface FoundUrl {
  raw: string;
  start: number;
  end: number;
  host: string;
  key: string;
}

/** Normalised identity of a URL: host without "www.", path without a trailing slash, no query or fragment. */
export function urlKey(raw: string): { host: string; key: string } | null {
  let s = raw.trim().replace(/[.,;:!?]+$/u, "");
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const path = u.pathname.replace(/\/+$/, "");
    return { host, key: `${host}${path}` };
  } catch {
    return null;
  }
}

export function findUrls(text: string): FoundUrl[] {
  const out: FoundUrl[] = [];
  const seen: [number, number][] = [];
  const push = (m: RegExpMatchArray): void => {
    const start = m.index!;
    const raw = m[0].replace(/[.,;:!?]+$/u, "");
    const end = start + raw.length;
    if (seen.some(([a, b]) => start < b && end > a)) return;
    const k = urlKey(raw);
    if (!k) return;
    seen.push([start, end]);
    out.push({ raw, start, end, host: k.host, key: k.key });
  };
  for (const m of text.matchAll(URL_RE)) push(m);
  for (const m of text.matchAll(BARE_DOMAIN_RE)) push(m);
  return out.sort((a, b) => a.start - b.start);
}

const SEARCH_CLAIMS: RegExp[] = [
  /\b(?:i|we)\s+(?:just\s+|also\s+)?(?:searched|googled|looked\s+(?:it\s+)?up|checked\s+(?:online|the\s+web|the\s+internet|the\s+official\s+(?:site|website))|did\s+a\s+(?:quick\s+)?(?:web\s+|online\s+)?search|ran\s+a\s+(?:web\s+)?search|browsed\s+the\s+web|searched\s+the\s+(?:web|internet))\b/u,
  /\baccording\s+to\s+(?:my\s+|a\s+|the\s+|our\s+)?(?:web\s+|online\s+|internet\s+)?search\b/u,
  /\b(?:search\s+results?|my\s+search)\s+(?:show|shows|says|indicate|indicates|found|suggest|suggests)\b/u,
  /\bi\s+found\s+(?:this|it|that)\s+(?:online|on\s+the\s+(?:web|internet))\b/u,
  /(?:search\s*kala|searched\s*karala|search\s*karala|google\s*(?:kala|karala)|online\s*(?:check\s*karala|balala|balanawa))/u,
  /සොයා\s*බැලුවා|සෙවුවා|ගූගල්\s*කළා|අන්තර්ජාලයේ\s*(?:සොයා|බලා)|ඔන්ලයින්\s*(?:බැලුවා|සෙව්වා)/u,
];

const SOURCE_LABEL = /^\s*(?:sources?|references?|source link|මූලාශ්‍ර(?:ය|ය:)?|මූලාශ්‍රය|mulashraya)\s*:/imu;

export function checkCitations(text: string, folded: string, spans: readonly SentenceSpan[], input: VerifyV2Input): Issue[] {
  const issues: Issue[] = [];
  const fetched = input.sourcesFetchedThisTurn;
  const fetchedKeys = new Map<string, string>();
  const fetchedHosts = new Set<string>();
  for (const s of fetched) {
    const k = urlKey(s.url);
    if (k) {
      fetchedKeys.set(k.key, s.url);
      fetchedHosts.add(k.host);
    }
  }
  const allowedHosts = new Set((input.policy?.allowedLinkHosts ?? ["valta.hexalyte.com"]).map((h) => h.toLowerCase().replace(/^www\./, "")));
  const evidenceKeys = new Set<string>();
  for (const p of indexProducts(input.toolEvidence)) for (const u of p.urls) { const k = urlKey(u); if (k) evidenceKeys.add(k.key); }
  for (const e of input.toolEvidence) if (e.url) { const k = urlKey(e.url); if (k) evidenceKeys.add(k.key); }

  const urls = findUrls(text);
  const marker = [...text.matchAll(/\[(\d{1,2})\]/g)];
  const labelled = SOURCE_LABEL.test(text);
  const dressedAsSearch = input.searchPerformed || marker.length > 0 || labelled;

  for (const u of urls) {
    if (fetchedKeys.has(u.key) || evidenceKeys.has(u.key)) continue;
    if (allowedHosts.has(u.host)) continue;
    if (dressedAsSearch && !fetchedHosts.has(u.host)) issues.push(makeIssue("fabricated_source", spans, u.start, u.end, { host: u.host }));
    else issues.push(makeIssue("unsourced_link", spans, u.start, u.end, { host: u.host }));
  }

  // [n] markers must point at a source fetched this turn
  for (const m of marker) {
    const n = Number(m[1]);
    if (n < 1 || n > fetched.length) issues.push(makeIssue("citation_invalid", spans, m.index!, m.index! + m[0].length, { marker: n, sources: fetched.length }));
  }
  // "Source:" with nothing fetched
  if (labelled && fetched.length === 0 && urls.length === 0) {
    const m = SOURCE_LABEL.exec(text);
    issues.push(makeIssue("citation_invalid", spans, m?.index ?? 0, (m?.index ?? 0) + (m?.[0].length ?? 0), { reason: "no_sources" }));
  }

  // "I searched ..." without a search (or a search that returned nothing)
  for (const re of SEARCH_CLAIMS) {
    const m = re.exec(folded);
    if (!m) continue;
    if (!input.searchPerformed || fetched.length === 0) issues.push(makeIssue("search_claimed_without_search", spans, m.index, m.index + m[0].length, { searchPerformed: input.searchPerformed, sources: fetched.length }));
    break;
  }

  // The answer uses search content but cites nothing
  const requireCitations = input.policy?.requireCitationsWhenSearched ?? true;
  if (requireCitations && input.searchPerformed && fetched.length > 0 && marker.length === 0 && urls.length === 0 && usesSourceContent(text, input)) {
    issues.push(makeIssue("citation_missing", spans, 0, Math.min(text.length, spans[0]?.end ?? text.length), { sources: fetched.length }));
  }

  // Cheap lexical support for cited sentences (a heuristic, reported as a warning). The sentence's tokens are computed ONCE per sentence and each source's tokens
  // once per marker number, and at most 20 distinct markers are judged per sentence (a page full of "[1][1][1]..." must not cost a quadratic amount of work).
  const excerptTokens = new Map<number, { text: string; tokens: Set<string> } | null>();
  for (const s of spans) {
    const refs = [...new Set([...s.text.matchAll(/\[(\d{1,2})\]/g)].map((m) => Number(m[1])))].slice(0, 20);
    if (refs.length === 0) continue;
    const stripped = s.text.replace(/\[\d{1,2}\]/g, " ");
    const sent = tokens(stripped);
    const numbers = [...fold(stripped).matchAll(/\d+(?:\.\d+)?/g)].map((m) => m[0]).slice(0, 50);
    for (const n of refs) {
      let cached = excerptTokens.get(n);
      if (cached === undefined) {
        const e0 = sourceExcerpt(input, n);
        cached = e0 === undefined || e0.length < 20 ? null : { text: fold(e0), tokens: tokens(e0) };
        excerptTokens.set(n, cached);
      }
      if (cached === null) continue;
      const ex = cached.tokens;
      const e = cached.text;
      let overlap = 0;
      for (const t of sent) if (ex.has(t)) overlap++;
      const numberSupported = numbers.length > 0 && numbers.some((x) => e.includes(x));
      if (overlap < 2 && !numberSupported && sent.size >= 4) issues.push(makeIssue("citation_unsupported", spans, s.start, s.end, { marker: n, overlap }));
    }
  }
  return issues;
}

function sourceExcerpt(input: VerifyV2Input, n: number): string | undefined {
  const src = input.sourcesFetchedThisTurn[n - 1];
  if (!src) return undefined;
  const k = urlKey(src.url)?.key;
  for (const e of input.toolEvidence) {
    const ek = e.source?.url ? urlKey(e.source.url)?.key : undefined;
    if ((e.kind === "search_source" || e.kind === "page_excerpt") && e.excerpt && ek && ek === k) return `${src.title ?? ""} ${e.excerpt}`;
  }
  return src.title;
}

/** True when some sentence shares enough significant words (or a number) with a fetched excerpt to look derived from it. */
function usesSourceContent(text: string, input: VerifyV2Input): boolean {
  const answer = tokens(text);
  for (const e of input.toolEvidence) {
    if ((e.kind !== "search_source" && e.kind !== "page_excerpt") || !e.excerpt) continue;
    const ex = tokens(`${e.source?.title ?? ""} ${e.excerpt}`);
    let overlap = 0;
    for (const t of answer) if (ex.has(t)) overlap++;
    if (overlap >= 4) return true;
    const nums = [...fold(text).matchAll(/\d+(?:\.\d+)+/g)].map((m) => m[0]); // versions like 15.1
    if (nums.some((x) => fold(e.excerpt!).includes(x))) return true;
  }
  void squeeze;
  return false;
}
