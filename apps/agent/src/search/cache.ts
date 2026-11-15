/**
 * A small in-memory cache with a TTL, for search results. DEFAULT TTL IS 0 (disabled): at least one candidate provider's standard plan does not allow storing
 * results, so caching stays off until the owner has confirmed the provider's terms. Memory only; never persisted.
 */
export class TtlCache<V> {
  private readonly map = new Map<string, { value: V; expiresAt: number }>();

  constructor(private readonly opts: { ttlMs?: number; maxEntries?: number; now?: () => number } = {}) {}

  private now(): number {
    return (this.opts.now ?? Date.now)();
  }

  get enabled(): boolean {
    return (this.opts.ttlMs ?? 0) > 0;
  }

  get(key: string): V | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt <= this.now()) {
      this.map.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key: string, value: V): void {
    if (!this.enabled) return;
    const max = this.opts.maxEntries ?? 200;
    if (this.map.size >= max) this.map.delete(this.map.keys().next().value as string); // oldest first
    this.map.set(key, { value, expiresAt: this.now() + (this.opts.ttlMs ?? 0) });
  }

  size(): number {
    return this.map.size;
  }
}

/** Same question, same key: case, spacing, edge punctuation and Unicode forms do not matter. */
export function normaliseQuery(query: string): string {
  return query.normalize("NFKC").toLowerCase().replace(/[\s​-‏]+/g, " ").replace(/^[\s.,;:!?"'()-]+|[\s.,;:!?"'()-]+$/g, "");
}

export const searchCacheKey = (query: string, freshness = "any", domains: readonly string[] = []): string => `${normaliseQuery(query)}|${freshness}|${[...domains].sort().join(",")}`;
