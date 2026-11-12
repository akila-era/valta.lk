import { afterEach, describe, expect, it } from "vitest";
import { buildCards } from "../../src/backend/cards";
import { loadConfig } from "../../src/config";
import { ChatResponse, type Card } from "../../src/contract/schemas";
import { createAgentServer, type RunningServer } from "../../src/http/server";
import { itemId, FixtureErpTransport } from "../../src/mock/erp-fixture";
import { createMockStack } from "../../src/mock/stack";
import { RoutingPipeline } from "../../src/pipeline/routing-pipeline";
import { createLogger, verifierFailureLogger } from "../../src/observability/logger";
import { renderTemplate } from "../../src/router/templates";
import type { VerifyFailure } from "../../src/verify/verifier";
import { UNSAFE } from "../eval/safety-pack";
import { SET_A, SET_B, SET_C } from "../eval/sinhala-sets";
import { chat, post, sid, SECRET } from "../fixtures/http-helpers";
import { run } from "../fixtures/pipeline-helpers";

const WATCH = itemId(8);

/** A pipeline whose card builder is tampered with, as a bug or a compromised component would: the verifier must catch it. */
function tampered(tamper: (cards: Card[]) => Card[], failures: { requestId: string; code: VerifyFailure }[] = []) {
  const base = createMockStack();
  const pipeline = new RoutingPipeline({
    registry: base.registry,
    vocab: () => base.catalogue.vocabulary(),
    sessions: base.sessions,
    cardsFrom: (o) => tamper(buildCards(o).cards),
    shownProductIdsFrom: (o) => buildCards(o).shownIds,
    onVerifierFailure: (f) => failures.push(f),
  });
  return { ...base, pipeline, failures };
}
const priceTo = (text: string) => (cards: Card[]) => cards.map((c) => (c.type === "product" ? { ...c, price: { ...c.price, text } } : c));

describe("a response that fails verification is replaced by a fixed safe text", () => {
  it("rejects a tampered price: no cards, no actions, the fixed template, and only a failure code is reported", async () => {
    const t = tampered(priceTo("Rs. 1.00"));
    const { result, events } = await run(t.pipeline, "Tell me about the Atlas Smartwatch");
    expect(result.reply).toEqual({ text: renderTemplate("verification_failed", "en").text, source: "template" });
    expect(result.cards).toEqual([]);
    expect(result.actions).toEqual([]);
    expect(events.filter((e) => e.type === "card" || e.type === "action")).toEqual([]);
    expect(JSON.stringify(result)).not.toContain("Rs. 1.00");
    expect(t.failures).toHaveLength(1);
    expect(Object.keys(t.failures[0]!).sort()).toEqual(["code", "requestId"]);
    expect(t.failures[0]!.code).toBe("product_mismatch");
  });

  it("does not remember products from a rejected answer (so 'this one' cannot point at them)", async () => {
    const t = tampered(priceTo("Rs. 1.00"));
    await run(t.pipeline, "Tell me about the Atlas Smartwatch");
    const state = t.sessions.get("anon|sess_0123456789abcdef");
    expect(state?.lastShownProductIds).toEqual([]);
  });

  it.each<[string, (c: Card[]) => Card[], VerifyFailure]>([
    ["an invented product id", (c) => c.map((x) => (x.type === "product" ? { ...x, id: itemId(77) } : x)), "unknown_product"],
    ["a link to an outside site", (c) => c.map((x) => (x.type === "product" ? ({ ...x, url: "/products/evil" } as Card) : x)), "link_not_approved"],
    ["a flipped stock status", (c) => c.map((x) => (x.type === "product" ? { ...x, available: !x.available } : x)), "product_mismatch"],
    ["an invented warranty", (c) => c.map((x) => (x.type === "product" ? { ...x, specs: [...(x.specs ?? []), { name: "Warranty", value: "10 years" }] } : x)), "product_mismatch"],
    ["an invented offer", (c) => c.map((x) => (x.type === "product" ? { ...x, offerName: "90% off today" } : x)), "product_mismatch"],
  ])("rejects %s", async (_n, tamper, code) => {
    const t = tampered(tamper);
    const { result } = await run(t.pipeline, "Tell me about the Atlas Smartwatch");
    expect(result.cards).toEqual([]);
    expect(result.reply.text).toBe(renderTemplate("verification_failed", "en").text);
    expect(t.failures.map((f) => f.code)).toEqual([code]);
  });

  it("uses the Sinhala fixed text for a Sinhala message and keeps needsNativeReview true", async () => {
    const t = tampered(priceTo("Rs. 1.00"));
    const { result } = await run(t.pipeline, "Atlas smartwatch එක ගැන කියන්න");
    expect(result.reply.text).toBe(renderTemplate("verification_failed", "si").text);
    expect(result.needsNativeReview).toBe(true);
    expect(result.cards).toEqual([]);
    expect(ChatResponse.safeParse({ requestId: "r", sessionId: "sess_0123456789abcdef", ...result, meta: { ...result.meta, latencyMs: 1, contractVersion: "1.1" } }).success).toBe(true);
  });

  it("is never silently repaired: the rejected card is not corrected from catalogue data or a guess", async () => {
    const t = tampered(priceTo("Rs. 1.00"));
    const { result } = await run(t.pipeline, "Tell me about the Atlas Smartwatch");
    expect(JSON.stringify(result)).not.toMatch(/34,900/); // the true price is not substituted either
  });
});

describe("the verifier does not reject genuine answers", () => {
  it("passes ~280 messages for guests and customers, with a cart and page context, without a single verification failure", async () => {
    const failures: VerifyFailure[] = [];
    const s = createMockStack({ onVerifierFailure: (f) => failures.push(f.code) });
    const texts = [...SET_A, ...SET_B, ...SET_C].map((c) => c.text).concat(UNSAFE.map((u) => u.text), ["Show me phones", "Tell me about the Nova X1", "Compare Nova X1, Orbit Pro, Atlas Smartwatch and Zen Book 14 Laptop", "any phones on sale?", "What accessories fit the Zen Book 14?", "show my cart", "where is my order", "Show me laptops", "show me keyboards"]);
    let cards = 0;
    for (const m of texts) {
      for (const customer of [false, true]) {
        const { result } = await run(s.pipeline, m.slice(0, 700), { customer, cart: [{ productId: itemId(3), quantity: 1 }], context: { page: "product", productId: itemId(1) } });
        cards += result.cards.length;
      }
    }
    expect(failures).toEqual([]);
    expect(cards).toBeGreaterThan(150);
  });

  it("passes every card type: search, details, comparison of 2 to 4, stock, accessories, cart, orders and proposals", async () => {
    const failures: VerifyFailure[] = [];
    const s = createMockStack({ onVerifierFailure: (f) => failures.push(f.code) });
    const types = new Set<string>();
    for (const m of ["Show me phones", "Tell me about the Orbit Pro", "Compare Nova X1 and Orbit Pro", "Compare Nova X1, Orbit Pro and Atlas Smartwatch", "Compare Nova X1, Orbit Pro, Atlas Smartwatch and Zen Book 14 Laptop", "Is the Atlas Smartwatch in stock?", "What accessories fit the Zen Book 14?", "show my cart", "mage order eka koheda?", "Orbit Pro එක cart එකට දාන්න"]) {
      const { result } = await run(s.pipeline, m, { customer: "cust_1", cart: [{ productId: itemId(3), quantity: 2 }] });
      result.cards.forEach((c) => types.add(c.type));
      result.actions.forEach((a) => types.add(a.type));
    }
    expect([...types].sort()).toEqual(["accessory", "cart", "cart.add", "comparison", "order", "product", "stock"]);
    expect(failures).toEqual([]);
  });

  it("an order card is verified for a customer and a guest never gets one, through the verifier as well as the router", async () => {
    const s = createMockStack({ onVerifierFailure: () => {} });
    const guest = await run(s.pipeline, "mage order eka koheda?");
    expect(guest.result.cards).toEqual([]);
    const cust = await run(s.pipeline, "mage order eka koheda?", { customer: "cust_1" });
    expect(cust.result.cards.map((c) => c.type)).toEqual(["order", "order"]);
  });
});

describe("over HTTP: a verification failure never leaks the rejected content", () => {
  let app: RunningServer | undefined;
  afterEach(async () => {
    await app?.close();
  });
  async function serve(pipeline: RoutingPipeline) {
    const config = loadConfig({ AGENT_HMAC_KEYS: `k1:${SECRET}`, AGENT_PORT: "0", AI_ASSISTANT_ENABLED: "true" });
    app = createAgentServer({ config, pipeline, memory: async () => ({ availableMb: null, swapUsedMb: null }) });
    return `http://127.0.0.1:${(await app.listen()).port}`;
  }

  it("returns a valid 200 response with the fixed text and no cards, for both JSON and stream", async () => {
    const t = tampered(priceTo("Rs. 1.00"));
    const url = await serve(t.pipeline);
    const res = await post(url, { ...chat("Tell me about the Atlas Smartwatch", sid(1)), contractVersion: "1.1" });
    const body = (await res.json()) as { cards: unknown[]; reply: { text: string }; actions: unknown[] };
    expect(res.status).toBe(200);
    expect(ChatResponse.safeParse(body).success).toBe(true);
    expect(body.cards).toEqual([]);
    expect(body.reply.text).toBe(renderTemplate("verification_failed", "en").text);
    const streamed = await (await post(url, { ...chat("Tell me about the Atlas Smartwatch", sid(2)), contractVersion: "1.1" }, { path: "/v1/chat/stream" })).text();
    expect(streamed).not.toContain("event: card");
    expect(streamed).not.toContain("Rs. 1.00");
    expect(streamed).toContain("event: text");
    expect(streamed).toContain("event: done");
  });
});

describe("a polished Sinhala text is verified like any other", () => {
  it("is rejected and replaced by the fixed template when the model's wording carries a price or a link", async () => {
    const failures: VerifyFailure[] = [];
    const base = createMockStack();
    const polisher = { polish: async () => ({ polished: true as const, text: "ආයුබෝවන්! Nova X1 Rs. 1,000 https://evil.example", queuedMs: 0 }) };
    const pipeline = new RoutingPipeline({ registry: base.registry, vocab: () => base.catalogue.vocabulary(), sessions: base.sessions, polisher: polisher as never, onVerifierFailure: (f) => failures.push(f.code) });
    const { result } = await run(pipeline, "ආයුබෝවන්");
    expect(result.reply.source).toBe("template");
    expect(result.reply.text).not.toMatch(/Rs\.|https/);
    expect(result.needsNativeReview).toBe(true);
    expect(failures).toEqual(["reply_unsupported"]);
  });

  it("is accepted when it is fact-free Sinhala, still flagged for native review", async () => {
    const base = createMockStack();
    const polisher = { polish: async () => ({ polished: true as const, text: "ආයුබෝවන්! මම VOLTA.LK සහායකයා.", queuedMs: 0 }) };
    const pipeline = new RoutingPipeline({ registry: base.registry, vocab: () => base.catalogue.vocabulary(), sessions: base.sessions, polisher: polisher as never });
    const { result } = await run(pipeline, "ආයුබෝවන්");
    expect(result.reply.source).toBe("sinhala-llm");
    expect(result.needsNativeReview).toBe(true);
  });
});

describe("verification failures are logged as a code only", () => {
  it("writes the request id and a failure code, never the rejected card, price or message", async () => {
    const lines: string[] = [];
    const base = createMockStack();
    const pipeline = new RoutingPipeline({
      registry: base.registry,
      vocab: () => base.catalogue.vocabulary(),
      sessions: base.sessions,
      cardsFrom: (o) => priceTo("Rs. 1.00")(buildCards(o).cards),
      onVerifierFailure: verifierFailureLogger(createLogger({ write: (l) => lines.push(l) })),
    });
    await run(pipeline, "Tell me about the Atlas Smartwatch zebra-quartz-77");
    expect(lines).toHaveLength(1);
    const out = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(out.errorCode).toBe("VERIFIER_PRODUCT_MISMATCH");
    expect(lines[0]).not.toMatch(/Rs\. 1\.00|Atlas|zebra-quartz/);
  });
});

describe("missing data", () => {
  it("an ERP outage yields the fixed 'could not get that' text, never a guess, and no verification failure", async () => {
    const failures: VerifyFailure[] = [];
    const transport = new FixtureErpTransport();
    const s = createMockStack({ transport, onVerifierFailure: (f) => failures.push(f.code) });
    transport.setDown(true);
    const { result } = await run(s.pipeline, "Tell me about the Atlas Smartwatch");
    expect(result.reply.text).toBe(renderTemplate("tool_failed", "en").text);
    expect(result.cards).toEqual([]);
    expect(failures).toEqual([]);
  });
});
