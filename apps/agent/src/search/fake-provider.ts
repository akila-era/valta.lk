import { SearchProviderError, type SearchOptions, type SearchProvider, type SearchResult } from "./types";

export interface FakeSearchCall {
  query: string;
  opts: SearchOptions;
}

/**
 * A scripted provider for tests and local development: no network, no key. `script` maps a lower-cased query substring to results; `failWith` makes every call
 * fail with the given error (to test honest failure handling).
 */
export class FakeSearchProvider implements SearchProvider {
  readonly name = "fake";
  readonly calls: FakeSearchCall[] = [];

  constructor(
    private readonly script: Record<string, SearchResult[]> | ((query: string, opts: SearchOptions) => SearchResult[]) = {},
    private readonly failWith?: SearchProviderError,
    private readonly delayMs = 0,
  ) {}

  async search(query: string, opts: SearchOptions = {}): Promise<SearchResult[]> {
    this.calls.push({ query, opts });
    if (this.delayMs > 0) await new Promise((r) => setTimeout(r, this.delayMs));
    if (opts.signal?.aborted) throw new SearchProviderError("TIMEOUT", "The search was cancelled.");
    if (this.failWith) throw this.failWith;
    if (typeof this.script === "function") return this.script(query, opts).slice(0, opts.limit ?? 10);
    const q = query.toLowerCase();
    for (const [key, results] of Object.entries(this.script)) if (q.includes(key.toLowerCase())) return results.slice(0, opts.limit ?? 10);
    return [];
  }
}
