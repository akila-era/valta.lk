/**
 * A FAKE Agent API for browser tests of the assistant widget (canned answers, no model, no ERP, no data). It verifies the HMAC
 * signature exactly as the real Agent does and records what it was sent, so a test can prove the website signs requests, never
 * sends personal data and derives the conversation id itself. GET /__seen returns the records; POST /__reset clears them.
 * Run: FAKE_AGENT_PORT=4013 npx tsx tests/stubs/fake-agent.ts
 */
import { createHash, createHmac } from "node:crypto";
import http from "node:http";

const PORT = Number(process.env.FAKE_AGENT_PORT ?? 4013);
const SECRET = process.env.FAKE_AGENT_SECRET ?? "e2e-agent-secret-0123456789-abcdefghij";
const seen: { identity: string; sessionId: string; message: string; cartLines: number; page?: string; signatureValid: boolean; clientIp: string }[] = [];
const nonces = new Set<string>();

const earbuds = { type: "product", id: "cm0item00000003", slug: "pulse-wireless-earbuds-cm0item00000003", name: "Pulse Wireless Earbuds", brand: "Pulse", price: { amount: 14900, text: "Rs. 14,900.00" }, available: true, url: "/products/pulse-wireless-earbuds-cm0item00000003" };
const headphones = { type: "product", id: "cm0item00000004", slug: "pulse-over-ear-headphones-cm0item00000004", name: "Pulse Over-Ear Headphones", brand: "Pulse", price: { amount: 24900, text: "Rs. 24,900.00" }, available: true, url: "/products/pulse-over-ear-headphones-cm0item00000004" };

function answer(message: string): { status: number; body: unknown } {
  const m = message.toLowerCase();
  const base = { requestId: "req_fake", sessionId: "sess_fake", language: "en", reply: { text: "Here is what I found.", source: "template" }, needsNativeReview: false, cards: [] as unknown[], actions: [] as unknown[], suggestions: [], meta: { model: null, degraded: false, queuedMs: 0, latencyMs: 3, contractVersion: "1.1" } };
  if (m.includes("boom")) return { status: 500, body: { error: { code: "INTERNAL", message: "internal detail that must never reach the shopper" } } };
  if (/[඀-෿]/.test(message)) return { status: 200, body: { ...base, language: "si", reply: { text: "මෙන්න මට සොයාගත හැකි දේ.", source: "template" }, needsNativeReview: true } };
  if (m.includes("compare")) {
    return { status: 200, body: { ...base, cards: [{ type: "comparison", products: [earbuds, headphones], rows: [{ label: "Price", values: ["Rs. 14,900.00", "Rs. 24,900.00"], differs: true }, { label: "Battery", values: ["8 h", null], differs: true }], priceDelta: { amount: 10000, text: "Rs. 10,000.00" } }] } };
  }
  if (m.includes("add")) {
    return { status: 200, body: { ...base, reply: { text: "I've prepared that for your cart. Nothing changes until you confirm it yourself.", source: "template" }, cards: [earbuds], actions: [{ type: "cart.add", actionId: `act_${Date.now().toString(36)}abcd`, productId: earbuds.id, variantKey: "", quantity: 2, confirm: "ask" }] } };
  }
  if (m.includes("phone") || m.includes("show")) return { status: 200, body: { ...base, cards: [earbuds, headphones] } };
  if (m.includes("order")) return { status: 200, body: { ...base, reply: { text: "I can't look up orders for guests. Please use the Track order page.", source: "template" }, actions: [{ type: "navigate", actionId: `act_${Date.now().toString(36)}wxyz`, href: "/track-order" }] } };
  return { status: 200, body: base };
}

http
  .createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const send = (status: number, body: unknown) => (res.writeHead(status, { "content-type": "application/json" }), res.end(JSON.stringify(body)));
      if (req.url === "/__seen") return send(200, seen);
      if (req.url === "/__reset") return (seen.length = 0), nonces.clear(), send(200, {});
      if (req.url !== "/v1/chat" || req.method !== "POST") return send(404, { error: { code: "NOT_FOUND", message: "Not found." } });
      const raw = Buffer.concat(chunks);
      const h = req.headers;
      const expected = createHmac("sha256", SECRET).update([h["x-volta-timestamp"], h["x-volta-nonce"], req.method, req.url, h["x-volta-identity"], h["x-volta-client-ip"], createHash("sha256").update(raw).digest("hex")].join("\n")).digest("hex");
      const nonce = String(h["x-volta-nonce"]);
      const valid = h["x-volta-signature"] === expected && !nonces.has(nonce) && Math.abs(Date.now() / 1000 - Number(h["x-volta-timestamp"])) < 60;
      nonces.add(nonce);
      if (!valid) return send(401, { error: { code: "UNAUTHORIZED", message: "Unauthorized." } });
      const body = JSON.parse(raw.toString("utf8")) as { message: string; sessionId: string; cart: unknown[]; context?: { page?: string } };
      seen.push({ identity: String(h["x-volta-identity"]), sessionId: body.sessionId, message: body.message, cartLines: body.cart.length, page: body.context?.page, signatureValid: valid, clientIp: String(h["x-volta-client-ip"]) });
      const a = answer(body.message);
      send(a.status, a.body);
    });
  })
  .listen(PORT, "127.0.0.1", () => process.stdout.write(`fake agent on ${PORT}\n`));
