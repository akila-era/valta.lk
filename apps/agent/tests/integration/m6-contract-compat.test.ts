import { afterEach, describe, expect, it } from "vitest";
import { signRequest } from "../../src/auth/hmac";
import { loadConfig } from "../../src/config";
import { Card, ChatResponse, FIT_REASONS, FIT_TRADEOFFS } from "../../src/contract/schemas";
import { createAgentServer, type RunningServer } from "../../src/http/server";
import type { ChatPipeline } from "../../src/http/pipeline";
import { createMockStack } from "../../src/mock/stack";
import { rankProducts } from "../../src/reasoning/ranking";
import { buildCards } from "../../src/backend/cards";
import type { ToolResult } from "../../src/backend/types";
import { verifyResponse } from "../../src/verify/verifier";
import { RichTransport, richSite } from "../fixtures/rich-catalogue";

const SECRET = "t".repeat(40);
const SID = "sess_0123456789abcdef";
const rich = () => createMockStack({ transport: new RichTransport(), site: richSite(), catalogueTtlMs: 0 });

let app: RunningServer | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function start(pipeline: ChatPipeline) {
  const config = loadConfig({ AGENT_HMAC_KEYS: `k1:${SECRET}`, AGENT_PORT: "0", AI_ASSISTANT_ENABLED: "true" });
  app = createAgentServer({ config, pipeline, memory: async () => ({ availableMb: null, swapUsedMb: null }) });
  return `http://127.0.0.1:${(await app.listen()).port}`;
}
const post = (url: string, body: unknown, path = "/v1/chat") => {
  const raw = JSON.stringify(body);
  return fetch(`${url}${path}`, { method: "POST", headers: { "content-type": "application/json", ...signRequest({ keyId: "k1", secret: SECRET, method: "POST", path, identity: { kind: "guest" }, clientIp: "203.0.113.7", body: raw }) }, body: raw });
};

type Json = { cards: { type: string; fit?: unknown; products?: unknown[] }[]; meta: { contractVersion: string }; error?: { code: string } };
const ask = async (url: string, message: string, version?: string, sid = SID) => {
  const res = await post(url, { sessionId: sid, message, ...(version ? { contractVersion: version } : {}) });
  return { status: res.status, json: (await res.json()) as Json };
};

describe("one conversation, three client versions, over HTTP", () => {
  const MSG = "phone with a good camera under 150000";

  it("1.2 clients receive fit codes on product cards; the response validates", async () => {
    const url = await start(rich().pipeline);
    const { status, json } = await ask(url, MSG, "1.2");
    expect(status).toBe(200);
    expect(json.meta.contractVersion).toBe("1.2");
    expect(ChatResponse.safeParse(json).success).toBe(true);
    const products = json.cards.filter((c) => c.type === "product");
    expect(products.length).toBeGreaterThan(0);
    expect(products.every((c) => c.fit !== undefined)).toBe(true);
  });

  it("1.1 clients and 1.0 clients (no version named) never receive fit, and their responses validate", async () => {
    const url = await start(rich().pipeline);
    for (const [version, sid] of [["1.1", "sess_aaaaaaaaaaaaaaaa"], [undefined, "sess_bbbbbbbbbbbbbbbb"], ["1", "sess_cccccccccccccccc"]] as const) {
      const { status, json } = await ask(url, MSG, version, sid);
      expect(status, String(version)).toBe(200);
      expect(json.meta.contractVersion).toBe(version ?? "1");
      expect(JSON.stringify(json), String(version)).not.toContain('"fit"');
      expect(ChatResponse.safeParse(json).success, String(version)).toBe(true);
      expect(json.cards.filter((c) => c.type === "product").length, String(version)).toBeGreaterThan(0);
    }
  });

  it("the same applies to streamed cards", async () => {
    const url = await start(rich().pipeline);
    const cardsOf = (t: string) => t.split("\n\n").filter((b) => b.startsWith("event: card")).map((b) => JSON.parse(b.split("data: ")[1]!) as { type: string; fit?: unknown });
    const modern = cardsOf(await (await post(url, { sessionId: "sess_dddddddddddddddd", message: MSG, contractVersion: "1.2" }, "/v1/chat/stream")).text());
    expect(modern.some((c) => c.type === "product" && c.fit !== undefined)).toBe(true);
    const legacy = cardsOf(await (await post(url, { sessionId: "sess_eeeeeeeeeeeeeeee", message: MSG, contractVersion: "1.1" }, "/v1/chat/stream")).text());
    expect(legacy.length).toBeGreaterThan(0);
    expect(legacy.every((c) => c.fit === undefined)).toBe(true);
  });

  it("comparisons keep their 1.0 rule (3 products) and 1.1 rule (4) next to the new field; fit rides on comparison products only for 1.2", async () => {
    const url = await start(rich().pipeline);
    const four = "Compare Lumen P1, Orbit A5, Kite K1 and Samsung Test A1";
    const legacy = await ask(url, four, undefined, "sess_ffffffffffffffff");
    expect((legacy.json.cards[0] as { products: unknown[] }).products).toHaveLength(3);
    const v11 = await ask(url, four, "1.1", "sess_gggggggggggggggg");
    expect((v11.json.cards[0] as { products: unknown[] }).products).toHaveLength(4);
    for (const r of [legacy, v11]) expect(JSON.stringify(r.json)).not.toContain('"fit"');
  });

  it("refuses a version it does not know, with a validation error and no cards", async () => {
    const url = await start(rich().pipeline);
    for (const v of ["1.3", "2", "0.9", ""]) {
      const res = await post(url, { sessionId: "sess_hhhhhhhhhhhhhhhh", message: "hi", contractVersion: v });
      const json = (await res.json()) as Json;
      expect(res.status, v).toBe(422);
      expect(json.error?.code, v).toBe("VALIDATION_FAILED");
      expect(json.cards, v).toBeUndefined();
    }
  });
});

describe("unknown or malformed fit codes fail safely", () => {
  const baseCard = { type: "product", id: "p1", slug: "p1", name: "Test phone", price: { amount: 1000, text: "Rs. 1,000.00" }, available: true, url: "/products/p1" };

  it("the contract refuses an unknown code, too many codes and extra fields", () => {
    expect(Card.safeParse({ ...baseCard, fit: { reasons: ["within_budget"], tradeoffs: ["over_budget"] } }).success).toBe(true);
    expect(Card.safeParse({ ...baseCard, fit: { reasons: ["the_best_phone_ever"], tradeoffs: [] } }).success).toBe(false);
    expect(Card.safeParse({ ...baseCard, fit: { reasons: ["within_budget", "brand_match", "best_camera", "lowest_price"], tradeoffs: [] } }).success).toBe(false);
    expect(Card.safeParse({ ...baseCard, fit: { reasons: [], tradeoffs: ["over_budget", "out_of_stock", "no_camera_data"] } }).success).toBe(false);
    expect(Card.safeParse({ ...baseCard, fit: { reasons: [], tradeoffs: [], text: "buy it now" } }).success).toBe(false);
  });

  it("a pipeline that returns an unknown code never reaches the shopper: the server answers an internal error with no detail", async () => {
    const bad: ChatPipeline = {
      async run() {
        return {
          language: "en",
          reply: { text: "Here is what I found.", source: "template" },
          needsNativeReview: false,
          cards: [{ ...baseCard, fit: { reasons: ["invented_reason"], tradeoffs: [] } } as unknown as Card],
          actions: [],
          suggestions: [],
          meta: { model: null, degraded: false, queuedMs: 0 },
        };
      },
    };
    const url = await start(bad);
    const res = await post(url, { sessionId: "sess_iiiiiiiiiiiiiiii", message: "hello", contractVersion: "1.2" });
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain("invented_reason");
    expect(JSON.parse(text).error.code).toBe("INTERNAL");
  });
});

describe("the verifier recomputes every factual claim", () => {
  /** A real search over the fixture, with the fit the engine would attach and the profile it used. */
  async function setup() {
    const s = rich();
    const views = (await s.catalogue.listing("guest")).filter((v) => v.available && v.category?.slug === "mobile-phones" && (v.saleCents ?? v.priceCents) <= 15000000);
    const profile = { usage: ["camera" as const], budgetMaxLkr: 150000 };
    const { ranked } = rankProducts(views, profile);
    const top = ranked.slice(0, 3);
    const data: ToolResult = { kind: "search", total: views.length, items: views };
    const cards = buildCards([{ tool: "search_products", status: "ok", data: { ...data, items: top.map((r) => r.product) } }]).cards.map((c) => (c.type === "product" ? { ...c, fit: top.find((r) => r.product.id === c.id)!.fit } : c));
    const input = {
      actor: "guest" as const,
      outcomes: [{ tool: "search_products", status: "ok" as const, data }],
      cards,
      actions: [],
      reply: { text: "Based on what you've told me, these look like the best fits.", source: "template" },
      templateKey: "recommend_intro" as const,
      tplLang: "en" as const,
      language: "en" as const,
      needsNativeReview: false,
      fitContext: { profile, candidateIds: views.map((v) => v.id) },
    };
    return { input, cards, top };
  }

  it("accepts the engine's own claims", async () => {
    const { input } = await setup();
    expect(verifyResponse(input)).toEqual({ ok: true });
  });

  it("refuses every single reason and trade-off code that is added to a card where it does not hold", async () => {
    const { input, cards } = await setup();
    const first = cards.findIndex((c) => c.type === "product");
    for (const code of FIT_REASONS) {
      const own = (cards[first] as { fit: { reasons: string[]; tradeoffs: string[] } }).fit;
      if (own.reasons.includes(code)) continue;
      const forged = cards.map((c, i) => (i === first && c.type === "product" ? { ...c, fit: { reasons: [code, ...own.reasons.slice(0, 2)], tradeoffs: own.tradeoffs } } : c));
      expect(verifyResponse({ ...input, cards: forged as typeof input.cards }), `reason ${code}`).toMatchObject({ ok: false });
    }
    for (const code of FIT_TRADEOFFS) {
      const own = (cards[first] as { fit: { reasons: string[]; tradeoffs: string[] } }).fit;
      if (own.tradeoffs.includes(code)) continue;
      const forged = cards.map((c, i) => (i === first && c.type === "product" ? { ...c, fit: { reasons: own.reasons, tradeoffs: [code, ...own.tradeoffs.slice(0, 1)] } } : c));
      expect(verifyResponse({ ...input, cards: forged as typeof input.cards }), `trade-off ${code}`).toMatchObject({ ok: false });
    }
  });

  it("refuses a changed price, a changed name and a fit with no context", async () => {
    const { input, cards } = await setup();
    const first = cards.findIndex((c) => c.type === "product");
    const priced = cards.map((c, i) => (i === first && c.type === "product" ? { ...c, price: { amount: 1, text: "Rs. 1.00" } } : c));
    expect(verifyResponse({ ...input, cards: priced as typeof input.cards })).toMatchObject({ ok: false });
    const renamed = cards.map((c, i) => (i === first && c.type === "product" ? { ...c, name: "Best Phone Ever" } : c));
    expect(verifyResponse({ ...input, cards: renamed as typeof input.cards })).toMatchObject({ ok: false });
    expect(verifyResponse({ ...input, fitContext: undefined })).toMatchObject({ ok: false });
  });
});
