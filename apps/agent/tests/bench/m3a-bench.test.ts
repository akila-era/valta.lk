import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MODELS } from "../../src/ollama/models";
import { startFakeOllama, type FakeOllama } from "../fake-ollama/server";
import { BenchRefusal, EXPECTED_TOOL, quantile, runModelBench, runRouterBench } from "./bench-core";
import { BENCH_CASES, GROUPS, REVIEW_STATUS } from "./m3-dataset";

/**
 * Router mode runs here for real (deterministic, local). Set M3A_REPORT=<file> to also write the JSON report.
 * Model mode is tested against the FAKE Ollama: this proves the harness, never a model. A real model run is a separate manual step
 * (see docs/AI_M3A_REPORT.md) and must be reported as such.
 */
describe("dataset", () => {
  it("has the four language groups, each with the same spread of task types, and says it is not native-reviewed", () => {
    expect(REVIEW_STATUS).toContain("not native-reviewed");
    const wants = (g: string) => new Set(BENCH_CASES.filter((c) => c.group === g).map((c) => c.want));
    for (const g of GROUPS) {
      const n = BENCH_CASES.filter((c) => c.group === g).length;
      expect(n, g).toBeGreaterThanOrEqual(24);
      for (const w of ["search_products", "get_product_details", "compare_products", "check_stock", "get_accessories", "cart_add", "order_status", "store_info", "smalltalk", "general", "external_site"]) {
        expect(wants(g).has(w as never), `${g} lacks ${w}`).toBe(true);
      }
    }
  });

  it("has no duplicate messages and every label has an expected tool", () => {
    const texts = BENCH_CASES.map((c) => c.text);
    expect(new Set(texts).size).toBe(texts.length);
    for (const c of BENCH_CASES) expect(EXPECTED_TOOL[c.want], c.text).toBeTruthy();
  });

  it("contains the example messages from the product brief", () => {
    const all = new Set(BENCH_CASES.map((c) => c.text));
    for (const t of ["mata hodama phone ekak hoyala denna", "රුපියල් ලක්ෂයකට හොඳ phone එක මොකක්ද?", "Can you recommend a laptop for programming?", "mama kalin balapu phone eke details kiyanna", "මේ දෙකෙන් battery life එක හොඳ මොකක්ද?", "How can I track my order?", "Can you explain what RAM does?", "Write a professional email for me.", "Find the warranty policy on VOLTA.LK.", "Open Google and search for this product."]) {
      expect(all.has(t), t).toBe(true);
    }
  });
});

describe("router mode (measured, local, no model)", () => {
  const report = runRouterBench();

  it("produces per-group numbers that add up", () => {
    expect(report.basis).toBe("measured");
    expect(report.totalCases).toBe(BENCH_CASES.length);
    expect(GROUPS.reduce((s, g) => s + report.perGroup[g].n, 0)).toBe(BENCH_CASES.length);
    for (const g of GROUPS) {
      const s = report.perGroup[g];
      expect(s.supported + s.newCategory).toBe(s.n);
      expect(s.newCategoryNoTool + s.newCategoryRoutedToTool).toBe(s.newCategory);
      expect(s.intentCorrect).toBeLessThanOrEqual(s.supported);
    }
    expect(report.latencyMs.p50).not.toBeNull();
  });

  it("writes the report when asked (and prints the headline numbers so they are visible in the log)", () => {
    const line = (g: string, s: (typeof report)["overall"]) => `${g.padEnd(9)} intent ${s.intentCorrect}/${s.supported} (${s.intentAccuracyPct}%)  abstained ${s.abstained}  new-category routed to a shopping tool ${s.newCategoryRoutedToTool}/${s.newCategory}`;
    console.log(["M3-A router benchmark (MEASURED locally; " + REVIEW_STATUS + ")", ...GROUPS.map((g) => line(g, report.perGroup[g])), line("overall", report.overall), `router latency p50 ${report.latencyMs.p50?.toFixed(2)} ms, p95 ${report.latencyMs.p95?.toFixed(2)} ms`].join("\n"));
    const out = process.env.M3A_REPORT;
    if (out) {
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, JSON.stringify(report, null, 2));
    }
    expect(true).toBe(true);
  });
});

describe("model mode harness (against a FAKE Ollama: proves the harness, not any model)", () => {
  let fake: FakeOllama;
  beforeAll(async () => {
    fake = await startFakeOllama({ models: [MODELS.qwen, "qwen3:4b-instruct-2507", "qwen2.5:3b-instruct", "gemma3:4b"] });
    // A pretend model that always picks search_products for anything containing "phone", else no tool.
    fake.setResponder((b) => {
      const user = String((b.messages as { role: string; content: string }[]).find((m) => m.role === "user")?.content ?? "");
      return /phone|ෆෝන්/i.test(user) ? { content: "", tool_calls: [{ function: { name: "search_products", arguments: {} } }] } : { content: "hello" };
    });
  });
  afterAll(async () => fake.close());

  it("scores tool choice per language group, separates the first (cold) call, and records resident memory and free host memory", async () => {
    let free = 3000;
    const r = await runModelBench({ baseUrl: fake.url, tag: MODELS.qwen, readHostFreeMb: () => (free -= 100) });
    expect(r.basis).toBe("measured");
    expect(r.errors).toBe(0);
    expect(r.totalCases).toBe(BENCH_CASES.length);
    expect(r.registryStatus).toBe("live");
    expect(r.memory.modelResidentMbAfterFirstCall).toBe(1144); // 1.2e9 bytes reported by the fake /api/ps
    expect(r.memory.hostFreeMbBefore).toBe(2900);
    expect(r.memory.hostFreeMbAfter).toBe(2800);
    expect(r.latencyMs.firstCall).not.toBeNull();
    for (const g of GROUPS) expect(r.perGroup[g].n).toBe(BENCH_CASES.filter((c) => c.group === g).length);
    // The pretend model calls search_products for every "phone" message: it is wrong for details/compare/stock cases and for "Open Google ... phone".
    expect(r.rows.some((x) => x.falseTool)).toBe(true);
    expect(r.rows.some((x) => x.toolCorrect && x.expectedTool === "search_products")).toBe(true);
  });

  it("sends the shopping tool list and the fixed context budget, never a cloud model", async () => {
    fake.requests.length = 0;
    await runModelBench({ baseUrl: fake.url, tag: MODELS.qwen, cases: BENCH_CASES.slice(0, 3) });
    expect(fake.requests.length).toBe(3);
    for (const q of fake.requests) {
      expect(q.hasTools).toBe(true);
      expect(q.numCtx).toBe(2048);
      expect(q.model).toBe(MODELS.qwen);
    }
  });

  it("can benchmark an experimental model that is installed", async () => {
    const r = await runModelBench({ baseUrl: fake.url, tag: "qwen3:4b-instruct-2507", cases: BENCH_CASES.slice(0, 2) });
    expect(r.registryStatus).toBe("experimental");
  });

  it("refuses excluded models (non-commercial licence, unapproved terms, too large), unknown tags and models that are not installed", async () => {
    await expect(runModelBench({ baseUrl: fake.url, tag: "qwen2.5:3b-instruct", cases: BENCH_CASES.slice(0, 1) })).rejects.toThrow(/excluded/);
    await expect(runModelBench({ baseUrl: fake.url, tag: "gemma3:4b", cases: BENCH_CASES.slice(0, 1) })).rejects.toThrow(/excluded/);
    await expect(runModelBench({ baseUrl: fake.url, tag: "gpt-oss:20b", cases: BENCH_CASES.slice(0, 1) })).rejects.toThrow(BenchRefusal);
    await expect(runModelBench({ baseUrl: fake.url, tag: "mystery:7b", cases: BENCH_CASES.slice(0, 1) })).rejects.toThrow(/registry/);
    await expect(runModelBench({ baseUrl: fake.url, tag: MODELS.sinhala, cases: BENCH_CASES.slice(0, 1) })).rejects.toThrow(/not installed/);
  });

  it("only talks to a local Ollama", async () => {
    await expect(runModelBench({ baseUrl: "https://example.com", tag: MODELS.qwen })).rejects.toThrow(/local/);
    await expect(runModelBench({ baseUrl: "http://10.0.0.5:11434", tag: MODELS.qwen })).rejects.toThrow(/local/);
  });

  it("counts a failed request as an error, not as a correct answer", async () => {
    fake.setMode("http500");
    await expect(runModelBench({ baseUrl: fake.url, tag: MODELS.qwen, cases: BENCH_CASES.slice(0, 2) })).rejects.toThrow(); // /api/tags itself fails
    fake.setMode("ok");
  });

  it("computes quantiles safely", () => {
    expect(quantile([], 0.5)).toBeNull();
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(3);
    expect(quantile([5], 0.95)).toBe(5);
  });
});
