import { describe, expect, it, vi } from "vitest";
import { CANCEL_URL, CONFIRM_URL, parseBrowserPanel, parseDecision, sendDecision, visibleBrowserPanel } from "@/lib/assistant/browser-client";
import { browserEnabled } from "@/lib/assistant/browser-flag";
import { pagePathFor } from "@/lib/assistant/page-path";

const PID = "bp_AbCdEfGhIjKlMnOpQr";
const panel = () => ({ source: "page", progress: [{ step: "open", status: "done", label: "ignored" }, { step: "act", status: "failed", label: "ignored" }], confirmation: { proposalId: PID, description: "Change your cart", page: "/products/x", actionClass: "reversible", expiresInSec: 90 } });
const decision = (over: Record<string, unknown> = {}) => ({ outcome: "done", reply: { text: "Done." }, needsNativeReview: false, browser: { source: "page", progress: [{ step: "close", status: "done", label: "x" }] }, ...over });
const res = (status: number, body: unknown) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status });

describe("feature flag", () => {
  it("is on only for exactly 1", () => {
    expect(browserEnabled({ AI_ASSISTANT_BROWSER: "1" })).toBe(true);
    expect(browserEnabled({ AI_ASSISTANT_BROWSER: " 1 " })).toBe(true);
    for (const v of [undefined, "", "0", "true", "on", "2"]) expect(browserEnabled({ AI_ASSISTANT_BROWSER: v }), String(v)).toBe(false);
  });
  it("hides a panel whenever the feature is off", () => {
    const p = parseBrowserPanel(panel())!;
    expect(visibleBrowserPanel(p, false)).toBeUndefined();
    expect(visibleBrowserPanel(p, true)).toBe(p);
    expect(visibleBrowserPanel(undefined, true)).toBeUndefined();
  });
});

describe("parseBrowserPanel", () => {
  it("returns a clean copy: the Agent's label text is dropped, only the step and status survive", () => {
    const p = parseBrowserPanel(panel())!;
    expect(p.progress).toEqual([{ step: "open", status: "done" }, { step: "act", status: "failed" }]);
    expect(p.confirmation).toEqual({ proposalId: PID, description: "Change your cart", page: "/products/x", actionClass: "reversible", expiresInSec: 90 });
  });
  it("rejects anything off (wrong source, step, id, page, class, expiry, size, control characters)", () => {
    const bad: unknown[] = [
      null,
      "x",
      { ...panel(), source: "catalogue" },
      { ...panel(), progress: [{ step: "teleport", status: "done" }] },
      { ...panel(), progress: [{ step: "open", status: "great" }] },
      { ...panel(), progress: Array.from({ length: 9 }, () => ({ step: "open", status: "done" })) },
      { ...panel(), confirmation: { ...panel().confirmation, proposalId: "bp_x" } },
      { ...panel(), confirmation: { ...panel().confirmation, page: "//evil.test" } },
      { ...panel(), confirmation: { ...panel().confirmation, page: "https://evil.test/" } },
      { ...panel(), confirmation: { ...panel().confirmation, actionClass: "financial" } },
      { ...panel(), confirmation: { ...panel().confirmation, expiresInSec: 601 } },
      { ...panel(), confirmation: { ...panel().confirmation, expiresInSec: 0 } },
      { ...panel(), confirmation: { ...panel().confirmation, description: "a\u0000b" } },
      { ...panel(), confirmation: { ...panel().confirmation, description: "a".repeat(201) } },
    ];
    for (const b of bad) expect(parseBrowserPanel(b), JSON.stringify(b)?.slice(0, 60)).toBeNull();
  });
});

describe("parseDecision", () => {
  it("accepts a good answer and drops unknown fields", () => {
    const d = parseDecision({ ...decision(), requestId: "req", sessionId: "sess" })!;
    expect(Object.keys(d).sort()).toEqual(["browser", "needsNativeReview", "outcome", "reply"]);
  });
  it("rejects a wrong outcome, empty or oversized text, a missing flag or panel", () => {
    for (const bad of [decision({ outcome: "approved" }), decision({ reply: { text: "" } }), decision({ reply: { text: "x".repeat(2001) } }), decision({ needsNativeReview: "no" }), decision({ browser: undefined }), null]) expect(parseDecision(bad)).toBeNull();
  });
});

describe("sendDecision", () => {
  it("posts only { proposalId } as JSON to the right route", async () => {
    const f = vi.fn(async () => res(200, decision()));
    const r = await sendDecision("confirm", PID, f as unknown as typeof fetch);
    expect(r.ok).toBe(true);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(CONFIRM_URL);
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ proposalId: PID });
    await sendDecision("cancel", PID, f as unknown as typeof fetch);
    expect((f.mock.calls[1] as unknown as [string])[0]).toBe(CANCEL_URL);
  });
  it("never sends a malformed proposal id", async () => {
    const f = vi.fn();
    expect(await sendDecision("confirm", "nope", f as unknown as typeof fetch)).toEqual({ ok: false, reason: "failed" });
    expect(f).not.toHaveBeenCalled();
  });
  it("maps 404 to unavailable, 429 to rate_limited, other errors to failed, a thrown fetch to network, a bad body to failed", async () => {
    const f = (r: Response | Error) => (async () => { if (r instanceof Error) throw r; return r; }) as unknown as typeof fetch;
    expect(await sendDecision("confirm", PID, f(res(404, {})))).toEqual({ ok: false, reason: "unavailable" });
    expect(await sendDecision("confirm", PID, f(res(429, {})))).toEqual({ ok: false, reason: "rate_limited" });
    expect(await sendDecision("confirm", PID, f(res(502, {})))).toEqual({ ok: false, reason: "failed" });
    expect(await sendDecision("confirm", PID, f(new Error("offline")))).toEqual({ ok: false, reason: "network" });
    expect(await sendDecision("confirm", PID, f(res(200, "not json")))).toEqual({ ok: false, reason: "failed" });
    expect(await sendDecision("confirm", PID, f(res(200, decision({ outcome: "bogus" }))))).toEqual({ ok: false, reason: "failed" });
  });
});

describe("pagePathFor (what the widget may report as the current page)", () => {
  it("reports the path and query of ordinary pages", () => {
    expect(pagePathFor("/products/gaming-laptop-x1")).toBe("/products/gaming-laptop-x1");
    expect(pagePathFor("/categories/phones", "?sort=price&min=1000")).toBe("/categories/phones?sort=price&min=1000");
    expect(pagePathFor("/", "")).toBe("/");
    expect(pagePathFor("/search", "q=laptop")).toBe("/search?q=laptop");
  });
  it("never reports pages that can hold personal data, and never anything the Agent would reject", () => {
    for (const p of ["/checkout", "/checkout/pay", "/account", "/account/orders", "/admin/x", "/track-order", "/api/x", "/login", "/order-confirmation/1"]) expect(pagePathFor(p, "?ref=VLK-1"), p).toBeUndefined();
    expect(pagePathFor("//evil.test")).toBeUndefined();
    expect(pagePathFor("relative")).toBeUndefined();
    expect(pagePathFor("/a b")).toBeUndefined();
  });
  it("falls back to the bare path when only the query is unusable or too long", () => {
    expect(pagePathFor("/products", "?q=" + "a".repeat(300))).toBe("/products");
    expect(pagePathFor("/products", "?q=a b<")).toBe("/products");
    expect(pagePathFor("/" + "a".repeat(250))).toBeUndefined();
  });
});
