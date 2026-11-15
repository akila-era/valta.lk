import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSafeFetcher, createSafeFetcherForTests, FetchRefused, type FetchRefusal } from "../../src/search";

/**
 * SafeFetcher: the research lane's page reader. The production fetcher is tested with resolvers that only return NON-public addresses (so a refusal is proven to
 * happen BEFORE any connection); the happy path, redirects, rebinding, caps and timeouts run against a loopback fixture server through the test-only factory.
 * The global fetch is replaced so nothing here can reach the network by that route either.
 */
let server: http.Server;
let port = 0;
const seen: { path: string; headers: http.IncomingHttpHeaders }[] = [];

beforeAll(async () => {
  globalThis.fetch = (() => {
    throw new Error("outbound network call in a unit test");
  }) as typeof fetch;
  server = http.createServer((req, res) => {
    const path = req.url ?? "/";
    seen.push({ path, headers: req.headers });
    const html = (body: string, extra: Record<string, string> = {}) => {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", ...extra });
      res.end(body);
    };
    if (path === "/ok") return html("<html><title>Fixture</title><body><p>Hello fixture page.</p></body></html>", { "set-cookie": "sid=secret; Path=/" });
    if (path === "/text") {
      res.writeHead(200, { "content-type": "text/plain" });
      return res.end("plain text body");
    }
    if (path === "/pdf") {
      res.writeHead(200, { "content-type": "application/pdf" });
      return res.end("%PDF-1.4");
    }
    if (path === "/bin") {
      res.writeHead(200, { "content-type": "application/octet-stream" });
      return res.end("xx");
    }
    if (path === "/missing-type") {
      res.writeHead(200);
      return res.end("no content type");
    }
    if (path === "/big") return html("<p>" + "a".repeat(600_000) + "</p>");
    if (path === "/slow") return void setTimeout(() => (res.writableEnded ? undefined : html("late")), 5_000).unref();
    if (path === "/trickle") {
      res.writeHead(200, { "content-type": "text/html" });
      const t = setInterval(() => res.write("x"), 100);
      res.on("close", () => clearInterval(t));
      return;
    }
    if (path === "/r1") return void res.writeHead(302, { location: "/ok" }).end();
    if (path === "/r-chain-1") return void res.writeHead(302, { location: "/r-chain-2" }).end();
    if (path === "/r-chain-2") return void res.writeHead(301, { location: "/r-chain-3" }).end();
    if (path === "/r-chain-3") return void res.writeHead(307, { location: "/r-chain-4" }).end();
    if (path === "/r-chain-4") return void res.writeHead(308, { location: "/ok" }).end();
    if (path === "/loop") return void res.writeHead(302, { location: "/loop" }).end();
    if (path === "/r-private") return void res.writeHead(302, { location: "http://10.0.0.5/admin" }).end();
    if (path === "/r-metadata") return void res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" }).end();
    if (path === "/r-file") return void res.writeHead(302, { location: "file:///etc/passwd" }).end();
    if (path === "/r-userinfo") return void res.writeHead(302, { location: "http://u:p@fixture.test/ok" }).end();
    if (path === "/r-badport") return void res.writeHead(302, { location: "http://fixture.test:6379/" }).end();
    if (path === "/r-nolocation") return void res.writeHead(302).end();
    if (path === "/err500") return void res.writeHead(500).end("oops");
    if (path === "/latin1") {
      res.writeHead(200, { "content-type": "text/html; charset=iso-8859-1" });
      return res.end(Buffer.from([0x3c, 0x70, 0x3e, 0x63, 0x61, 0x66, 0xe9, 0x3c, 0x2f, 0x70, 0x3e]));
    }
    if (path === "/badcharset") {
      res.writeHead(200, { "content-type": "text/html; charset=bogus-charset" });
      return res.end("<p>ok</p>");
    }
    if (path === "/rebind-start") return void res.writeHead(302, { location: "http://rebind.test:" + port + "/ok" }).end();
    res.writeHead(404).end("nf");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = (server.address() as AddressInfo).port;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const fixtureResolver = async (host: string): Promise<string[]> => (host === "fixture.test" || host === "other.test" ? ["127.0.0.1"] : []);
const testFetcher = (over: Partial<Parameters<typeof createSafeFetcherForTests>[0]> = {}) =>
  createSafeFetcherForTests({ resolver: fixtureResolver, maxBytes: 100_000, timeoutMs: 2_000, ...over, testOnly: { treatAsPublic: ["127.0.0.1"], allowPorts: [port] } });
const url = (p: string, host = "fixture.test") => `http://${host}:${port}${p}`;

async function refusal(f: { fetch(u: string, o?: { signal?: AbortSignal }): Promise<unknown> }, u: string): Promise<FetchRefusal> {
  try {
    await f.fetch(u);
  } catch (e) {
    if (e instanceof FetchRefused) return e.reason;
    throw e;
  }
  throw new Error(`expected a refusal for ${u}`);
}

describe("production fetcher: every blocked destination is refused BEFORE any connection", () => {
  const privateResolver = (addr: string) => async () => [addr];
  const blocked = [
    "127.0.0.1", "127.255.255.254", "10.0.0.1", "10.255.255.255", "172.16.0.1", "172.31.255.255", "192.168.0.1", "169.254.169.254", "169.254.0.1", "100.64.0.1", "100.127.255.255",
    "0.0.0.0", "0.1.2.3", "::1", "::", "fe80::1", "fc00::1", "fd00:ec2::254", "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:169.254.169.254", "::ffff:a9fe:a9fe", "64:ff9b::7f00:1",
    "2002:7f00:1::", "2002:a9fe:a9fe::", "2001::1", "::127.0.0.1", "fec0::1", "ff02::1",
  ];
  it.each(blocked)("a name that resolves to %s is refused as private_address", async (addr) => {
    const f = createSafeFetcher({ resolver: privateResolver(addr) });
    expect(await refusal(f, "http://example.test/page")).toBe("private_address");
    expect(f.stats.fetched).toBe(0);
    expect(f.stats.refusedReasons.private_address).toBe(1);
  });

  it("ONE blocked address among several refuses the whole name (no 'pick the public one')", async () => {
    const f = createSafeFetcher({ resolver: async () => ["93.184.216.34", "10.0.0.1"] });
    expect(await refusal(f, "http://mixed.test/")).toBe("private_address");
  });

  it("an empty, non-array or malformed resolver answer is dns_failed, a rejecting resolver is dns_failed", async () => {
    expect(await refusal(createSafeFetcher({ resolver: async () => [] }), "http://a.test/")).toBe("dns_failed");
    expect(await refusal(createSafeFetcher({ resolver: (async () => "127.0.0.1") as never }), "http://a.test/")).toBe("dns_failed");
    expect(await refusal(createSafeFetcher({ resolver: (async () => [42]) as never }), "http://a.test/")).toBe("dns_failed");
    expect(await refusal(createSafeFetcher({ resolver: async () => ["not-an-ip"] }), "http://a.test/")).toBe("private_address");
    expect(await refusal(createSafeFetcher({ resolver: async () => { throw new Error("SERVFAIL"); } }), "http://a.test/")).toBe("dns_failed");
  });

  const literals = ["http://127.0.0.1/", "http://[::1]/", "http://2130706433/", "http://0x7f.1/", "http://017700000001/", "http://127.1/", "http://0/", "http://0.0.0.0/", "http://[::ffff:127.0.0.1]/", "http://169.254.169.254/latest/meta-data/", "http://[fd00:ec2::254]/", "http://8.8.8.8/", "http://[2001:4860:4860::8888]/"];
  it.each(literals)("the IP-literal URL %s is refused as ip_literal (even a public one: no raw addresses)", async (u) => {
    const f = createSafeFetcher({ resolver: async () => ["93.184.216.34"] });
    expect(await refusal(f, u)).toBe("ip_literal");
    expect(f.stats.resolverCalls).toBe(0);
  });

  const schemes = ["ftp://example.test/x", "file:///etc/passwd", "gopher://example.test/", "javascript:alert(1)", "data:text/html,<script>1</script>", "ws://example.test/", "blob:https://example.test/abc", "mailto:a@b.test", "view-source:http://example.test/"];
  it.each(schemes)("%s is refused (http and https only)", async (u) => {
    expect(["scheme", "bad_url"]).toContain(await refusal(createSafeFetcher({ resolver: async () => ["10.0.0.1"] }), u));
  });

  it("credentials in the URL are refused, including the host-confusion form", async () => {
    const f = createSafeFetcher({ resolver: async () => ["10.0.0.1"] });
    expect(await refusal(f, "http://user:pass@example.test/")).toBe("credentials");
    expect(await refusal(f, "http://example.test@evil.test/")).toBe("credentials");
    expect(await refusal(f, "https://token@example.test/")).toBe("credentials");
  });

  it("only the default port of the scheme is allowed", async () => {
    const f = createSafeFetcher({ resolver: async () => ["10.0.0.1"] });
    for (const u of ["http://example.test:8080/", "https://example.test:8443/", "http://example.test:22/", "https://example.test:80/", "http://example.test:6379/"]) expect(await refusal(f, u)).toBe("port");
    expect(f.stats.resolverCalls).toBe(0);
  });

  it("hostnames that mean 'this machine or this network' are refused without a lookup", async () => {
    const f = createSafeFetcher({ resolver: async () => ["93.184.216.34"] });
    for (const u of ["http://localhost/", "http://foo.localhost/", "http://printer.local/", "http://db.internal/", "http://example.test./", "http://under_score.test/", "http://-bad.test/", "http://a..b.test/"]) expect(await refusal(f, u)).toBe("bad_url");
    expect(f.stats.resolverCalls).toBe(0);
  });

  it("malformed URLs are refused: empty, spaces, backslashes, control characters, over 2,048 characters", async () => {
    const f = createSafeFetcher({ resolver: async () => ["10.0.0.1"] });
    for (const u of ["", "http://exa mple.test/", "http://example.test\\@evil.test/", "http://example.test/\u0000", "http://example.test/\u007f", "not a url", "http://", `http://example.test/${"a".repeat(2100)}`]) expect(await refusal(f, u)).toBe("bad_url");
    expect(await refusal(f, undefined as never)).toBe("bad_url");
  });

  it("internationalised hosts are looked up in their ASCII (punycode) form", async () => {
    const asked: string[] = [];
    const f = createSafeFetcher({ resolver: async (h) => { asked.push(h); return ["10.0.0.1"]; } });
    await refusal(f, "http://bücher.test/");
    expect(asked).toEqual(["xn--bcher-kva.test"]);
  });

  it("the production factory ignores a test-only relaxation", async () => {
    const f = createSafeFetcher({ resolver: fixtureResolver, testOnly: { treatAsPublic: ["127.0.0.1"], allowPorts: [port] } } as never);
    expect(await refusal(f, url("/ok"))).toBe("port");
    expect(await refusal(f, "http://fixture.test/ok")).toBe("private_address");
  });
});

describe("fetching a public page (loopback fixture, test-only relaxations)", () => {
  it("returns the page, its final URL and counts, and connects ONLY to the validated address (the name does not exist in DNS)", async () => {
    const f = testFetcher();
    const p = await f.fetch(url("/ok"));
    expect(p).toMatchObject({ status: 200, contentType: "text/html", truncated: false, redirects: 0 });
    expect(p.body).toContain("Hello fixture page");
    expect(p.url).toBe(url("/ok"));
    expect(f.stats).toMatchObject({ fetched: 1, refused: 0, resolverCalls: 1 });
  });

  it("sends no cookies, no authorization, no compression, and says what it is", async () => {
    seen.length = 0;
    const f = testFetcher();
    await f.fetch(url("/ok"));
    await f.fetch(url("/ok")); // the first answer set a cookie: it must not come back
    for (const s of seen) {
      expect(s.headers.cookie).toBeUndefined();
      expect(s.headers.authorization).toBeUndefined();
      expect(s.headers["proxy-authorization"]).toBeUndefined();
      expect(s.headers["accept-encoding"]).toBe("identity");
      expect(String(s.headers["user-agent"])).toMatch(/^VOLTA-AI-Assistant/);
      expect(s.headers.host).toBe(`fixture.test:${port}`);
    }
  });

  it("accepts text/plain, refuses PDF, binary and a missing content type", async () => {
    const f = testFetcher();
    expect((await f.fetch(url("/text"))).contentType).toBe("text/plain");
    expect(await refusal(f, url("/pdf"))).toBe("pdf_not_supported");
    expect(await refusal(f, url("/bin"))).toBe("content_type");
    expect(await refusal(f, url("/missing-type"))).toBe("content_type");
  });

  it("an error status is http_error, never content", async () => {
    const f = testFetcher();
    expect(await refusal(f, url("/err500"))).toBe("http_error");
    expect(await refusal(f, url("/nothere"))).toBe("http_error");
  });

  it("stops reading at the size cap and says the page is truncated", async () => {
    const f = testFetcher({ maxBytes: 50_000 });
    const p = await f.fetch(url("/big"));
    expect(p.truncated).toBe(true);
    expect(p.bytes).toBeLessThanOrEqual(50_000);
    expect(p.body.length).toBeLessThanOrEqual(50_000);
  });

  it("the size cap itself is clamped to 2 MB however it is configured", async () => {
    const f = testFetcher({ maxBytes: 50_000_000 });
    const p = await f.fetch(url("/big"));
    expect(p.bytes).toBeLessThanOrEqual(2_000_000);
  });

  it("decodes the declared charset and survives an unknown one", async () => {
    const f = testFetcher();
    expect((await f.fetch(url("/latin1"))).body).toContain("café");
    expect((await f.fetch(url("/badcharset"))).body).toContain("ok");
  });
});

describe("redirects: every hop is validated like the first request", () => {
  it("follows a redirect and reports how many", async () => {
    const p = await testFetcher().fetch(url("/r1"));
    expect(p.redirects).toBe(1);
    expect(p.url).toBe(url("/ok"));
  });

  it("allows at most 3 redirects", async () => {
    const f = testFetcher();
    expect(await refusal(f, url("/r-chain-1"))).toBe("too_many_redirects"); // 4 hops
    expect(await refusal(f, url("/loop"))).toBe("too_many_redirects");
  });

  it("the redirect limit cannot be raised by configuration", async () => {
    expect(await refusal(testFetcher({ maxRedirects: 50 }), url("/loop"))).toBe("too_many_redirects");
  });

  it("a redirect to a private IP literal, the metadata address, a file URL, credentials, a bad port is refused", async () => {
    const f = testFetcher();
    expect(await refusal(f, url("/r-private"))).toBe("ip_literal");
    expect(await refusal(f, url("/r-metadata"))).toBe("ip_literal");
    expect(await refusal(f, url("/r-file"))).toBe("scheme");
    expect(await refusal(f, url("/r-userinfo"))).toBe("credentials");
    expect(await refusal(f, url("/r-badport"))).toBe("port");
  });

  it("a redirect without a Location is an http_error", async () => {
    expect(await refusal(testFetcher(), url("/r-nolocation"))).toBe("http_error");
  });

  it("DNS REBINDING: a name that resolved to a public address and then to a private one is refused on the second hop", async () => {
    let calls = 0;
    const f = testFetcher({
      resolver: async (host) => {
        if (host === "fixture.test") return ["127.0.0.1"];
        if (host === "rebind.test") return ++calls === 1 ? ["127.0.0.1"] : ["10.0.0.9"];
        return [];
      },
    });
    // hop 1 (fixture.test) is fine and redirects to rebind.test, which resolves publicly ONCE; fetching the same name again must re-resolve and be refused
    const first = await f.fetch(url("/rebind-start"));
    expect(first.url).toBe(url("/ok", "rebind.test"));
    expect(await refusal(f, url("/ok", "rebind.test"))).toBe("private_address");
    expect(calls).toBe(2);
  });

  it("the resolver is called once per hop and the socket never resolves the name itself", async () => {
    let calls = 0;
    const f = testFetcher({ resolver: async (h) => { calls++; return fixtureResolver(h); } });
    await f.fetch(url("/r-chain-4")); // 1 redirect to /ok
    expect(calls).toBe(2);
  });
});

describe("deadlines, cancellation and policy hooks", () => {
  it("a server that never answers is cut off at the timeout", async () => {
    const t0 = Date.now();
    expect(await refusal(testFetcher({ timeoutMs: 600 }), url("/slow"))).toBe("timeout");
    expect(Date.now() - t0).toBeLessThan(2_500);
  });

  it("a body that trickles forever is cut off at the TOTAL timeout (slow-loris)", async () => {
    const t0 = Date.now();
    expect(await refusal(testFetcher({ timeoutMs: 700 }), url("/trickle"))).toBe("timeout");
    expect(Date.now() - t0).toBeLessThan(2_500);
  });

  it("a DNS lookup that never answers is bounded by the same deadline", async () => {
    const t0 = Date.now();
    const f = testFetcher({ timeoutMs: 600, resolver: () => new Promise(() => undefined) });
    expect(await refusal(f, url("/ok"))).toBe("timeout");
    expect(Date.now() - t0).toBeLessThan(2_500);
  });

  it("the caller's cancellation is 'aborted', before and during the request", async () => {
    const f = testFetcher();
    const pre = new AbortController();
    pre.abort();
    await expect(f.fetch(url("/ok"), { signal: pre.signal })).rejects.toMatchObject({ reason: "aborted" });
    const ctl = new AbortController();
    const p = f.fetch(url("/slow"), { signal: ctl.signal });
    setTimeout(() => ctl.abort(), 50);
    await expect(p).rejects.toMatchObject({ reason: "aborted" });
  });

  it("a robots hook can veto a URL", async () => {
    const f = testFetcher({ robots: { allowed: async (u) => !u.pathname.startsWith("/ok") } });
    expect(await refusal(f, url("/ok"))).toBe("robots");
    expect((await f.fetch(url("/text"))).status).toBe(200);
  });

  it("refusals are counted by reason and never contain the URL", async () => {
    const f = testFetcher();
    await refusal(f, "http://127.0.0.1/secret-path");
    await refusal(f, url("/pdf"));
    expect(f.stats.refused).toBe(2);
    expect(JSON.stringify(f.stats)).not.toMatch(/secret-path|fixture/);
  });

  it("the fixture server saw no request for any refused destination", async () => {
    seen.length = 0;
    const f = testFetcher();
    await refusal(f, url("/r-private"));
    expect(seen.map((s) => s.path)).toEqual(["/r-private"]); // only the first hop reached the fixture; the private target was never contacted
  });
});
