import { PAGE_PATH } from "./schema";

/** Pages whose address or query can hold personal or sensitive data: the widget never reports them as the page the shopper is on. */
const NEVER_REPORT = /^\/(?:checkout|account|admin|track-order|api|order-confirmation|login|register|auth)(?:\/|\?|$)/i;

/**
 * The page path the widget may send as `context.path` (contract 1.3): the pathname plus the query, only for pages that are not sensitive, only when
 * it fits the shape and size the Agent accepts. Anything else returns undefined and the widget sends nothing. It is an untrusted hint: the Agent
 * re-checks it against its own URL policy before any browser use, and nothing here opens a page.
 */
export function pagePathFor(pathname: string, search = ""): string | undefined {
  if (!pathname.startsWith("/") || NEVER_REPORT.test(pathname)) return undefined;
  const q = search && search !== "?" ? (search.startsWith("?") ? search : `?${search}`) : "";
  const full = `${pathname}${q}`;
  if (full.length > 200) return pathname.length <= 200 && PAGE_PATH.test(pathname) ? pathname : undefined;
  return PAGE_PATH.test(full) ? full : PAGE_PATH.test(pathname) ? pathname : undefined;
}
