/**
 * The web-research seams. NOTHING here talks to the internet by itself: a `SearchProvider` is an interface, tests use `FakeSearchProvider`, and the two
 * real adapter shapes in `providers/` are disabled skeletons that need an injected fetch and key (the owner has not approved any provider, key or spend).
 */
export type Freshness = "day" | "week" | "month" | "any";

export interface SearchOptions {
  limit?: number;
  freshness?: Freshness;
  /** Restrict results to these registrable domains (documentation lookup). The caller ALSO filters the results, so a provider that ignores this cannot widen the set. */
  domains?: readonly string[];
  signal?: AbortSignal;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  publishedAt?: string;
  rank: number;
}

export type SearchProviderErrorCode = "NOT_ENABLED" | "PROVIDER_ERROR" | "TIMEOUT" | "RATE_LIMITED";

export class SearchProviderError extends Error {
  constructor(readonly code: SearchProviderErrorCode, message: string) {
    super(message);
    this.name = "SearchProviderError";
  }
}

export interface SearchProvider {
  readonly name: string;
  search(query: string, opts: SearchOptions): Promise<SearchResult[]>;
}

/**
 * The second integration shape (a "grounded generation" provider: the provider's own model searches and writes an answer with citations). It is only a
 * type here. If the owner chooses it, the answer is labelled search-derived and the verifier still checks that every cited URL came from the provider's metadata.
 */
export interface GroundedAnswer {
  text: string;
  citations: { title: string; url: string }[];
}

export interface GroundedAnswerProvider {
  readonly name: string;
  answer(question: string, opts: { signal?: AbortSignal }): Promise<GroundedAnswer>;
}
