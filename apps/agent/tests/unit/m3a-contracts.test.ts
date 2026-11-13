import { describe, expect, it } from "vitest";
import { BROWSER_LIMITS, BrowserRequest, BrowserResponse } from "../../src/browser/protocol";
import { MODEL_DESCRIPTORS, RegistryError, installedTagMatches, selectModel, validateRegistry } from "../../src/models/registry";
import type { ModelDescriptor } from "../../src/models/types";
import { MODELS } from "../../src/ollama/models";
import { ACTION_CLASSES, CONFIRMATION_RULE, TOOL_ACTION_CLASS, actionClassOf } from "../../src/tools/action-classes";
import { createToolRegistry } from "../../src/tools/definitions";
import { createStubBackend } from "../fixtures/stub-backend";

describe("action classes: every live tool is classified and no financial tool exists", () => {
  const tools = createToolRegistry(createStubBackend().backend).list();

  it("classifies every registered tool, and nothing else", () => {
    expect(tools.map((t) => t.name).sort()).toEqual(Object.keys(TOOL_ACTION_CLASS).sort());
    for (const t of tools) expect(ACTION_CLASSES).toContain(actionClassOf(t.name));
  });

  it("has NO tool in the financial class (payment, order placement and discounts are never available to the assistant)", () => {
    expect(tools.filter((t) => actionClassOf(t.name) === "financial")).toEqual([]);
    expect(CONFIRMATION_RULE.financial).toBe("never");
    for (const t of tools) expect(t.name).not.toMatch(/pay|checkout|place_order|create_order|discount|refund|price/i);
  });

  it("puts the cart tools in the reversible class and requires a shopper click for them", () => {
    for (const n of ["add_to_cart", "update_cart_quantity", "remove_from_cart"]) expect(actionClassOf(n)).toBe("reversible");
    expect(CONFIRMATION_RULE.reversible).toBe("shopper-click");
  });

  it("returns null for an unknown tool name, including inherited object keys", () => {
    for (const n of ["nope", "constructor", "__proto__", "toString"]) expect(actionClassOf(n)).toBeNull();
  });
});

describe("browser worker protocol", () => {
  const id = "task_abc12345";

  it("accepts the supported operations", () => {
    for (const r of [
      { op: "open", taskId: id, url: "https://valta.hexalyte.com/" },
      { op: "snapshot", taskId: id },
      { op: "read_text", taskId: id },
      { op: "click", taskId: id, ref: "e12" },
      { op: "type", taskId: id, ref: "e3", text: "phones" },
      { op: "select", taskId: id, ref: "e4", value: "128GB" },
      { op: "scroll", taskId: id, direction: "down" },
      { op: "screenshot", taskId: id },
      { op: "close", taskId: id },
    ]) {
      expect(BrowserRequest.safeParse(r).success, JSON.stringify(r)).toBe(true);
    }
  });

  it("has no way to send or receive cookies, headers, storage, credentials, scripts or free selectors", () => {
    for (const extra of [{ cookies: [] }, { headers: { a: "b" } }, { storageState: {} }, { userDataDir: "/x" }, { authorization: "x" }, { evaluate: "1" }, { script: "1" }, { selector: "#pay" }, { xpath: "//a" }]) {
      expect(BrowserRequest.safeParse({ op: "click", taskId: id, ref: "e1", ...extra }).success, JSON.stringify(extra)).toBe(false);
    }
    expect(BrowserRequest.safeParse({ op: "evaluate", taskId: id, expression: "document.cookie" }).success).toBe(false);
    expect(BrowserRequest.safeParse({ op: "click", taskId: id, ref: "#buy-now" }).success).toBe(false);
    expect(BrowserRequest.safeParse({ op: "click", taskId: id, ref: "e1; drop" }).success).toBe(false);
    expect(BrowserRequest.safeParse({ op: "download", taskId: id }).success).toBe(false);
    expect(BrowserRequest.safeParse({ op: "type", taskId: id, ref: "e1", text: "a\u0000b" }).success).toBe(false);
    expect(BrowserRequest.safeParse({ op: "type", taskId: id, ref: "e1", text: "x".repeat(501) }).success).toBe(false);
  });

  it("responses carry page text only flagged as untrusted, never cookies or inline image bytes", () => {
    const ok = { ok: true, taskId: id, url: "https://valta.hexalyte.com/", text: "hi", untrusted: true, elements: [{ ref: "e1", role: "button", name: "Add to cart", actionClass: "reversible" }], screenshotId: "shot_12345678" };
    expect(BrowserResponse.safeParse(ok).success).toBe(true);
    expect(BrowserResponse.safeParse({ ...ok, untrusted: false }).success).toBe(false);
    expect(BrowserResponse.safeParse({ ...ok, cookies: [] }).success).toBe(false);
    expect(BrowserResponse.safeParse({ ...ok, screenshotBase64: "AAAA" }).success).toBe(false);
    expect(BrowserResponse.safeParse({ ok: false, reason: "blocked_redirect" }).success).toBe(true);
    expect(BrowserResponse.safeParse({ ok: false, reason: "because I said so" }).success).toBe(false);
  });

  it("states hard limits, with downloads disabled", () => {
    expect(BROWSER_LIMITS.maxDownloadBytes).toBe(0);
    expect(BROWSER_LIMITS.maxStepsPerTask).toBeLessThanOrEqual(20);
    expect(Object.isFrozen(BROWSER_LIMITS)).toBe(true);
  });
});

describe("model registry", () => {
  it("is valid as shipped", () => expect(() => validateRegistry(MODEL_DESCRIPTORS)).not.toThrow());

  it("matches the live Ollama allow-list: the registered tags of live and Sinhala models are the real ones", () => {
    expect(MODEL_DESCRIPTORS.find((m) => m.id === "qwen3-1.7b")?.tag).toBe(MODELS.qwen);
    expect(MODEL_DESCRIPTORS.find((m) => m.id === "sinhalallm-1.7b")?.tag).toBe(MODELS.sinhala);
  });

  it("records the owner's decisions: Qwen3 1.7B live, Qwen3 4B experimental only, Qwen2.5 3B excluded as non-commercial", () => {
    const by = (id: string) => MODEL_DESCRIPTORS.find((m) => m.id === id)!;
    expect(by("qwen3-1.7b").status).toBe("live");
    expect(by("qwen3-4b-instruct-2507").status).toBe("experimental");
    expect(by("qwen2.5-3b-instruct").status).toBe("excluded");
    expect(by("qwen2.5-3b-instruct").license.verdict).toBe("non-commercial");
    expect(MODEL_DESCRIPTORS.filter((m) => m.status === "live").map((m) => m.id)).toEqual(["qwen3-1.7b"]);
  });

  it("keeps licence evidence on every entry and never marks an estimate as measured without a basis", () => {
    for (const m of MODEL_DESCRIPTORS) {
      expect(m.license.source.length, m.id).toBeGreaterThan(5);
      expect(m.license.checkedOn, m.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(["measured", "estimate", "model-card"]).toContain(m.memoryMb.basis);
    }
  });

  const base: ModelDescriptor = { ...MODEL_DESCRIPTORS[0]! };
  it.each([
    ["a duplicate tag", [base, { ...base, id: "other" }]],
    ["a non-commercial model that is not excluded", [{ ...base, id: "x", tag: "x:1", license: { ...base.license, verdict: "non-commercial" as const } }]],
    ["a live model with a custom licence", [{ ...base, id: "x", tag: "x:1", license: { ...base.license, verdict: "custom-review-needed" as const } }]],
    ["an experimental model with an unknown licence", [{ ...base, id: "x", tag: "x:1", status: "experimental" as const, license: { ...base.license, verdict: "unknown" as const } }]],
    ["a missing licence source", [{ ...base, license: { ...base.license, source: "" } }]],
    ["an excluded model that still has tasks", [{ ...base, status: "excluded" as const }]],
    ["a remote provider", [{ ...base, provider: "remote" as never }]],
  ])("rejects %s", (_n, models) => expect(() => validateRegistry(models as ModelDescriptor[])).toThrow(RegistryError));

  it("selects only live models, prefers the loaded one, and returns null when nothing fits (no paid fallback exists)", () => {
    expect(selectModel("chat", { availableMemoryMb: 2500, queueDepth: 0 })?.modelId).toBe("qwen3-1.7b");
    expect(selectModel("chat", { availableMemoryMb: 800, queueDepth: 0 })).toBeNull();
    // Experimental and excluded models are never chosen, even when they are loaded and fit.
    expect(selectModel("general_answer", { availableMemoryMb: 20000, loadedModelId: "qwen3-4b-instruct-2507", queueDepth: 0 })).toBeNull();
    expect(selectModel("rewrite_sinhala", { availableMemoryMb: 20000, queueDepth: 0 })).toBeNull();
    expect(selectModel("chat", { availableMemoryMb: 20000, loadedModelId: "qwen2.5-3b-instruct", queueDepth: 0 })?.modelId).toBe("qwen3-1.7b");
  });

  it("requires the exact installed tag", () => {
    const m = MODEL_DESCRIPTORS.find((x) => x.id === "qwen3-1.7b")!;
    expect(installedTagMatches(m, [MODELS.qwen, "other:1"])).toBe(true);
    expect(installedTagMatches(m, ["qwen3:1.7b"])).toBe(false);
  });
});
