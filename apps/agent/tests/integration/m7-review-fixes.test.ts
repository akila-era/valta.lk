import { afterEach, describe, expect, it } from "vitest";
import { signRequest } from "../../src/auth/hmac";
import { buildCards } from "../../src/backend/cards";
import { plainText } from "../../src/backend/catalogue";
import { SiteErpTransport } from "../../src/backend/site-transport";
import type { ErpTransport } from "../../src/backend/transport";
import { RawProduct, type RawOrder, type RawSettings } from "../../src/backend/wire";
import type { ToolResult } from "../../src/backend/types";
import { loadConfig } from "../../src/config";
import { createAgentServer, type RunningServer } from "../../src/http/server";
import { createMockStack } from "../../src/mock/stack";
import { AbuseGuard, DEFAULT_RATE_CONFIG } from "../../src/security/rate-limit";
import { renderTemplate } from "../../src/router/templates";
import { verifyResponse } from "../../src/verify/verifier";
import { emptySite } from "../bench/m6-real/snapshot";
import { RichTransport, richSite } from "../fixtures/rich-catalogue";
import { run } from "../fixtures/pipeline-helpers";

/** Regression tests for the findings of the independent review (docs/VOLTA_AI_SECURITY_FINAL_REVIEW.md) that were fixed locally. */
const SECRET = "t".repeat(40);
let app: RunningServer | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe("F-A: the hourly allowance of NEW conversations is per caller, not one counter for the whole shop", () => {
  it("one guest address using up its allowance does not block a different guest, but is itself limited", () => {
    const g = new AbuseGuard({ ...DEFAULT_RATE_CONFIG, newSessionsPerHour: 2 });
    g.checkNewSession({ identityKey: "anon", clientIp: "203.0.113.1" });
    g.checkNewSession({ identityKey: "anon", clientIp: "203.0.113.1" });
    expect(() => g.checkNewSession({ identityKey: "anon", clientIp: "203.0.113.1" })).toThrow();
    expect(() => g.checkNewSession({ identityKey: "anon", clientIp: "203.0.113.2" })).not.toThrow();
    expect(() => g.checkNewSession({ identityKey: "cust:7", clientIp: "203.0.113.1" })).not.toThrow(); // a customer has their own allowance
  });

  it("over HTTP: a second address can still start a conversation after the first has used its allowance", async () => {
    const s = createMockStack({ transport: new RichTransport(), site: richSite(), catalogueTtlMs: 0 });
    const config = loadConfig({ AGENT_HMAC_KEYS: `k1:${SECRET}`, AGENT_PORT: "0", AI_ASSISTANT_ENABLED: "true", AGENT_NEW_SESSIONS_PER_HOUR: "2", AGENT_RATE_IP_PER_MIN: "300", AGENT_RATE_SESSION_PER_MIN: "300" });
    app = createAgentServer({ config, pipeline: s.pipeline, memory: async () => ({ availableMb: null, swapUsedMb: null }) });
    const url = `http://127.0.0.1:${(await app.listen()).port}`;
    const send = async (ip: string, sid: string) => {
      const raw = JSON.stringify({ sessionId: sid, message: "hi" });
      return (await fetch(`${url}/v1/chat`, { method: "POST", headers: { "content-type": "application/json", ...signRequest({ keyId: "k1", secret: SECRET, method: "POST", path: "/v1/chat", identity: { kind: "guest" }, clientIp: ip, body: raw }) }, body: raw })).status;
    };
    expect(await send("203.0.113.1", "sess_1111111111111111")).toBe(200);
    expect(await send("203.0.113.1", "sess_2222222222222222")).toBe(200);
    expect(await send("203.0.113.1", "sess_3333333333333333")).toBe(429);
    expect(await send("203.0.113.2", "sess_4444444444444444")).toBe(200);
  });
});

describe("F-04: catalogue data that is merely long or odd never turns an answer into an error", () => {
  const raw = (o: Record<string, unknown>) => RawProduct.parse({ price: "1000.00", hasVariants: false, variants: [], images: [], availability: "IN_STOCK", purchasableQuantity: 5, updatedAt: "2026-11-01T00:00:00.000Z", ...o });
  class T implements ErpTransport {
    readonly origin = "https://shop.invalid";
    constructor(private readonly list: RawProduct[]) {}
    async listProducts() {
      return this.list;
    }
    async getProduct(id: string) {
      return this.list.find((p) => p.id === id) ?? null;
    }
    async getSettings(): Promise<RawSettings> {
      return { currency: "LKR", ordersEnabled: true, deliveryCharge: "0.00" };
    }
    async getOrder(): Promise<RawOrder | null> {
      return null;
    }
  }
  const failures: string[] = [];
  const stack = (list: RawProduct[]) => createMockStack({ transport: new T(list), site: emptySite(), catalogueTtlMs: 0, onVerifierFailure: (f) => void failures.push(f.code) });

  it("a 300-character name and a 120-character brand are cut to the contract's limits and still verified", async () => {
    const s = stack([raw({ id: "p1", name: "Very long gadget name ".repeat(15), brand: "Brand with a very long title ".repeat(5), category: "Gadgets", offerName: "x" }), raw({ id: "p2", name: "Normal gadget", brand: "Fine", category: "Gadgets" })]);
    const { result } = await run(s.pipeline, "show me products under 5000");
    expect(failures).toEqual([]);
    expect(result.reply.text).not.toBe(renderTemplate("verification_failed", "en").text);
    const long = result.cards.find((c) => c.type === "product" && c.id === "p1") as { name: string; brand?: string } | undefined;
    expect(long?.name.length).toBe(200);
    expect(long?.brand?.length).toBe(80);
  });

  it("a product whose id cannot make a valid link is left out instead of failing the whole answer", async () => {
    const s = stack([raw({ id: "bad id", name: "Odd gadget", brand: "X", category: "Gadgets" }), raw({ id: "p2", name: "Good gadget", brand: "Fine", category: "Gadgets" })]);
    const { result } = await run(s.pipeline, "show me products under 5000");
    expect(result.reply.text).not.toBe(renderTemplate("verification_failed", "en").text);
    expect(result.cards.filter((c) => c.type === "product").map((c) => (c as { name: string }).name)).toEqual(["Good gadget"]);
  });
});

describe("F-05: a hostile description cannot stall the Agent", () => {
  it("a description of 200,000 '<' characters is processed in a few milliseconds", () => {
    const t0 = performance.now();
    plainText("<".repeat(200_000));
    plainText(`<a ${"<".repeat(100_000)}`);
    expect(performance.now() - t0).toBeLessThan(200);
  });
});

describe("F-08: an oversized or endless answer from the website is refused", () => {
  const transport = (fetchImpl: typeof fetch) => new SiteErpTransport({ siteUrl: "https://valta.hexalyte.com", keyId: "agent1", secret: SECRET, fetchImpl });
  it("refuses a declared size above the cap and a streamed body that grows past it", async () => {
    await expect(transport(async () => new Response("{}", { status: 200, headers: { "content-length": "99999999" } })).getSettings()).rejects.toMatchObject({ kind: "BAD_RESPONSE" });
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(1_000_000).fill(32));
      },
    });
    await expect(transport(async () => new Response(endless, { status: 200 })).getSettings()).rejects.toMatchObject({ kind: "BAD_RESPONSE" });
  });
});

describe("F-02: fit is never accepted on a nested product card", () => {
  it("a comparison or accessory card that carries fit is refused", async () => {
    const views = (await createMockStack({ transport: new RichTransport(), site: richSite(), catalogueTtlMs: 0 }).catalogue.listing("guest")).filter((v) => v.available).slice(0, 2);
    const data: ToolResult = { kind: "compare", products: views };
    const cards = buildCards([{ tool: "compare_products", status: "ok", data }]).cards;
    const base = { actor: "guest" as const, outcomes: [{ tool: "compare_products", status: "ok" as const, data }], actions: [], reply: { text: renderTemplate("tools_ran", "en").text, source: "template" }, templateKey: "tools_ran" as const, tplLang: "en" as const, language: "en" as const, needsNativeReview: false };
    expect(verifyResponse({ ...base, cards })).toEqual({ ok: true });
    const forged = cards.map((c) => (c.type === "comparison" ? { ...c, products: c.products.map((p, i) => (i === 0 ? { ...p, fit: { reasons: ["lowest_price" as const], tradeoffs: [] } } : p)) } : c));
    expect(verifyResponse({ ...base, cards: forged })).toMatchObject({ ok: false });
  });
});
