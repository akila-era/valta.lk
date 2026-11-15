import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCards } from "../../src/backend/cards";
import type { ToolResult } from "../../src/backend/types";
import { cardForVersion } from "../../src/contract/compat";
import { Card, ChatRequest, CONTRACT_VERSION } from "../../src/contract/schemas";
import { specFacts } from "../../src/reasoning/facts";
import { mergeProfile, emptyReasoning } from "../../src/reasoning/profile";
import { nextQuestion } from "../../src/reasoning/questions";
import { rankProducts } from "../../src/reasoning/ranking";
import { extractUsages } from "../../src/reasoning/usage";
import { createMockStack } from "../../src/mock/stack";
import { renderTemplate } from "../../src/router/templates";
import { verifyResponse } from "../../src/verify/verifier";
import { DEV_SET } from "../bench/m5-reasoning/dev-set";
import { EVAL } from "../bench/m5-reasoning/eval-set";
import { METRICS, runAll, summarise } from "../bench/m5-reasoning/evaluate";
import { run } from "../fixtures/pipeline-helpers";
import { RichTransport, richSite } from "../fixtures/rich-catalogue";

const rich = () => createMockStack({ transport: new RichTransport(), site: richSite(), catalogueTtlMs: 0 });
const viewsOf = async () => (await rich().catalogue.listing("guest")).filter((v) => v.available);
const textOf = (k: Parameters<typeof renderTemplate>[0], l: "en" | "si" = "en") => renderTemplate(k, l).text;

describe("what the shopper wants: usage and facts", () => {
  it("reads usages in English, Singlish and Sinhala", () => {
    expect(extractUsages("I want a phone with a good camera")).toEqual(["camera"]);
    expect(extractUsages("game gahanna laptop ekak")).toEqual(["gaming"]);
    expect(extractUsages("කැමරාව හොඳ phone එකක්")).toEqual(["camera"]);
    expect(extractUsages("battery eka hondai")).toEqual(["battery"]);
    expect(extractUsages("show me phones")).toEqual([]);
  });

  it("reads camera, battery and memory from specification rows first, then the description, and never invents a number", async () => {
    const byName = new Map((await viewsOf()).map((v) => [v.name, v]));
    expect(specFacts(byName.get("Lumen P2 Pro Smartphone")!)).toMatchObject({ cameraMp: 108, batteryMah: 5000, memoryGb: 8, source: { cameraMp: "spec" } });
    expect(specFacts(byName.get("Orbit A7 Camera Edition Smartphone")!)).toMatchObject({ cameraMp: 108, batteryMah: 4500, memoryGb: 8, source: { cameraMp: "description" } });
    const none = specFacts(byName.get("Zenix Z5 Smartphone")!);
    expect(none.cameraMp).toBeUndefined();
    expect(none.batteryMah).toBeUndefined();
  });

  it("a new category or search word starts a new topic; a budget or usage within a topic is kept", () => {
    const a = mergeProfile({ usage: [] }, { category: "mobile-phones", budgetMaxLkr: 100000, usage: ["camera"] }).profile;
    const same = mergeProfile(a, { category: "mobile-phones", brand: "Lumen" });
    expect(same.reset).toBe(false);
    expect(same.profile).toMatchObject({ budgetMaxLkr: 100000, usage: ["camera"], brand: "Lumen" });
    const next = mergeProfile(a, { category: "laptops" });
    expect(next.reset).toBe(true);
    expect(next.profile).toEqual({ category: "laptops", usage: [] });
  });
});

describe("recommendations", () => {
  it("rank for the shopper, never promote a product for being expensive, and say why in codes", async () => {
    const phones = (await viewsOf()).filter((v) => v.category?.slug === "mobile-phones");
    // The search already filters by budget, so the ranking sees what the tool returns.
    const inBudget = phones.filter((v) => (v.saleCents ?? v.priceCents) <= 15000000);
    const { ranked } = rankProducts(inBudget, { usage: ["camera"], budgetMaxLkr: 150000 });
    expect(ranked[0]!.product.name).toBe("Lumen P2 Pro Smartphone"); // 108 MP at 94,900 beats the equal 108 MP at 112,000
    expect(ranked[0]!.fit.reasons).toContain("best_camera");
    const all = rankProducts(phones, { usage: ["camera"], budgetMaxLkr: 150000 }).ranked;
    expect(all.find((r) => r.product.name.startsWith("Lumen P3"))!.fit.tradeoffs).toContain("over_budget");
    const cheap = rankProducts(phones, { usage: [] }).ranked;
    expect(cheap[0]!.product.name).toBe("Kite K1 Smartphone"); // with nothing stated, the cheapest leads, not the dearest
  });

  it("says plainly when no product lists the number the shopper cares about", async () => {
    const plain = (await viewsOf()).filter((v) => v.category?.slug === "accessories");
    const { summary, ranked } = rankProducts(plain, { usage: ["camera"] });
    expect(summary.metricsWithoutData).toEqual(["cameraMp"]);
    expect(ranked.every((r) => r.fit.tradeoffs.includes("no_camera_data"))).toBe(true);
  });

  it("asks one question at a time, never twice, never when three or fewer products match, never to someone who asked for the cheapest", () => {
    const st = emptyReasoning();
    const ctx = { kind: "phone" as const, matches: 10, brandsInResults: 5, hasProductContext: false };
    expect(nextQuestion(st, { usage: [] }, ctx)).toBe("budget");
    st.asked.push("budget");
    expect(nextQuestion(st, { usage: [] }, ctx)).toBe("usage");
    st.asked.push("usage");
    st.questionsInARow = 2;
    expect(nextQuestion(st, { usage: [] }, ctx)).toBeNull(); // two questions in a row is the limit
    st.questionsInARow = 0;
    expect(nextQuestion(st, { usage: [] }, ctx)).toBe("brand");
    expect(nextQuestion(emptyReasoning(), { usage: [] }, { ...ctx, matches: 3 })).toBeNull();
    expect(nextQuestion(emptyReasoning(), { usage: ["camera"], budgetMaxLkr: 1000 }, { ...ctx, brandsInResults: 2 })).toBeNull();
    expect(nextQuestion(emptyReasoning(), { usage: [] }, { ...ctx, kind: "accessory" })).toBe("device");
    expect(nextQuestion(emptyReasoning(), { usage: [] }, { ...ctx, kind: "accessory", hasProductContext: true })).toBeNull();
  });

  it("the reply is a fixed intro, then at most one fixed question, and cards carry fit codes only when the shopper stated something", async () => {
    const s = rich();
    const bare = (await run(s.pipeline, "show me phones")).result;
    expect(bare.reply.text).toBe(`${textOf("tools_ran")}\n\n${textOf("ask_budget")}`);
    expect(bare.cards.every((c) => c.type !== "product" || c.fit === undefined)).toBe(true);
    const stated = (await run(rich().pipeline, "phone with good camera under 100000")).result;
    expect(stated.reply.text.startsWith(textOf("recommend_intro"))).toBe(true);
    expect(stated.cards[0]).toMatchObject({ type: "product", name: "Lumen P2 Pro Smartphone", fit: { reasons: expect.arrayContaining(["best_camera", "within_budget"]) } });
  });

  it("with no camera numbers anywhere in the catalogue data it says so instead of ranking", async () => {
    const r = (await run(rich().pipeline, "I need a charger with a good camera")).result;
    expect(r.reply.text.startsWith(textOf("recommend_limited_data")) || r.cards.length === 0).toBe(true);
  });
});

describe("the contract and the verifier", () => {
  it("is contract 1.3 (adds only the optional browser panel), and a client older than 1.2 never receives fit", async () => {
    expect(CONTRACT_VERSION).toBe("1.3");
    const withFit = (await run(rich().pipeline, "phone with good camera under 100000")).result.cards[0]!;
    expect(Card.safeParse(withFit).success).toBe(true);
    expect((withFit as { fit?: unknown }).fit).toBeDefined();
    for (const v of ["1", "1.1"] as const) expect((cardForVersion(withFit, v) as { fit?: unknown }).fit, v).toBeUndefined();
    expect((cardForVersion(withFit, "1.2") as { fit?: unknown }).fit).toBeDefined();
    expect(ChatRequest.safeParse({ sessionId: "sess_0123456789abcdef", message: "hi", contractVersion: "1.2" }).success).toBe(true);
  });

  it("the verifier recomputes every fit claim: a changed claim is refused", async () => {
    const views = (await viewsOf()).filter((v) => v.category?.slug === "mobile-phones");
    const profile = { usage: ["camera" as const], budgetMaxLkr: 150000 };
    const { ranked } = rankProducts(views, profile);
    const top = ranked.slice(0, 3);
    const data: ToolResult = { kind: "search", total: views.length, items: top.map((r) => r.product) };
    const outcomes = [{ tool: "search_products", status: "ok" as const, data: views.length ? ({ ...data, items: views } as ToolResult) : data }];
    const cards = buildCards([{ tool: "search_products", status: "ok", data }]).cards.map((c) => (c.type === "product" ? { ...c, fit: top.find((r) => r.product.id === c.id)!.fit } : c));
    const input = {
      actor: "guest" as const,
      outcomes,
      cards,
      actions: [],
      reply: { text: textOf("recommend_intro"), source: "template" },
      templateKey: "recommend_intro" as const,
      tplLang: "en" as const,
      language: "en" as const,
      needsNativeReview: false,
      fitContext: { profile, candidateIds: views.map((v) => v.id) },
    };
    expect(verifyResponse(input)).toEqual({ ok: true });
    const forged = cards.map((c, i) => (i === 0 && c.type === "product" ? { ...c, fit: { reasons: ["best_battery" as const, "lowest_price" as const], tradeoffs: [] } } : c));
    expect(verifyResponse({ ...input, cards: forged })).toMatchObject({ ok: false, code: "product_mismatch" });
    expect(verifyResponse({ ...input, fitContext: undefined })).toMatchObject({ ok: false });
    // A reply that is two templates is accepted only when it is exactly those two.
    const two = { ...input, reply: { text: `${textOf("recommend_intro")}\n\n${textOf("ask_budget")}`, source: "template" }, templateKeys: ["recommend_intro" as const, "ask_budget" as const] };
    expect(verifyResponse(two)).toEqual({ ok: true });
    expect(verifyResponse({ ...two, reply: { text: `${textOf("recommend_intro")}\n\nWhat is your budget in rupees?`, source: "template" } })).toMatchObject({ ok: false });
  });
});

describe("the multi-turn customer benchmark", () => {
  it("has at least 150 scenarios across Sinhala, Singlish, English and mixed language", () => {
    const all = [...DEV_SET, ...EVAL];
    expect(all.length).toBeGreaterThanOrEqual(150);
    for (const l of ["si", "singlish", "en", "mixed"] as const) expect(all.filter((s) => s.lang === l).length, l).toBeGreaterThanOrEqual(10);
    expect(all.filter((s) => s.turns.length >= 2).length).toBeGreaterThanOrEqual(40);
    expect(new Set(all.map((s) => s.id)).size).toBe(all.length);
  });

  it("DEV (tuned on): every metric at least 90%, and zero hallucinations", async () => {
    const rep = summarise(await runAll(DEV_SET));
    for (const m of METRICS) expect(rep[m].pct, `${m} ${rep[m].passed}/${rep[m].applicable}`).toBeGreaterThanOrEqual(90);
    expect(rep.hallucination.passed).toBe(rep.hallucination.applicable);
  });

  it("EVAL (never tuned on): regression floor of 85% on every metric, and zero hallucinations", async () => {
    const rep = summarise(await runAll(EVAL));
    for (const m of METRICS) expect(rep[m].pct, `${m} ${rep[m].passed}/${rep[m].applicable}`).toBeGreaterThanOrEqual(85);
    expect(rep.hallucination.passed).toBe(rep.hallucination.applicable);
  });

  it("EVAL has not changed since it was frozen", () => {
    const dir = join(__dirname, "..", "bench", "m5-reasoning");
    const recorded = JSON.parse(readFileSync(join(dir, "frozen-hashes.json"), "utf8")) as { files: Record<string, string> };
    const hash = createHash("sha256").update(readFileSync(join(dir, "eval-set.ts"), "utf8").replace(/\r\n/g, "\n")).digest("hex");
    expect(hash, "eval-set.ts is frozen: change it only as a documented correction and update frozen-hashes.json in the same commit").toBe(recorded.files["eval-set.ts"]);
  });
});
