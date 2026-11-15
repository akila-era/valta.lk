import { beforeAll, describe, expect, it } from "vitest";
import {
  BraveSearchAdapter,
  buildCitations,
  checkSearchQuery,
  DISABLED_QUOTA,
  FakeSearchProvider,
  GeminiGroundingAdapter,
  hostMatches,
  hostOf,
  normaliseQuery,
  searchCacheKey,
  SearchProviderError,
  SearchQuota,
  shouldOfferFetch,
  shouldOfferSearch,
  TtlCache,
  type SearchResult,
} from "../../src/search";
import type { ToolEvidence } from "../../src/tools/llm";

beforeAll(() => {
  globalThis.fetch = (() => {
    throw new Error("outbound network call in a unit test");
  }) as typeof fetch;
});

const R = (n: number): SearchResult => ({ title: `T${n}`, url: `https://example.org/${n}`, snippet: `s${n}`, rank: n });

describe("FakeSearchProvider", () => {
  it("matches a lower-cased query substring and respects the limit", async () => {
    const p = new FakeSearchProvider({ android: [R(1), R(2), R(3)] });
    expect((await p.search("Latest ANDROID news", { limit: 2 })).map((r) => r.title)).toEqual(["T1", "T2"]);
    expect(await p.search("something else", {})).toEqual([]);
    expect(p.calls).toHaveLength(2);
  });
  it("supports a function script, a forced failure and a cancelled call", async () => {
    expect(await new FakeSearchProvider((q) => [R(q.length)]).search("abcd", {})).toHaveLength(1);
    await expect(new FakeSearchProvider({}, new SearchProviderError("RATE_LIMITED", "x")).search("q", {})).rejects.toMatchObject({ code: "RATE_LIMITED" });
    const ctl = new AbortController();
    ctl.abort();
    await expect(new FakeSearchProvider({}).search("q", { signal: ctl.signal })).rejects.toMatchObject({ code: "TIMEOUT" });
  });
});

describe("provider adapters are DISABLED skeletons", () => {
  it("Brave refuses without BOTH an injected fetch and a key, and never reads the environment", async () => {
    process.env.BRAVE_API_KEY = "must-not-be-read";
    process.env.BRAVE_SEARCH_API_KEY = "must-not-be-read";
    expect(new BraveSearchAdapter().enabled).toBe(false);
    await expect(new BraveSearchAdapter().search("q")).rejects.toMatchObject({ code: "NOT_ENABLED" });
    await expect(new BraveSearchAdapter({ apiKey: "k" }).search("q")).rejects.toMatchObject({ code: "NOT_ENABLED" });
    await expect(new BraveSearchAdapter({ fetchImpl: (() => { throw new Error("called"); }) as never }).search("q")).rejects.toMatchObject({ code: "NOT_ENABLED" });
    delete process.env.BRAVE_API_KEY;
    delete process.env.BRAVE_SEARCH_API_KEY;
  });

  it("Gemini grounding refuses without fetch, key AND model, and never reads the environment", async () => {
    process.env.GEMINI_API_KEY = "must-not-be-read";
    expect(new GeminiGroundingAdapter().enabled).toBe(false);
    await expect(new GeminiGroundingAdapter({ apiKey: "k", fetchImpl: fetch }).answer("q")).rejects.toMatchObject({ code: "NOT_ENABLED" });
    delete process.env.GEMINI_API_KEY;
  });

  it("with an injected fake fetch the Brave adapter maps results and errors (the key goes only in the header, never the URL)", async () => {
    const calls: { url: string; headers: Record<string, string> }[] = [];
    const fake = (async (u: URL | string, init?: { headers?: Record<string, string> }) => {
      calls.push({ url: String(u), headers: init?.headers ?? {} });
      return new Response(JSON.stringify({ web: { results: [{ title: "A", url: "https://a.test/", description: "d", age: "2 days ago" }, { title: 5, url: "x" }, { url: "https://b.test/", title: "B" }] } }));
    }) as unknown as typeof fetch;
    const a = new BraveSearchAdapter({ fetchImpl: fake, apiKey: "KEY123" });
    const out = await a.search("android 16", { limit: 50, freshness: "week" });
    expect(out.map((r) => r.title)).toEqual(["A", "B"]);
    expect(out[0]).toMatchObject({ snippet: "d", publishedAt: "2 days ago", rank: 1 });
    expect(calls[0]!.url).not.toContain("KEY123");
    expect(calls[0]!.url).toContain("count=10");
    expect(calls[0]!.url).toContain("freshness=pw");
    expect(calls[0]!.headers["x-subscription-token"]).toBe("KEY123");
    const limited = new BraveSearchAdapter({ fetchImpl: (async () => new Response("", { status: 429 })) as never, apiKey: "k" });
    await expect(limited.search("q")).rejects.toMatchObject({ code: "RATE_LIMITED" });
    const broken = new BraveSearchAdapter({ fetchImpl: (async () => new Response("not json")) as never, apiKey: "k" });
    await expect(broken.search("q")).rejects.toMatchObject({ code: "PROVIDER_ERROR" });
    const down = new BraveSearchAdapter({ fetchImpl: (async () => { throw new Error("ECONNRESET key=k"); }) as never, apiKey: "k" });
    const e = await down.search("q").catch((x: Error) => x);
    expect(String((e as Error).message)).not.toContain("ECONNRESET");
  });
});

describe("SearchQuota: every cap defaults to 0 = nothing runs", () => {
  it("is disabled by default and refuses without counting", () => {
    const q = new SearchQuota();
    expect(q.enabled("search")).toBe(false);
    expect(q.tryConsume("search", "s")).toEqual({ ok: false, reason: "disabled" });
    expect(q.usage().month.search).toBe(0);
    expect(DISABLED_QUOTA.dailySearches).toBe(0);
  });

  it("is enabled only when the session, daily AND monthly caps are all above zero", () => {
    expect(new SearchQuota({ perSessionSearches: 1, dailySearches: 1, monthlySearches: 0 }).enabled("search")).toBe(false);
    expect(new SearchQuota({ perSessionSearches: 1, dailySearches: 1, monthlySearches: 1 }).enabled("search")).toBe(true);
    expect(new SearchQuota({ perSessionSearches: 1, dailySearches: 1, monthlySearches: 1 }).enabled("fetch")).toBe(false);
  });

  it("enforces the session, day and month caps in that order and never counts a refused call", () => {
    let now = Date.UTC(2026, 10, 14, 12);
    const q = new SearchQuota({ perSessionSearches: 2, dailySearches: 3, monthlySearches: 4 }, () => now);
    expect(q.tryConsume("search", "a").ok).toBe(true);
    expect(q.tryConsume("search", "a").ok).toBe(true);
    expect(q.tryConsume("search", "a")).toEqual({ ok: false, reason: "session_cap" });
    expect(q.tryConsume("search", "b").ok).toBe(true);
    expect(q.tryConsume("search", "c")).toEqual({ ok: false, reason: "daily_cap" });
    expect(q.usage().day.search).toBe(3);
    now += 24 * 3_600_000; // next UTC day: the daily counter rolls, the monthly one does not
    expect(q.tryConsume("search", "c").ok).toBe(true);
    expect(q.tryConsume("search", "d")).toEqual({ ok: false, reason: "monthly_cap" });
    now += 31 * 24 * 3_600_000;
    expect(q.tryConsume("search", "e").ok).toBe(true);
  });

  it("the kill switch stops everything at once and can be released", () => {
    const q = new SearchQuota({ perSessionSearches: 9, dailySearches: 9, monthlySearches: 9 });
    q.setKillSwitch(true);
    expect(q.enabled("search")).toBe(false);
    expect(q.tryConsume("search", "s")).toEqual({ ok: false, reason: "kill_switch" });
    q.setKillSwitch(false);
    expect(q.tryConsume("search", "s").ok).toBe(true);
  });

  it("searches and fetches are counted separately", () => {
    const q = new SearchQuota({ perSessionSearches: 1, dailySearches: 1, monthlySearches: 1, perSessionFetches: 2, dailyFetches: 2, monthlyFetches: 2 });
    expect(q.tryConsume("search", "s").ok).toBe(true);
    expect(q.tryConsume("fetch", "s").ok).toBe(true);
    expect(q.tryConsume("fetch", "s").ok).toBe(true);
    expect(q.tryConsume("fetch", "s").ok).toBe(false);
  });

  it("a full session table loosens only the per-conversation cap, never the day or month caps", () => {
    const q = new SearchQuota({ perSessionSearches: 1, dailySearches: 6_000, monthlySearches: 6_000 });
    for (let i = 0; i < 5_001; i++) q.tryConsume("search", `s${i}`);
    expect(q.usage().day.search).toBe(5_001);
    const caps = new SearchQuota({ perSessionSearches: 1_000_000, dailySearches: 2, monthlySearches: 2 });
    for (let i = 0; i < 5_100; i++) caps.tryConsume("search", `x${i}`);
    expect(caps.usage().day.search).toBe(2);
  });

  it("estimates cost only from configured unit prices (default 0: no price is invented) and raises alerts at 50% and 80%", () => {
    const q = new SearchQuota({ perSessionSearches: 99, dailySearches: 10, monthlySearches: 100, unitPriceUsdPerSearch: 0.014 });
    for (let i = 0; i < 5; i++) q.tryConsume("search", "s");
    expect(q.usage()).toMatchObject({ alert: "warn", estimatedCostUsdMonth: 5 * 0.014 });
    for (let i = 0; i < 3; i++) q.tryConsume("search", "s");
    expect(q.usage().alert).toBe("critical");
    expect(new SearchQuota({ perSessionSearches: 9, dailySearches: 9, monthlySearches: 9 }).usage().estimatedCostUsdMonth).toBe(0);
  });

  it("rejects an invalid configuration instead of guessing", () => {
    expect(() => new SearchQuota({ dailySearches: -1 })).toThrow(/at least 0/);
    expect(() => new SearchQuota({ dailySearches: Number.NaN })).toThrow();
  });
});

describe("TtlCache and cache keys", () => {
  it("is OFF by default (ttl 0): nothing is stored, because a provider's terms may forbid storing results", () => {
    const c = new TtlCache<number>();
    c.set("k", 1);
    expect(c.enabled).toBe(false);
    expect(c.get("k")).toBeUndefined();
    expect(c.size()).toBe(0);
  });
  it("expires entries with the clock and evicts the oldest first", () => {
    let now = 0;
    const c = new TtlCache<number>({ ttlMs: 100, maxEntries: 2, now: () => now });
    c.set("a", 1);
    c.set("b", 2);
    c.set("c", 3);
    expect(c.get("a")).toBeUndefined();
    expect(c.get("b")).toBe(2);
    now = 150;
    expect(c.get("b")).toBeUndefined();
  });
  it("the same question gives the same key whatever the case, spacing, punctuation, zero-width characters or Unicode form", () => {
    const k = searchCacheKey("Latest Android  update?");
    expect(searchCacheKey("  latest android update ")).toBe(k);
    expect(searchCacheKey("latest​android‍update!!")).toBe(k.replace("latest android update", normaliseQuery("latest​android‍update!!")));
    expect(normaliseQuery("ＬＡＴＥＳＴ")).toBe("latest");
    expect(searchCacheKey("q", "week")).not.toBe(searchCacheKey("q", "day"));
    expect(searchCacheKey("q", "any", ["b.com", "a.com"])).toBe(searchCacheKey("q", "any", ["a.com", "b.com"]));
  });
});

describe("shouldOfferSearch / shouldOfferFetch", () => {
  const on = new SearchQuota({ perSessionSearches: 1, dailySearches: 1, monthlySearches: 1, perSessionFetches: 1, dailyFetches: 1, monthlyFetches: 1 });
  it("needs a provider, an enabled provider and a quota", () => {
    expect(shouldOfferSearch({})).toBe(false);
    expect(shouldOfferSearch({ provider: { name: "x" } })).toBe(false);
    expect(shouldOfferSearch({ provider: { name: "x" }, quota: new SearchQuota() })).toBe(false);
    expect(shouldOfferSearch({ provider: { name: "x" }, providerEnabled: false, quota: on })).toBe(false);
    expect(shouldOfferSearch({ provider: { name: "x" }, quota: on })).toBe(true);
  });
  it("fetching also needs searching and its own quota", () => {
    expect(shouldOfferFetch({ provider: { name: "x" }, quota: on })).toBe(true);
    expect(shouldOfferFetch({ provider: { name: "x" }, quota: new SearchQuota({ perSessionSearches: 1, dailySearches: 1, monthlySearches: 1 }) })).toBe(false);
  });
});

describe("hostOf / hostMatches", () => {
  it("normalises www and case; a bad URL gives an empty host", () => {
    expect(hostOf("https://WWW.Example.org/a")).toBe("example.org");
    expect(hostOf("nonsense")).toBe("");
  });
  it("matches the domain and its subdomains, never lookalikes", () => {
    const d = ["android.com"];
    expect(hostMatches("https://developer.android.com/x", d)).toBe(true);
    expect(hostMatches("https://android.com/", d)).toBe(true);
    expect(hostMatches("https://evil-android.com/", d)).toBe(false);
    expect(hostMatches("https://android.com.evil.test/", d)).toBe(false);
    expect(hostMatches("https://notandroid.com/", d)).toBe(false);
    expect(hostMatches("", d)).toBe(false);
  });
});

describe("buildCitations: only what the server retrieved", () => {
  const ev = (kind: ToolEvidence["kind"], url: string | undefined, title?: string): ToolEvidence => ({ tool: "t", kind, facts: {}, ...(url ? { sourceUrl: url } : {}), ...(title ? { title } : {}) });
  it("numbers sources in order, deduplicates by URL and lets a fetched page outrank the bare result", () => {
    const c = buildCitations([ev("search_source", "https://a.org/1", "A result"), ev("search_source", "https://b.org/2", "B"), ev("page_excerpt", "https://a.org/1", "A page"), ev("search_source", "https://a.org/1", "A again")]);
    expect(c).toEqual([
      { n: 1, title: "A page", url: "https://a.org/1", domain: "a.org", retrieved: "page" },
      { n: 2, title: "B", url: "https://b.org/2", domain: "b.org", retrieved: "result" },
    ]);
  });
  it("ignores store evidence and evidence without a URL, falls back to the host as the title, and can keep only used URLs", () => {
    const c = buildCitations([ev("product", "https://shop.test/p"), ev("search_source", undefined), ev("search_source", "https://c.org/x"), ev("search_source", "https://d.org/y", "D")], { usedUrls: new Set(["https://c.org/x"]) });
    expect(c).toEqual([{ n: 1, title: "c.org", url: "https://c.org/x", domain: "c.org", retrieved: "result" }]);
  });
});

describe("checkSearchQuery: the server floor for what may leave the shop", () => {
  it("removes e-mail addresses, phone numbers, NIC numbers, long digit runs and URLs and says it did", () => {
    const r = checkSearchQuery("my email a.b@example.com phone 0771234567 nic 199012345678 https://x.test/a?b=1 galaxy s24 price");
    expect(r.ok).toBe(true);
    expect(r.redacted).toBe(true);
    expect(r.query).toBe("my email phone nic galaxy s24 price");
    for (const s of ["a.b@example.com", "0771234567", "199012345678", "x.test"]) expect(r.query).not.toContain(s);
  });
  it("removes international and grouped phone forms", () => {
    for (const p of ["+94 77 123 4567", "+94771234567", "077 123 4567", "077-123-4567", "(011) 234 5678"]) expect(checkSearchQuery(`call ${p} about android`).query).toBe("call about android");
  });
  it("REGRESSION: lists of years, versions and specifications are NOT phone numbers", () => {
    for (const q of ["samsung 2024 2025 2026 models", "android 14 15 16 2025 update", "6.1 inch 120 Hz 5000 mAh phones", "ddr5 5600 6000 6400 8000 mt/s", "iphone 15 16 17 2025 2026"]) {
      const r = checkSearchQuery(q);
      expect(r.query, q).toBe(q);
      expect(r.redacted).toBe(false);
    }
  });
  it("refuses an empty query, a greeting and a store price lookup, with a reason", () => {
    expect(checkSearchQuery("   ").refusal).toBe("empty");
    expect(checkSearchQuery("0771234567").refusal).toBe("empty");
    expect(checkSearchQuery("Hello!").refusal).toBe("not_searchable");
    expect(checkSearchQuery("price of lumen p1 at volta").refusal).toBe("use_store_tools");
    expect(checkSearchQuery("volta stock of zenix z9").refusal).toBe("use_store_tools");
  });
  it("caps the query at 200 characters", () => {
    expect(checkSearchQuery("word ".repeat(100)).query.length).toBeLessThanOrEqual(200);
  });
  it("is fast on hostile input", () => {
    const t0 = performance.now();
    checkSearchQuery("1 ".repeat(50_000));
    checkSearchQuery("+" + "9 ".repeat(50_000));
    checkSearchQuery("a@".repeat(30_000));
    expect(performance.now() - t0).toBeLessThan(2_000);
  });
});
