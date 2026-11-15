import { SearchProviderError, type Freshness, type SearchOptions, type SearchProvider, type SearchResult } from "../types";

/**
 * DISABLED SKELETON of a "retrieval provider" adapter (the Brave Search API shape). It documents how the interface would be filled; nothing here is enabled:
 *  - it never reads an environment variable or a config file;
 *  - it throws NOT_ENABLED unless it is constructed with BOTH an explicit `fetchImpl` and a non-empty `apiKey`;
 *  - no test, script or entry point in this repository constructs it with a key, and no call has ever been made with it.
 *
 * Shape (from the vendor's public documentation as summarised in docs/VOLTA_AI_COMPLETE_ARCHITECTURE_AUDIT.md, read 2026-11-14; NOT exercised against the live
 * service, so field names must be re-checked before enabling): GET https://api.search.brave.com/res/v1/web/search?q=...&count=...&freshness=pd|pw|pm
 * with header X-Subscription-Token; results at `web.results[]` with `title`, `url`, `description`, `age`.
 * Terms to confirm before enabling: the standard plan does not allow storing results (so the search cache stays off), pricing and free credits are stated
 * inconsistently on the vendor's pages, and queries leave the shop's infrastructure (privacy notice).
 */
export interface BraveAdapterOptions {
  fetchImpl?: typeof fetch;
  apiKey?: string;
  endpoint?: string;
}

const FRESHNESS: Record<Freshness, string | undefined> = { day: "pd", week: "pw", month: "pm", any: undefined };

export class BraveSearchAdapter implements SearchProvider {
  readonly name = "brave";
  private readonly fetchImpl: typeof fetch | undefined;
  private readonly apiKey: string;
  private readonly endpoint: string;

  constructor(opts: BraveAdapterOptions = {}) {
    this.fetchImpl = opts.fetchImpl;
    this.apiKey = opts.apiKey ?? "";
    this.endpoint = opts.endpoint ?? "https://api.search.brave.com/res/v1/web/search";
  }

  get enabled(): boolean {
    return this.fetchImpl !== undefined && this.apiKey.length > 0;
  }

  async search(query: string, opts: SearchOptions = {}): Promise<SearchResult[]> {
    if (!this.fetchImpl || this.apiKey.length === 0) throw new SearchProviderError("NOT_ENABLED", "The Brave adapter is not enabled (no key and no fetch were provided).");
    const u = new URL(this.endpoint);
    u.searchParams.set("q", query);
    u.searchParams.set("count", String(Math.min(opts.limit ?? 6, 10)));
    const fresh = FRESHNESS[opts.freshness ?? "any"];
    if (fresh) u.searchParams.set("freshness", fresh);
    let res: Response;
    try {
      res = await this.fetchImpl(u, { headers: { accept: "application/json", "x-subscription-token": this.apiKey }, ...(opts.signal ? { signal: opts.signal } : {}) });
    } catch {
      throw new SearchProviderError("PROVIDER_ERROR", "The search provider could not be reached.");
    }
    if (res.status === 429) throw new SearchProviderError("RATE_LIMITED", "The search provider is rate limiting.");
    if (!res.ok) throw new SearchProviderError("PROVIDER_ERROR", `The search provider answered HTTP ${res.status}.`);
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw new SearchProviderError("PROVIDER_ERROR", "The search provider sent an unreadable answer.");
    }
    const rows = (json as { web?: { results?: unknown } })?.web?.results;
    if (!Array.isArray(rows)) return [];
    const out: SearchResult[] = [];
    for (const row of rows) {
      const r = row as Record<string, unknown>;
      if (typeof r.url !== "string" || typeof r.title !== "string") continue;
      out.push({ title: r.title, url: r.url, snippet: typeof r.description === "string" ? r.description : "", ...(typeof r.age === "string" ? { publishedAt: r.age } : {}), rank: out.length + 1 });
    }
    return out;
  }
}
