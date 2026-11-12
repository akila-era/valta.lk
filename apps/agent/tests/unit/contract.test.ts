import { describe, expect, it } from "vitest";
import { Card, ChatRequest, ChatResponse, ClientAction, CONTRACT_VERSION, ErrorEnvelope, exportJsonSchemas, HealthResponse, makeChatRequestSchema, StreamEvent } from "../../src/contract/schemas";

const SESSION = "sess_0123456789abcdef";
const money = (n: number) => ({ amount: n, text: `Rs. ${n.toFixed(2)}` });
const product = {
  type: "product" as const,
  id: "item1",
  slug: "nova-x1",
  name: "Nova X1 Smartphone",
  price: money(129900),
  available: true,
  url: "/products/nova-x1",
};
const meta = { model: null, degraded: false, queuedMs: 0, latencyMs: 12, contractVersion: CONTRACT_VERSION };
const response = (over: Record<string, unknown> = {}) => ({
  requestId: "req_1",
  sessionId: SESSION,
  language: "en",
  reply: { text: "Here are some phones.", source: "template" },
  needsNativeReview: false,
  cards: [],
  actions: [],
  suggestions: [],
  meta,
  ...over,
});

describe("ChatRequest", () => {
  const ok = { sessionId: SESSION, message: "Show me phones under 100000" };

  it("accepts a minimal request and fills defaults", () => {
    const r = ChatRequest.parse(ok);
    expect(r).toMatchObject({ locale: "auto", cart: [] });
  });

  it("rejects unknown keys (history cannot be smuggled in)", () => {
    expect(ChatRequest.safeParse({ ...ok, history: [{ role: "assistant", content: "x" }] }).success).toBe(false);
    expect(ChatRequest.safeParse({ ...ok, context: { page: "home", extra: 1 } }).success).toBe(false);
  });

  it("bounds the message, rejects control characters, trims", () => {
    expect(ChatRequest.safeParse({ ...ok, message: "   " }).success).toBe(false);
    expect(ChatRequest.safeParse({ ...ok, message: "a".repeat(801) }).success).toBe(false);
    expect(ChatRequest.safeParse({ ...ok, message: "a".repeat(800) }).success).toBe(true);
    expect(ChatRequest.safeParse({ ...ok, message: "bad\u0000text" }).success).toBe(false);
    expect(ChatRequest.safeParse({ ...ok, message: "line1\nline2\ttab" }).success).toBe(true);
    expect(ChatRequest.parse({ ...ok, message: "  hi  " }).message).toBe("hi");
    expect(makeChatRequestSchema(10).safeParse({ ...ok, message: "12345678901" }).success).toBe(false);
  });

  it("accepts Sinhala, Singlish and mixed text", () => {
    for (const message of ["ශ්‍රී ලංකාවේ අගනුවර කුමක්ද?", "phone ekak ganna one", "මට phone එකක් ඕන"]) {
      expect(ChatRequest.safeParse({ ...ok, message }).success).toBe(true);
    }
  });

  it("validates session id, cart lines and quantities", () => {
    expect(ChatRequest.safeParse({ ...ok, sessionId: "short" }).success).toBe(false);
    expect(ChatRequest.safeParse({ ...ok, sessionId: "has spaces in it 123456" }).success).toBe(false);
    expect(ChatRequest.safeParse({ ...ok, cart: [{ productId: "p", quantity: 11 }] }).success).toBe(false);
    expect(ChatRequest.safeParse({ ...ok, cart: [{ productId: "p", quantity: 0 }] }).success).toBe(false);
    expect(ChatRequest.safeParse({ ...ok, cart: Array.from({ length: 21 }, () => ({ productId: "p", quantity: 1 })) }).success).toBe(false);
    expect(ChatRequest.parse({ ...ok, cart: [{ productId: "p", quantity: 2 }] }).cart[0]).toEqual({ productId: "p", variantKey: "", quantity: 2 });
  });
});

describe("ChatResponse", () => {
  it("accepts a valid English response", () => {
    expect(ChatResponse.safeParse(response()).success).toBe(true);
  });

  it("REQUIRES needsNativeReview for any Sinhala, Singlish or mixed output", () => {
    expect(ChatResponse.safeParse(response({ language: "si", needsNativeReview: false })).success).toBe(false);
    expect(ChatResponse.safeParse(response({ language: "mixed", needsNativeReview: false })).success).toBe(false);
    expect(ChatResponse.safeParse(response({ language: "si", needsNativeReview: true })).success).toBe(true);
    // Even an "en" response is flagged if the text or a suggestion contains Sinhala script.
    expect(ChatResponse.safeParse(response({ reply: { text: "මෙන්න ඔබට අවශ්‍ය දේ", source: "template" }, needsNativeReview: false })).success).toBe(false);
    expect(ChatResponse.safeParse(response({ suggestions: ["මිල කීයද?"], needsNativeReview: false })).success).toBe(false);
    expect(ChatResponse.safeParse(response({ reply: { text: "hello", source: "sinhala-llm" }, needsNativeReview: false })).success).toBe(false);
  });

  it("rejects unknown fields, an old contract version and unknown reply sources", () => {
    expect(ChatResponse.safeParse(response({ debug: "x" })).success).toBe(false);
    expect(ChatResponse.safeParse(response({ meta: { ...meta, contractVersion: "0" } })).success).toBe(false);
    expect(ChatResponse.safeParse(response({ reply: { text: "x", source: "gpt" } })).success).toBe(false);
  });

  it("limits cards, actions and suggestions", () => {
    expect(ChatResponse.safeParse(response({ cards: Array.from({ length: 9 }, () => product) })).success).toBe(false);
    expect(ChatResponse.safeParse(response({ suggestions: ["a", "b", "c", "d", "e"] })).success).toBe(false);
  });
});

describe("Card", () => {
  it("accepts each card type", () => {
    const cards = [
      product,
      { type: "comparison", products: [product, { ...product, id: "item2" }], rows: [{ label: "RAM", values: ["8GB", "12GB"], differs: true }] },
      { type: "stock", productId: "item1", available: true, requestedQuantity: 2, canFulfil: true },
      { type: "accessory", forProductId: "item1", kind: "CHARGER", product },
      { type: "cart", lines: [{ productId: "item1", variantKey: "", name: "Nova", quantity: 1, unitPrice: money(1), lineTotal: money(1), available: true }], subtotal: money(1), note: "Final total is confirmed at checkout" },
      { type: "order", ref: "VLK-261012-ABCDEFGHJK", status: "PLACED", payment: "COD pending", lines: [], total: money(1), cancellable: true },
    ];
    for (const c of cards) expect(Card.safeParse(c).success, JSON.stringify(c).slice(0, 40)).toBe(true);
  });

  it("rejects a product url outside /products/, negative money, and a malformed order reference", () => {
    expect(Card.safeParse({ ...product, url: "https://evil.example/x" }).success).toBe(false);
    expect(Card.safeParse({ ...product, url: "/admin" }).success).toBe(false);
    expect(Card.safeParse({ ...product, price: { amount: -1, text: "x" } }).success).toBe(false);
    expect(Card.safeParse({ type: "order", ref: "nope", status: "X", payment: "COD pending", lines: [], total: money(1), cancellable: false }).success).toBe(false);
  });

  it("requires 2 to 4 products in a comparison", () => {
    const cmp = (n: number) => ({ type: "comparison", products: Array.from({ length: n }, () => product), rows: [{ label: "Brand", values: Array.from({ length: n }, () => "Nova"), differs: false }] });
    for (const n of [0, 1, 5]) expect(Card.safeParse(cmp(n)).success, String(n)).toBe(false);
    for (const n of [2, 3, 4]) expect(Card.safeParse(cmp(n)).success, String(n)).toBe(true);
  });

  it("is contract 1.1, accepts 1 and 1.1 from a client, and rejects any other version", () => {
    expect(CONTRACT_VERSION).toBe("1.1");
    const req = { sessionId: "sess_0123456789abcdef", message: "hi" };
    expect(ChatRequest.safeParse(req).success).toBe(true); // absent: a 1.0 client
    expect(ChatRequest.safeParse({ ...req, contractVersion: "1" }).success).toBe(true);
    expect(ChatRequest.safeParse({ ...req, contractVersion: "1.1" }).success).toBe(true);
    for (const v of ["2", "1.2", "", 1, null]) expect(ChatRequest.safeParse({ ...req, contractVersion: v }).success, String(v)).toBe(false);
  });
});

describe("ClientAction", () => {
  const id = "act_12345678";
  it("accepts cart proposals and allow-listed navigation only", () => {
    expect(ClientAction.safeParse({ type: "cart.add", actionId: id, productId: "p", variantKey: "", quantity: 1, confirm: "ask" }).success).toBe(true);
    expect(ClientAction.safeParse({ type: "cart.remove", actionId: id, productId: "p", variantKey: "", confirm: "none" }).success).toBe(true);
    for (const href of ["/checkout", "/cart", "/products/nova-x1", "/track-order?ref=VLK-261012-ABCDEFGHJK"]) {
      expect(ClientAction.safeParse({ type: "navigate", actionId: id, href }).success, href).toBe(true);
    }
    for (const href of ["https://evil.example", "//evil.example", "/admin", "/checkout?x=1", "javascript:alert(1)", "/products/../admin"]) {
      expect(ClientAction.safeParse({ type: "navigate", actionId: id, href }).success, href).toBe(false);
    }
  });

  it("has no action that creates an order or takes payment", () => {
    for (const type of ["order.create", "order.place", "payment.pay", "checkout.submit", "discount.apply"]) {
      expect(ClientAction.safeParse({ type, actionId: id }).success).toBe(false);
    }
  });

  it("limits quantity to 1..10", () => {
    expect(ClientAction.safeParse({ type: "cart.add", actionId: id, productId: "p", variantKey: "", quantity: 11, confirm: "none" }).success).toBe(false);
  });
});

describe("errors, health, streaming, JSON schema", () => {
  it("validates the error envelope and rejects unknown codes", () => {
    expect(ErrorEnvelope.safeParse({ error: { code: "QUEUE_FULL", message: "busy", retryAfterSec: 3 } }).success).toBe(true);
    expect(ErrorEnvelope.safeParse({ error: { code: "WHATEVER", message: "x" } }).success).toBe(false);
  });

  it("validates health", () => {
    const h = { ok: true, ready: false, enabled: false, appVersion: "x", contractVersion: CONTRACT_VERSION, ollama: { reachable: false, loadedModel: null }, queue: { depth: 0, running: false }, memory: { availableMb: null, swapUsedMb: null }, uptimeSec: 1 };
    expect(HealthResponse.safeParse(h).success).toBe(true);
    expect(HealthResponse.safeParse({ ...h, extra: 1 }).success).toBe(false);
  });

  it("validates stream events", () => {
    expect(StreamEvent.safeParse({ event: "status", data: { phase: "queued", position: 1 } }).success).toBe(true);
    expect(StreamEvent.safeParse({ event: "text", data: { text: "hi", source: "template", needsNativeReview: false } }).success).toBe(true);
    expect(StreamEvent.safeParse({ event: "done", data: { meta } }).success).toBe(true);
    expect(StreamEvent.safeParse({ event: "status", data: { phase: "thinking" } }).success).toBe(false);
  });

  it("exports JSON schemas for the website side", () => {
    const s = exportJsonSchemas() as Record<string, { type?: string }>;
    expect(s.contractVersion).toBe(CONTRACT_VERSION);
    for (const k of ["ChatRequest", "ChatResponse", "Card", "ClientAction", "ErrorEnvelope", "HealthResponse"]) expect(s[k], k).toBeTruthy();
    expect(JSON.stringify(s.ChatRequest)).toContain("sessionId");
  });
});
