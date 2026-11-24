import { describe, expect, it } from "vitest";
import {
  AGENT_CONTRACT_VERSION,
  AGENT_CONTRACT_VERSION_BROWSER,
  AgentChatResponse,
  AgentChatResponse13,
  AgentDecisionResponse,
  BrowserDecisionBody,
  BrowserPanel,
  BrowserRequest,
  PAGE_PATH,
  toPublic,
} from "@/lib/assistant/schema";

const PID = "bp_AbCdEfGhIjKlMnOpQr";
const panel = (over: Record<string, unknown> = {}) => ({
  source: "page",
  progress: [
    { step: "open", status: "done", label: "Opening the page" },
    { step: "find", status: "done", label: "Looking for the control" },
    { step: "act", status: "skipped", label: "Pressing it" },
  ],
  confirmation: { proposalId: PID, description: 'Change your cart: "Add to cart"', page: "/products/gaming-laptop-x1", actionClass: "reversible", expiresInSec: 120 },
  ...over,
});
const chat = (version: string, extra: Record<string, unknown> = {}) => ({
  requestId: "req_1",
  sessionId: "sess_abc",
  language: "en",
  reply: { text: "ok", source: "template" },
  needsNativeReview: false,
  cards: [],
  actions: [],
  suggestions: [],
  meta: { model: null, degraded: false, queuedMs: 0, latencyMs: 1, contractVersion: version },
  ...extra,
});

describe("the website still speaks contract 1.2", () => {
  it("keeps the production version constant at 1.2 and names 1.3 separately", () => {
    expect(AGENT_CONTRACT_VERSION).toBe("1.2");
    expect(AGENT_CONTRACT_VERSION_BROWSER).toBe("1.3");
  });

  it("the 1.2 response schema is unchanged: it refuses a `browser` field and a 1.3 version", () => {
    expect(AgentChatResponse.safeParse(chat("1.2")).success).toBe(true);
    expect(AgentChatResponse.safeParse(chat("1.2", { browser: panel() })).success).toBe(false);
    expect(AgentChatResponse.safeParse(chat("1.3")).success).toBe(false);
  });

  it("the 1.3 response schema accepts the optional panel and only version 1.3", () => {
    expect(AgentChatResponse13.safeParse(chat("1.3")).success).toBe(true);
    expect(AgentChatResponse13.safeParse(chat("1.3", { browser: panel() })).success).toBe(true);
    expect(AgentChatResponse13.safeParse(chat("1.2")).success).toBe(false);
  });

  it("the Sinhala rule applies to 1.3 as well", () => {
    const si = chat("1.3", { language: "si", reply: { text: "හරි", source: "template" }, needsNativeReview: false });
    expect(AgentChatResponse13.safeParse(si).success).toBe(false);
    expect(AgentChatResponse13.safeParse({ ...si, needsNativeReview: true }).success).toBe(true);
  });
});

describe("browser panel (strict mirror of the Agent's BrowserPanel)", () => {
  it("accepts the documented example", () => {
    expect(BrowserPanel.safeParse(panel()).success).toBe(true);
    expect(BrowserPanel.safeParse(panel({ confirmation: undefined })).success).toBe(true);
    expect(BrowserPanel.safeParse({ source: "page", progress: [] }).success).toBe(true);
  });

  it("refuses unknown fields anywhere, a source other than page, unknown steps and statuses", () => {
    expect(BrowserPanel.safeParse(panel({ extra: 1 })).success).toBe(false);
    expect(BrowserPanel.safeParse(panel({ source: "catalogue" })).success).toBe(false);
    expect(BrowserPanel.safeParse(panel({ progress: [{ step: "teleport", status: "done", label: "x" }] })).success).toBe(false);
    expect(BrowserPanel.safeParse(panel({ progress: [{ step: "open", status: "maybe", label: "x" }] })).success).toBe(false);
    expect(BrowserPanel.safeParse(panel({ progress: [{ step: "open", status: "done", label: "x", html: "<b>" }] })).success).toBe(false);
    expect(BrowserPanel.safeParse(panel({ progress: Array.from({ length: 9 }, () => ({ step: "open", status: "done", label: "x" })) })).success).toBe(false);
  });

  it("bounds and checks the proposal", () => {
    const c = (o: Record<string, unknown>) => panel({ confirmation: { proposalId: PID, description: "d", page: "/p", actionClass: "sensitive", expiresInSec: 60, ...o } });
    expect(BrowserPanel.safeParse(c({})).success).toBe(true);
    expect(BrowserPanel.safeParse(c({ proposalId: "bp_short" })).success).toBe(false);
    expect(BrowserPanel.safeParse(c({ proposalId: "xx_AbCdEfGhIjKlMnOpQr" })).success).toBe(false);
    expect(BrowserPanel.safeParse(c({ description: "" })).success).toBe(false);
    expect(BrowserPanel.safeParse(c({ description: "a".repeat(201) })).success).toBe(false);
    expect(BrowserPanel.safeParse(c({ description: "bad\u0000text" })).success).toBe(false);
    expect(BrowserPanel.safeParse(c({ actionClass: "financial" })).success).toBe(false); // payment is never offered for approval
    expect(BrowserPanel.safeParse(c({ expiresInSec: 0 })).success).toBe(false);
    expect(BrowserPanel.safeParse(c({ expiresInSec: 601 })).success).toBe(false);
    expect(BrowserPanel.safeParse(c({ expiresInSec: 1.5 })).success).toBe(false);
  });

  it("only accepts a page that is a path on this site (no host, scheme, protocol-relative or backslash forms)", () => {
    const ok = ["/", "/products/gaming-laptop-x1", "/products?q=laptop&sort=price", "/categories/phones"];
    const bad = ["//evil.test/x", "http://evil.test/", "https://valta.hexalyte.com/", "javascript:alert(1)", "\\\\evil", "/\\evil", "products/x", "/a b", "/<script>", ""];
    for (const p of ok) expect(PAGE_PATH.test(p), p).toBe(true);
    for (const p of bad) expect(PAGE_PATH.test(p), p).toBe(false);
    for (const p of bad.filter(Boolean)) expect(BrowserPanel.safeParse(panel({ confirmation: { proposalId: PID, description: "d", page: p, actionClass: "reversible", expiresInSec: 10 } })).success, p).toBe(false);
  });
});

describe("decision schemas", () => {
  it("the browser may send exactly { proposalId }", () => {
    expect(BrowserDecisionBody.safeParse({ proposalId: PID }).success).toBe(true);
    for (const b of [{}, { proposalId: "x" }, { proposalId: PID, sessionId: "sess_x" }, { proposalId: PID, extra: 1 }]) expect(BrowserDecisionBody.safeParse(b).success).toBe(false);
  });

  it("the Agent's answer needs every field, a template reply and a panel", () => {
    const ok = { requestId: "r", sessionId: "s", outcome: "done", reply: { text: "x", source: "template" }, needsNativeReview: false, browser: { source: "page", progress: [] } };
    expect(AgentDecisionResponse.safeParse(ok).success).toBe(true);
    expect(AgentDecisionResponse.safeParse({ ...ok, reply: { text: "x", source: "qwen" } }).success).toBe(false);
    expect(AgentDecisionResponse.safeParse({ ...ok, browser: undefined }).success).toBe(false);
    expect(AgentDecisionResponse.safeParse({ ...ok, outcome: "approved" }).success).toBe(false);
    expect(AgentDecisionResponse.safeParse({ ...ok, extra: 1 }).success).toBe(false);
  });
});

describe("chat request and public response", () => {
  it("the request may carry an optional page path of the Agent's shape, and nothing else is new", () => {
    expect(BrowserRequest.safeParse({ message: "hi", path: "/products?q=laptop" }).success).toBe(true);
    expect(BrowserRequest.safeParse({ message: "hi" }).success).toBe(true);
    expect(BrowserRequest.safeParse({ message: "hi", path: "https://evil.test" }).success).toBe(false);
    expect(BrowserRequest.safeParse({ message: "hi", path: "//evil.test" }).success).toBe(false);
    expect(BrowserRequest.safeParse({ message: "hi", path: "/" + "a".repeat(200) }).success).toBe(false);
    expect(BrowserRequest.safeParse({ message: "hi", sessionId: "sess_0123456789abcdef" }).success).toBe(false);
  });

  it("toPublic keeps a 1.2 answer exactly as before (no browser key) and forwards the panel only when present", () => {
    const a = toPublic(AgentChatResponse.parse(chat("1.2")), {});
    expect("browser" in a).toBe(false);
    const b = toPublic(AgentChatResponse13.parse(chat("1.3")), {});
    expect("browser" in b).toBe(false);
    const c = toPublic(AgentChatResponse13.parse(chat("1.3", { browser: panel() })), {});
    expect(c.browser?.confirmation?.proposalId).toBe(PID);
    expect(Object.keys(c).sort()).toEqual(["actions", "browser", "cards", "language", "needsNativeReview", "reply", "suggestions"]);
  });
});
