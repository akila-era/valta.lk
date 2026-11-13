import { describe, expect, it } from "vitest";
import { SiteErpTransport } from "../../src/backend/site-transport";
import { ErpUnavailableError } from "../../src/backend/transport";
import { ReplayCache, verifyRequest } from "../../src/auth/hmac";

const SECRET = "s".repeat(40);
const product = { id: "p1", name: "Real Phone", price: "99000.00", updatedAt: "2026-11-13T00:00:00Z" };

function transport(fetchImpl: typeof fetch, site = "https://valta.hexalyte.com") {
  return new SiteErpTransport({ siteUrl: site, keyId: "agent1", secret: SECRET, fetchImpl });
}
const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200 });

describe("SiteErpTransport (read-only catalogue through the website)", () => {
  it("accepts only an https site origin (http only for loopback) and a strong key", () => {
    expect(() => transport(fetch, "http://valta.hexalyte.com")).toThrow(/https/);
    expect(() => transport(fetch, "https://valta.hexalyte.com/path")).toThrow(/origin/);
    expect(() => transport(fetch, "https://user:pw@valta.hexalyte.com")).toThrow(/origin/);
    expect(() => new SiteErpTransport({ siteUrl: "https://valta.hexalyte.com", keyId: "a", secret: "short" })).toThrow(/32/);
    expect(() => transport(fetch, "http://127.0.0.1:3000")).not.toThrow();
  });

  it("signs every GET with the anonymous identity, covering the path and query, and sends no credential", async () => {
    const seen: { url: string; headers: Record<string, string>; method?: string; redirect?: string }[] = [];
    const t = transport(async (url, init) => {
      seen.push({ url: String(url), headers: init!.headers as Record<string, string>, method: init!.method, redirect: init!.redirect });
      return ok({ items: [product], nextCursor: null });
    });
    expect((await t.listProducts()).map((p) => p.id)).toEqual(["p1"]);
    const s = seen[0]!;
    expect(s.url).toBe("https://valta.hexalyte.com/api/internal/ai/erp/catalogue/products?limit=100");
    expect(s.method).toBe("GET");
    expect(s.redirect).toBe("error");
    expect(s.headers["x-volta-identity"]).toBe("anon");
    expect(Object.keys(s.headers).some((k) => /authorization|cookie/i.test(k))).toBe(false);
    const verdict = verifyRequest({
      header: (n) => s.headers[n],
      method: "GET",
      path: "/api/internal/ai/erp/catalogue/products?limit=100",
      body: new Uint8Array(),
      keys: new Map([["agent1", SECRET]]),
      nowMs: Date.now(),
      replay: new ReplayCache(),
    });
    expect(verdict.ok).toBe(true);
    // The same headers do not verify for a different query.
    expect(verifyRequest({ header: (n) => s.headers[n], method: "GET", path: "/api/internal/ai/erp/catalogue/products?limit=99", body: new Uint8Array(), keys: new Map([["agent1", SECRET]]), nowMs: Date.now(), replay: new ReplayCache() }).ok).toBe(false);
  });

  it("follows the cursor across pages", async () => {
    let n = 0;
    const t = transport(async (url) => {
      n++;
      return String(url).includes("cursor=c2") ? ok({ items: [{ ...product, id: "p2" }] }) : ok({ items: [product], nextCursor: "c2" });
    });
    expect((await t.listProducts()).map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(n).toBe(2);
  });

  it("never asks for orders", async () => {
    let called = 0;
    const t = transport(async () => {
      called++;
      return ok({});
    });
    expect(await t.getOrder("ABC123")).toBeNull();
    expect(called).toBe(0);
  });

  it("tells 'no such product' apart from 'rejected' (an off relay or a bad signature must never look like an empty catalogue)", async () => {
    const missing = transport(async () => new Response(JSON.stringify({ error: { code: "PRODUCT_NOT_FOUND" } }), { status: 404 }));
    expect(await missing.getProduct("zz")).toBeNull();
    const rejected = transport(async () => new Response(JSON.stringify({ error: { code: "NOT_FOUND" } }), { status: 404 }));
    await expect(rejected.getProduct("zz")).rejects.toMatchObject({ kind: "UNAUTHORIZED" });
    await expect(rejected.getSettings()).rejects.toBeInstanceOf(ErpUnavailableError);
  });

  it("refuses odd product ids without any request, and maps errors, timeouts and malformed bodies", async () => {
    let called = 0;
    const t = transport(async () => {
      called++;
      return new Response("<html>", { status: 200 });
    });
    expect(await t.getProduct("../orders")).toBeNull();
    expect(called).toBe(0);
    await expect(t.getSettings()).rejects.toMatchObject({ kind: "BAD_RESPONSE" });
    await expect(transport(async () => new Response("{}", { status: 503 })).getSettings()).rejects.toMatchObject({ kind: "BAD_RESPONSE" });
    await expect(transport(async () => Promise.reject(new Error("boom"))).getSettings()).rejects.toMatchObject({ kind: "UNREACHABLE" });
    await expect(transport(async () => ok({ currency: "LKR" })).getSettings()).rejects.toMatchObject({ kind: "BAD_RESPONSE" });
  });
});
