import { describe, expect, it } from "vitest";
import { createLiveSiteData } from "../../src/backend/live-site-data";
import { SiteErpTransport } from "../../src/backend/site-transport";
import { verifyRequest, ReplayCache } from "../../src/auth/hmac";
import { createMockStack } from "../../src/mock/stack";
import { run } from "../fixtures/pipeline-helpers";
import { RichTransport, richSite } from "../fixtures/rich-catalogue";

const SECRET = "s".repeat(40);
const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200 });
const transport = (fetchImpl: typeof fetch) => new SiteErpTransport({ siteUrl: "https://valta.hexalyte.com", keyId: "agent1", secret: SECRET, fetchImpl });

describe("published specification rows from the website", () => {
  it("are requested with a signed GET to the content route only, and shaped strictly", async () => {
    let seen: { url: string; headers: Record<string, string> } | undefined;
    const t = transport(async (url, init) => {
      seen = { url: String(url), headers: init!.headers as Record<string, string> };
      return ok({ items: [{ id: "p1", specs: [{ name: "Camera", value: "108 MP" }] }, { id: "p2", specs: [] }] });
    });
    expect(await t.getContent()).toEqual({ p1: { specs: [{ name: "Camera", value: "108 MP" }] } });
    expect(seen!.url).toBe("https://valta.hexalyte.com/api/internal/ai/erp/content");
    const verdict = verifyRequest({ header: (n) => seen!.headers[n], method: "GET", path: "/api/internal/ai/erp/content", body: new Uint8Array(), keys: new Map([["agent1", SECRET]]), nowMs: Date.now(), replay: new ReplayCache() });
    expect(verdict.ok).toBe(true);
  });

  it("refuse a malformed or oversized answer instead of using part of it", async () => {
    await expect(transport(async () => ok({ items: [{ id: "../x", specs: [] }] })).getContent()).rejects.toMatchObject({ kind: "BAD_RESPONSE" });
    await expect(transport(async () => ok({ items: [{ id: "p1", specs: [{ name: "x".repeat(61), value: "1" }] }] })).getContent()).rejects.toMatchObject({ kind: "BAD_RESPONSE" });
    await expect(transport(async () => ok({ items: Array.from({ length: 5001 }, (_, i) => ({ id: `p${i}`, specs: [] })) })).getContent()).rejects.toMatchObject({ kind: "BAD_RESPONSE" });
    await expect(transport(async () => new Response("{}", { status: 404 })).getContent()).rejects.toMatchObject({ kind: "UNAUTHORIZED" });
  });
});

describe("live site data", () => {
  it("serves the last good rows, keeps them when a refresh fails, and never lets customer or promotion data in", async () => {
    let calls = 0;
    let fail = false;
    const live = createLiveSiteData(async () => {
      calls++;
      if (fail) throw new Error("website down");
      return { a: { specs: [{ name: "RAM", value: `${calls} GB` }] } };
    });
    expect(live.content).toEqual({}); // cold: nothing yet, and nothing blocks
    expect(await live.refresh()).toBe(true);
    expect(live.content).toEqual({ a: { specs: [{ name: "RAM", value: "1 GB" }] } });
    fail = true;
    expect(await live.refresh()).toBe(false);
    expect(live.content).toEqual({ a: { specs: [{ name: "RAM", value: "1 GB" }] } }); // last good copy kept
    expect(live.stats).toMatchObject({ refreshes: 1, failures: 1, products: 1 });
    expect(live.links).toEqual([]);
    expect(live.promotions).toEqual([]);
    expect(live.customerOrders.size).toBe(0);
  });

  it("shares one request between simultaneous refreshes", async () => {
    let calls = 0;
    const live = createLiveSiteData(async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 20));
      return {};
    });
    await Promise.all([live.refresh(), live.refresh(), live.refresh()]);
    expect(calls).toBe(1);
  });

  it("staff-entered specs reach the ranking: before the first refresh the assistant says it has no camera data, after it ranks by the listed number", async () => {
    // The ERP side has the products; the specs live only on the website, exactly as in production.
    const live = createLiveSiteData(async () => richSite().content);
    const s = createMockStack({ transport: new RichTransport(), site: live, catalogueTtlMs: 0 });
    const cold = (await run(s.pipeline, "phone with good camera under 100000")).result;
    const coldTop = cold.cards.find((c) => c.type === "product") as { fit?: { tradeoffs: string[] } } | undefined;
    expect(coldTop?.fit?.tradeoffs).toContain("no_camera_data");
    await live.refresh();
    const s2 = createMockStack({ transport: new RichTransport(), site: live, catalogueTtlMs: 0 });
    const warm = (await run(s2.pipeline, "phone with good camera under 100000")).result;
    const top = warm.cards.find((c) => c.type === "product") as { name: string; fit?: { reasons: string[] } };
    expect(top.name).toBe("Lumen P2 Pro Smartphone");
    expect(top.fit?.reasons).toContain("best_camera");
  });
});
