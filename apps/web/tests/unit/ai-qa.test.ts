import { describe, expect, it } from "vitest";
import { deriveCapabilities, totalsOf } from "@/lib/ai-qa/capabilities";
import { qaEnabled } from "@/lib/ai-qa/flags";
import { SCENARIOS, evaluate, type QaResponse } from "@/lib/ai-qa/scenarios";
import { STATUSES, type ProbeSnapshot, type ScenarioResult } from "@/lib/ai-qa/types";

const probe = (over: Partial<ProbeSnapshot> = {}): ProbeSnapshot => ({ agent: { reachable: true, ready: true, ollamaReachable: false, loadedModel: null }, voice: { transcribeRoute: false, speakRoute: false }, demoData: true, checkedAt: "2026-11-13T00:00:00Z", ...over });
const res = (id: string, group: ScenarioResult["group"], verdict: ScenarioResult["verdict"], mockData = true): ScenarioResult => ({ id, group, prompt: id, verdict, mockData, latencyMs: verdict === "skipped" ? null : 100, failures: verdict === "fail" ? ["x"] : [], replyText: "", cardNames: [], actionTypes: [], ranAt: "2026-11-13T00:00:00Z" });
const cap = (caps: ReturnType<typeof deriveCapabilities>, id: string) => caps.find((c) => c.id === id)!;

describe("the QA control center is development only", () => {
  it("is on only when AI_QA_ENABLED is exactly true and the build is not production", () => {
    expect(qaEnabled({ NODE_ENV: "development", AI_QA_ENABLED: "true" })).toBe(true);
    expect(qaEnabled({ NODE_ENV: "test", AI_QA_ENABLED: " true " })).toBe(true);
    expect(qaEnabled({ NODE_ENV: "production", AI_QA_ENABLED: "true" })).toBe(false); // a production build never serves it, even with the variable set
    for (const v of [undefined, "", "false", "1", "yes", "TRUE"]) expect(qaEnabled({ NODE_ENV: "development", AI_QA_ENABLED: v }), String(v)).toBe(false);
  });
});

describe("capability statuses come from real probes and results, never from hope", () => {
  it("uses only the six defined statuses", () => {
    for (const c of deriveCapabilities(probe(), [res("a", "en", "pass")])) expect(STATUSES).toContain(c.status);
  });

  it("nothing is Working with no test results, and without a model chat is Not connected", () => {
    const caps = deriveCapabilities(probe());
    expect(caps.filter((c) => c.status === "working")).toEqual([]);
    expect(cap(caps, "general_chat").status).toBe("not_connected");
    for (const id of ["sinhala", "singlish", "english", "memory"]) expect(cap(caps, id).status, id).toBe("not_tested");
  });

  it("shopping capabilities stay Mock only while demo data is on, even if every scenario passes", () => {
    const rs = [res("a", "shopping", "pass"), res("b", "en", "pass")];
    for (const id of ["shopping", "search", "compare"]) expect(cap(deriveCapabilities(probe({ demoData: true }), rs), id).status, id).toBe("mock");
  });

  it("shopping can only be Working against a real catalogue, and only when everything passed", () => {
    const pass = [res("a", "shopping", "pass", false)];
    expect(cap(deriveCapabilities(probe({ demoData: false }), pass), "search").status).toBe("working");
    expect(cap(deriveCapabilities(probe({ demoData: false }), [...pass, res("b", "shopping", "fail", false)]), "search").status).toBe("limited");
    expect(cap(deriveCapabilities(probe({ demoData: false })), "search").status).toBe("not_tested");
  });

  it("Sinhala and Singlish are capped at Limited however well they score; English reaches Working only with a real model, a real catalogue and enough scenarios", () => {
    const good = (g: ScenarioResult["group"], n = 10) => Array.from({ length: n }, (_, i) => res(`${g}${i}`, g, "pass", false));
    const real = probe({ demoData: false, agent: { reachable: true, ready: true, ollamaReachable: true, loadedModel: "qwen3:1.7b-q4_K_M" } });
    const caps = deriveCapabilities(real, [...good("si"), ...good("singlish"), ...good("en")]);
    expect(cap(caps, "sinhala").status).toBe("limited");
    expect(cap(caps, "singlish").status).toBe("limited");
    expect(cap(caps, "english").status).toBe("working");
    // each missing ingredient alone keeps it below Working
    expect(cap(deriveCapabilities(probe({ ...real, demoData: true }), good("en")), "english").status).toBe("limited"); // mock catalogue
    expect(cap(deriveCapabilities(probe({ demoData: false }), good("en")), "english").status).toBe("limited"); // no model connected
    expect(cap(deriveCapabilities(real, good("en", 3)), "english").status).toBe("limited"); // too few scenarios
    expect(cap(deriveCapabilities(probe(), good("en", 3)), "english").reason).toContain("Not Working");
    expect(cap(deriveCapabilities(probe(), [res("x", "en", "fail"), res("y", "en", "fail")]), "english").status).toBe("failed");
  });

  it("an unreachable Agent makes the dependent capabilities Failed, not Working or Not tested", () => {
    const caps = deriveCapabilities(probe({ agent: { reachable: false, error: "unreachable" } }), [res("a", "en", "pass")]);
    for (const id of ["general_chat", "sinhala", "singlish", "english", "shopping"]) expect(cap(caps, id).status, id).toBe("failed");
  });

  it("a loaded model makes chat Limited with real-model evidence, never Working", () => {
    const c = cap(deriveCapabilities(probe({ agent: { reachable: true, ready: true, ollamaReachable: true, loadedModel: "qwen3:1.7b-q4_K_M" } })), "general_chat");
    expect(c.status).toBe("limited");
    expect(c.evidence).toContain("real_model");
    expect(c.reason).toContain("qwen3:1.7b-q4_K_M");
  });

  it("browser is Mock only, RAG, image and document are Not connected, and voice depends on a real route", () => {
    const caps = deriveCapabilities(probe());
    expect(cap(caps, "browser").status).toBe("mock");
    expect(cap(caps, "browser").evidence).not.toContain("real_browser");
    for (const id of ["rag", "image", "document", "stt", "tts"]) expect(cap(caps, id).status, id).toBe("not_connected");
    const withRoutes = deriveCapabilities(probe({ voice: { transcribeRoute: true, speakRoute: true } }));
    expect(cap(withRoutes, "stt").status).toBe("not_tested"); // a route that exists is not a working service
    expect(cap(withRoutes, "tts").status).toBe("not_tested");
    expect(cap(withRoutes, "stt").evidence).not.toContain("real_voice");
  });

  it("memory is Limited when the follow-up scenarios pass and Failed when they do not", () => {
    expect(cap(deriveCapabilities(probe(), [res("c1", "context", "pass"), res("c2", "context", "pass")]), "memory").status).toBe("limited");
    expect(cap(deriveCapabilities(probe(), [res("c1", "context", "pass"), res("c2", "context", "fail")]), "memory").status).toBe("failed");
    // memory does not depend on a model being ready: an Agent that is up but not ready (no model) still gets a verdict
    expect(cap(deriveCapabilities(probe({ agent: { reachable: true, ready: false } }), [res("c1", "context", "pass")]), "memory").status).toBe("limited");
  });

  it("totals never count a mock-catalogue result as a real integration test, and skipped runs count as neither", () => {
    const t = totalsOf([res("a", "en", "pass", true), res("b", "en", "fail", true), res("c", "en", "pass", false), res("d", "en", "skipped", true)]);
    expect(t).toMatchObject({ total: 4, passed: 2, failed: 1, skipped: 1, mockOnly: 2, realIntegration: 1, avgLatencyMs: 100 });
    expect(totalsOf([]).avgLatencyMs).toBeNull();
  });
});

describe("scenarios", () => {
  it("have unique ids, cover every group and include the owner's example prompts", () => {
    expect(new Set(SCENARIOS.map((s) => s.id)).size).toBe(SCENARIOS.length);
    for (const g of ["en", "singlish", "si", "mixed", "shopping", "general", "safety", "context"]) expect(SCENARIOS.some((s) => s.group === g), g).toBe(true);
    const all = SCENARIOS.flatMap((s) => s.prompts);
    for (const p of ["Find me a phone under Rs. 150,000", "Mata Rs. 100,000 ta adu phone ekak hoyala denna", "256GB storage thiyena phone ekak one", "Open Google and search for this product.", "Can you explain what RAM does?"]) expect(all, p).toContain(p);
  });

  const reply = (over: Partial<QaResponse> = {}): QaResponse => ({ language: "en", reply: { text: "Here is what I found." }, needsNativeReview: false, cards: [], actions: [], suggestions: [], ...over });
  const product = (name: string, amount: number) => ({ type: "product", name, price: { amount } });

  it("check price limits from the returned price", () => {
    expect(evaluate({ cards: "some", maxPriceRs: 100000 }, reply({ cards: [product("A", 64900), product("B", 99999)] }))).toEqual([]);
    const f = evaluate({ cards: "some", maxPriceRs: 100000 }, reply({ cards: [product("A", 64900), product("Nova X1", 129900)] }));
    expect(f).toHaveLength(1);
    expect(f[0]).toContain("Nova X1");
  });

  it("catch a shopping tool running for a request that needed none, and invented live facts", () => {
    expect(evaluate({ cards: "none", actions: "none" }, reply({ cards: [product("A", 1)] }))[0]).toContain("expected no cards");
    expect(evaluate({ cards: "none", textExcludesAny: ["pleasant", "forecast"] }, reply({ reply: { text: "The weather today is pleasant." } }))[0]).toContain("pleasant");
    expect(evaluate({ cards: "none", textExcludesAny: ["pleasant"] }, reply({ reply: { text: "I can't check live information." } }))).toEqual([]);
  });

  it("allow a hand-off but forbid a cart change when asked (noCartActions)", () => {
    expect(evaluate({ noCartActions: true }, reply({ actions: [{ type: "navigate" }] }))).toEqual([]);
    expect(evaluate({ noCartActions: true }, reply({ actions: [{ type: "cart.add" }] }))[0]).toContain("cart change was proposed");
  });

  it("check proposals, comparisons, scope statements, language and the native-review flag", () => {
    expect(evaluate({ actionType: "cart.add" }, reply())).toHaveLength(1);
    expect(evaluate({ actionType: "cart.add" }, reply({ actions: [{ type: "cart.add" }] }))).toEqual([]);
    expect(evaluate({ comparisonOf: 2 }, reply({ cards: [{ type: "comparison", products: [{ name: "A" }, { name: "B" }] }] }))).toEqual([]);
    expect(evaluate({ comparisonOf: 2 }, reply({ cards: [{ type: "comparison", products: [{ name: "A" }] }] }))).toHaveLength(1);
    expect(evaluate({ textIncludesAny: ["only help"] }, reply({ reply: { text: "I'm not sure what you'd like." } }))).toHaveLength(1);
    expect(evaluate({ language: "si", nativeReview: true }, reply({ language: "si", needsNativeReview: true }))).toEqual([]);
    expect(evaluate({ nativeReview: true }, reply())).toHaveLength(1);
  });
});
