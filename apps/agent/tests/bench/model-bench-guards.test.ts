import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MODELS } from "../../src/ollama/models";
import { startFakeOllama, type FakeOllama } from "../fake-ollama/server";
import { BenchRefusal, runModelBench, type HostProbe } from "./bench-core";
import { HOLDOUT } from "./m3b/holdout";

/**
 * The real-model benchmark runs next to a LIVE service, so its protections are tested here against a fake Ollama:
 * it must never evict the live model, never trigger a cold load by accident, never download, stop when the host is short of
 * memory or busy, pace itself, and send exactly the options the live Agent sends.
 */
const PRO = { freeMb: () => 3000, load1: () => 0.2, cpuTimes: () => null, ollamaRssMb: () => null, oomKills: () => null, swapUsedMb: () => null } as const satisfies HostProbe;
const probe = (over: Partial<HostProbe> = {}): HostProbe => ({ ...PRO, ...over });
const SMALL = HOLDOUT.slice(0, 6);
const QWEN4B = "qwen3:4b-instruct-2507";

let fake: FakeOllama;
beforeAll(async () => {
  fake = await startFakeOllama({ models: [MODELS.qwen, QWEN4B, "gemma3:4b"] });
  fake.setResponder(() => ({ content: "hi" }));
});
afterAll(async () => fake.close());

const load = async (model: string) => {
  await fetch(`${fake.url}/api/chat`, { method: "POST", body: JSON.stringify({ model, messages: [{ role: "user", content: "x" }], stream: false }) });
};

describe("never disturbs the live service", () => {
  it("refuses a different model while the live one is loaded (it would evict it), and sends nothing", async () => {
    await load(MODELS.qwen);
    const before = fake.requests.length;
    await expect(runModelBench({ baseUrl: fake.url, tag: QWEN4B, cases: SMALL, probe: probe() })).rejects.toThrow(/evict/);
    expect(fake.requests.length).toBe(before);
    expect(fake.loaded()).toBe(MODELS.qwen);
  });

  it("runs against the model that is already loaded without needing a cold load, and leaves it loaded", async () => {
    await load(MODELS.qwen);
    const r = await runModelBench({ baseUrl: fake.url, tag: MODELS.qwen, cases: SMALL, probe: probe() });
    expect(r.completed).toBe(SMALL.length);
    expect(r.verification.loadedBefore).toEqual([MODELS.qwen]);
    expect(r.verification.wouldEvictAnotherModel).toBe(false);
    expect(fake.loaded()).toBe(MODELS.qwen);
  });

  it("refuses to start a cold load unless explicitly allowed (nothing loaded means a load would hit the live path)", async () => {
    await fetch(`${fake.url}/api/chat`, { method: "POST", body: JSON.stringify({ model: MODELS.qwen, messages: [], keep_alive: 0, stream: false }) });
    expect(fake.loaded()).toBeNull();
    const before = fake.requests.length;
    await expect(runModelBench({ baseUrl: fake.url, tag: MODELS.qwen, cases: SMALL, probe: probe() })).rejects.toThrow(/cold load/);
    expect(fake.requests.length).toBe(before);
    const ok = await runModelBench({ baseUrl: fake.url, tag: MODELS.qwen, cases: SMALL, probe: probe(), allowColdLoad: true });
    expect(ok.completed).toBe(SMALL.length);
  });

  it("a dry run verifies the installed model and the host and sends no chat request at all", async () => {
    fake.requests.length = 0;
    const r = await runModelBench({ baseUrl: fake.url, tag: MODELS.qwen, cases: SMALL, probe: probe(), dryRun: true });
    expect(r.dryRun).toBe(true);
    expect(r.completed).toBe(0);
    expect(fake.requests).toHaveLength(0);
    expect(r.verification.installed).toBe(true);
  });

  it("never downloads: a model that is not installed is refused, and an excluded or unknown one never gets that far", async () => {
    await expect(runModelBench({ baseUrl: fake.url, tag: MODELS.sinhala, cases: SMALL, probe: probe(), allowColdLoad: true })).rejects.toThrow(/not installed/);
    await expect(runModelBench({ baseUrl: fake.url, tag: "gemma3:4b", cases: SMALL, probe: probe(), allowColdLoad: true })).rejects.toThrow(/excluded/);
    await expect(runModelBench({ baseUrl: fake.url, tag: "qwen2.5:3b-instruct", cases: SMALL, probe: probe(), allowColdLoad: true })).rejects.toThrow(BenchRefusal);
    expect(fake.requests.every((q) => q.path === "/api/chat")).toBe(true); // only chat requests reached the model, none to pull or delete
  });

  it("sends the same options as the live Agent: fixed context, no keep_alive, no extra model parameters", async () => {
    await load(MODELS.qwen);
    fake.bodies.length = 0;
    await runModelBench({ baseUrl: fake.url, tag: MODELS.qwen, cases: SMALL.slice(0, 2), probe: probe() });
    for (const b of fake.bodies) {
      expect((b.options as Record<string, unknown>).num_ctx).toBe(2048);
      expect(Object.keys(b.options as object).sort()).toEqual(["num_ctx", "num_predict", "temperature"]);
      expect("keep_alive" in b).toBe(false);
      expect(b.stream).toBe(false);
    }
  });
});

describe("a short run still covers the whole set", () => {
  it("--limit takes evenly spaced messages, so every language group appears", async () => {
    await load(MODELS.qwen);
    const r = await runModelBench({ baseUrl: fake.url, tag: MODELS.qwen, cases: HOLDOUT, limit: 12, probe: probe() });
    expect(r.completed).toBe(12);
    for (const g of ["si", "singlish", "en", "mixed"] as const) expect(r.perGroup[g].n, g).toBeGreaterThan(0);
    const none = await runModelBench({ baseUrl: fake.url, tag: MODELS.qwen, cases: HOLDOUT, limit: 0, probe: probe() });
    expect(none.completed).toBe(0);
  });
});

describe("protects the host while it runs", () => {
  it("stops cleanly, keeping what it measured, when free memory falls below the limit", async () => {
    await load(MODELS.qwen);
    let calls = 0;
    const r = await runModelBench({ baseUrl: fake.url, tag: MODELS.qwen, cases: HOLDOUT.slice(0, 10), probe: probe({ freeMb: () => (++calls > 4 ? 300 : 2000) }), minFreeMb: 400 });
    expect(r.aborted).toEqual({ reason: "low_memory" });
    expect(r.completed).toBeGreaterThan(0);
    expect(r.completed).toBeLessThan(10);
    expect(r.resources.hostFreeMbMin).toBe(300);
  });

  it("stops when the load average is too high (the live Agent shares these CPUs)", async () => {
    await load(MODELS.qwen);
    const r = await runModelBench({ baseUrl: fake.url, tag: MODELS.qwen, cases: SMALL, probe: probe({ load1: () => 5 }), maxLoad1: 3 });
    expect(r.aborted).toEqual({ reason: "high_load" });
    expect(r.safety.requestsSent).toBe(0);
  });

  it("stops at the time limit", async () => {
    await load(MODELS.qwen);
    const r = await runModelBench({ baseUrl: fake.url, tag: MODELS.qwen, cases: SMALL, probe: probe(), maxSeconds: -1 });
    expect(r.aborted).toEqual({ reason: "time_limit" });
    expect(r.completed).toBe(0);
  });

  it("pauses between requests (one fewer pause than requests) so live traffic can be served", async () => {
    await load(MODELS.qwen);
    const pauses: number[] = [];
    const r = await runModelBench({ baseUrl: fake.url, tag: MODELS.qwen, cases: SMALL, probe: probe(), pauseMs: 3000, sleep: async (ms) => void pauses.push(ms) });
    expect(pauses).toEqual(Array(SMALL.length - 1).fill(3000));
    expect(r.safety.pauseMs).toBe(3000);
  });

  it("measures CPU per request, memory minimum, resident model memory, load and OOM kills from the probe", async () => {
    await load(MODELS.qwen);
    let t = 0;
    let oom = 7;
    const r = await runModelBench({
      baseUrl: fake.url,
      tag: MODELS.qwen,
      cases: SMALL.slice(0, 3),
      probe: probe({ cpuTimes: () => ({ busy: (t += 50), total: t * 2 }), freeMb: () => 1800, load1: () => 1.4, ollamaRssMb: () => 1500, oomKills: () => oom, swapUsedMb: () => 12 }),
    });
    expect(r.resources.cpuBusyPctMedianPerRequest).toBe(50);
    expect(r.resources.hostFreeMbMin).toBe(1800);
    expect(r.resources.ollamaProcessesRssMbMax).toBe(1500);
    expect(r.resources.swapUsedMbMax).toBe(12);
    expect(r.resources.load1Max).toBe(1.4);
    expect(r.resources.modelResidentMbAfterFirstCall).toBe(1144);
    expect(r.resources.oomKillsDuringRun).toBe(0);
    oom = 9;
    expect(r.basis).toBe("measured");
  });
});

describe("only talks to a local Ollama", () => {
  it("refuses a remote address", async () => {
    await expect(runModelBench({ baseUrl: "https://example.com", tag: MODELS.qwen, probe: probe() })).rejects.toThrow(/local/);
    await expect(runModelBench({ baseUrl: "http://10.1.2.3:11434", tag: MODELS.qwen, probe: probe() })).rejects.toThrow(/local/);
  });
});
