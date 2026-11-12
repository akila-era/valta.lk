/**
 * M1-E performance harness (option B in the M1 plan): bundled into ONE file, copied to /tmp on the AI server, run with
 * /opt/node/current/bin/node, then deleted. It installs nothing, changes no configuration and only talks to 127.0.0.1:11434 (the
 * local Ollama). MOCK data only: the ERP is the in-memory fixture, so tool latency here excludes any real ERP network time.
 *
 * Usage: node m1e-bench.mjs <phase> [out.json]
 * Phases: router | qwen | sinhala | switch | full | concurrent | queue50 | saturation | timeout
 *
 * One inference slot is used throughout (the scheduler's rule); no phase ever sends concurrent model generations to Ollama.
 */
import { writeFileSync } from "node:fs";
import { signRequest } from "../../src/auth/hmac";
import { loadConfig } from "../../src/config";
import { createAgentServer } from "../../src/http/server";
import { Metrics, type MetricsSnapshot } from "../../src/observability/metrics";
import { OllamaClient, type GenerateResult, type OllamaLike } from "../../src/ollama/client";
import { MODELS, type GenerateRequest, type ModelKey } from "../../src/ollama/models";
import { EnglishPlanner, buildContextBlock, SYSTEM_PROMPT } from "../../src/pipeline/english-planner";
import { SinhalaPolisher } from "../../src/pipeline/polisher";
import { InferenceScheduler, JobAbortedError, JobDeadlineError, QueueFullError, type JobEvent } from "../../src/queue/scheduler";
import { routeMessage } from "../../src/router/router";
import { checkSafety } from "../../src/router/safety";
import { allSinhalaTemplates } from "../../src/router/templates";
import { normalizeMatch } from "../../src/router/normalize";
import { FixtureErpTransport, itemId } from "../../src/mock/erp-fixture";
import { createMockStack } from "../../src/mock/stack";
import { toOllamaTools } from "../../src/tools/definitions";
import { runToolCalls } from "../../src/tools/runner";
import { ENGLISH_CASES } from "../eval/english-prompts";
import { SET_A, SET_B, SET_C } from "../eval/sinhala-sets";
import { UNSAFE } from "../eval/safety-pack";

const OLLAMA = "http://127.0.0.1:11434";
const phase = process.argv[2] ?? "router";
const outFile = process.argv[3];
const SECRET = "b".repeat(40);

// ---------------------------------------------------------------- helpers
const ms = (t0: bigint) => Number(process.hrtime.bigint() - t0) / 1e6;
const now = () => process.hrtime.bigint();
const sleep = (n: number) => new Promise((r) => setTimeout(r, n));

export function pct(values: number[]) {
  const s = [...values].sort((a, b) => a - b);
  const q = (p: number) => (s.length === 0 ? 0 : s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]!);
  const sum = s.reduce((a, b) => a + b, 0);
  return { n: s.length, min: round(s[0] ?? 0), p50: round(q(50)), p95: round(q(95)), p99: round(q(99)), max: round(s[s.length - 1] ?? 0), mean: round(s.length ? sum / s.length : 0) };
}
const round = (n: number) => Math.round(n * 100) / 100;
const log = (o: Record<string, unknown>) => process.stdout.write(`${JSON.stringify(o)}\n`);
const results: Record<string, unknown> = { phase, startedAt: new Date().toISOString(), node: process.version };
const rss = () => Math.round(process.memoryUsage().rss / 1048576);

/** Records every generation's own timings (Ollama's load time, token counts and speed) next to the caller's wall time. */
class RecordingOllama implements OllamaLike {
  readonly gens: (GenerateResult & { model: ModelKey; wallMs: number })[] = [];
  constructor(private readonly inner: OllamaClient) {}
  version(s?: AbortSignal) {
    return this.inner.version(s);
  }
  loadedModels(s?: AbortSignal) {
    return this.inner.loadedModels(s);
  }
  unload(m: ModelKey, s?: AbortSignal) {
    return this.inner.unload(m, s);
  }
  async generate(req: GenerateRequest, opts?: { signal?: AbortSignal }) {
    const t0 = now();
    const r = await this.inner.generate(req, opts);
    this.gens.push({ ...r, model: req.model, wallMs: ms(t0) });
    return r;
  }
}

const client = new OllamaClient({ baseUrl: OLLAMA, requestTimeoutMs: 120_000 });
const rec = new RecordingOllama(client);

async function unloadAll(): Promise<void> {
  for (const m of ["qwen", "sinhala"] as ModelKey[]) await client.unload(m).catch(() => undefined);
  for (let i = 0; i < 20 && (await client.loadedModels()).length > 0; i++) await sleep(250);
}

/** Polls /api/ps and records each change of the loaded model, with a timestamp (model loading and unloading). */
function watchLoaded(): { stop(): { t: number; loaded: string[] }[] } {
  const events: { t: number; loaded: string[] }[] = [];
  let last = "";
  const t0 = Date.now();
  const timer = setInterval(async () => {
    try {
      const l = await client.loadedModels();
      const k = l.join("|");
      if (k !== last) {
        last = k;
        events.push({ t: Date.now() - t0, loaded: l.map((x) => (x === MODELS.qwen ? "qwen" : x === MODELS.sinhala ? "sinhala" : x)) });
      }
    } catch {
      /* ignore */
    }
  }, 400);
  return { stop: () => (clearInterval(timer), events) };
}

const mock = () => createMockStack({ transport: new FixtureErpTransport() });
const QWEN_PROMPTS = ENGLISH_CASES.filter((c) => ["search", "details", "compare", "stock", "accessories", "cart"].includes(c.tag)).map((c) => c.text);
const ABSTAIN = ["something nice for my mother", "recommend something for gaming", "mid range something good", "I need a gift for my brother", "what would you suggest for a student", "help me choose a present for my dad", "my budget is small, what is best", "something good for travelling"];
const SINHALA_TEXTS = [...SET_A, ...SET_B, ...SET_C].map((c) => c.text).filter((t) => /[඀-෿]/.test(t));
const ENGLISH_KNOWN = ["Show me phones under 150000 rupees", "Tell me about the Orbit Pro", "Compare Nova X1 and Orbit Pro", "Is the Atlas Smartwatch in stock?", "What accessories fit the Zen Book 14?", "any phones on sale?", "show me laptops", "cheapest phone please"];

// ---------------------------------------------------------------- planners and jobs used by several phases
function qwenRequest(text: string): GenerateRequest {
  const s = mock();
  return {
    model: "qwen",
    purpose: "tool",
    temperature: 0.1,
    tools: toOllamaTools(s.registry, "guest"),
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildContextBlock({ candidates: [{ id: itemId(1), name: "Nova X1 Smartphone" }], page: "unknown", cartCount: 0 }) },
      { role: "user", content: text },
    ],
  };
}
const polishPrompt = (t: string) => `පහත වාක්‍ය එකම තේරුමින්, වඩා ස්වභාවික සිංහලෙන් නැවත ලියන්න. අලුත් තොරතුරු, අංක හෝ නම් එකතු නොකරන්න.\n\n${t}`;
const sinhalaRequest = (t: string): GenerateRequest => ({ model: "sinhala", purpose: "reply", messages: [{ role: "user", content: polishPrompt(t) }], temperature: 0.3, topP: 0.9, minP: 0.1, repeatPenalty: 1.15 });
const POLISHABLE = Object.values(allSinhalaTemplates()).filter((t) => t.length < 200);

// ---------------------------------------------------------------- phases
async function phaseRouter() {
  const stack = mock();
  const vocab = await stack.catalogue.vocabulary();
  const corpus = [...ENGLISH_CASES.map((c) => c.text), ...SINHALA_TEXTS, ...UNSAFE.map((u) => u.text)];
  const route: number[] = [];
  const safety: number[] = [];
  for (let round = 0; round < 25; round++) {
    for (const text of corpus) {
      const t0 = now();
      checkSafety(text);
      safety.push(ms(t0));
      const t1 = now();
      routeMessage({ matchText: normalizeMatch(text), rawText: text, vocab, context: { lastShownProductIds: [], cart: [] } });
      route.push(ms(t1));
    }
  }
  results.safetyFilterMs = pct(safety);
  results.routerMs = pct(route);
  results.routerMessages = corpus.length;

  // The whole pipeline without a model (router-first): safety, routing, tools on the mock backend, cards, verifier, template.
  const { run } = await import("../fixtures/pipeline-helpers");
  const pipe: number[] = [];
  for (let round = 0; round < 12; round++) for (const text of ENGLISH_KNOWN) {
    const t0 = now();
    await run(stack.pipeline, text, { customer: round % 2 === 0 });
    pipe.push(ms(t0));
  }
  results.pipelineNoModelMs = pct(pipe);

  // Tool execution alone, per tool, on the in-memory mock backend (no ERP network).
  const ctx = { actor: { kind: "guest" as const }, requestId: "r", signal: new AbortController().signal, cart: [{ productId: itemId(3), variantKey: "", quantity: 1 }] };
  const calls: [string, Record<string, unknown>][] = [
    ["search_products", { category: "mobile-phones", inStockOnly: false, limit: 5 }],
    ["get_product_details", { productId: itemId(16) }],
    ["compare_products", { productIds: [itemId(16), itemId(18), itemId(8), itemId(1)] }],
    ["check_stock", { productId: itemId(8), quantity: 2 }],
    ["get_accessories", { productId: itemId(16) }],
    ["get_cart", {}],
    ["add_to_cart", { productId: itemId(2), quantity: 1 }],
  ];
  const perTool: Record<string, ReturnType<typeof pct>> = {};
  for (const [name, args] of calls) {
    const samples: number[] = [];
    for (let i = 0; i < 300; i++) {
      const t0 = now();
      await runToolCalls(stack.registry, [{ name, arguments: args }], ctx);
      samples.push(ms(t0));
    }
    perTool[name] = pct(samples);
  }
  results.toolMs = perTool;
  results.rssMb = rss();
}

async function phaseQwen() {
  const scheduler = new InferenceScheduler({ maxQueued: 4 });
  const planner = new EnglishPlanner({ ollama: rec, scheduler, registry: mock().registry });
  const watch = watchLoaded();
  await unloadAll();
  const plan = async (text: string) => {
    const t0 = now();
    const out = await planner.plan({ message: text, actor: "guest", priority: "guest", deadlineAt: Date.now() + 120_000, signal: new AbortController().signal, candidates: [{ id: itemId(1), name: "Nova X1 Smartphone" }], cartCount: 0 });
    return { wall: ms(t0), out };
  };
  const cold = await plan(QWEN_PROMPTS[0]!);
  results.coldStartMs = round(cold.wall);
  results.coldLoadMsReportedByOllama = round(rec.gens[0]?.loadMs ?? 0);
  const warm: number[] = [];
  const attempts: number[] = [];
  let noTool = 0;
  let invalid = 0;
  for (const text of QWEN_PROMPTS.slice(1, 31)) {
    const r = await plan(text);
    warm.push(r.wall);
    attempts.push(r.out.attempts);
    if (r.out.noTool) noTool++;
    if (r.out.invalid) invalid++;
  }
  results.warmPlannerMs = pct(warm);
  const g = rec.gens.filter((x) => x.model === "qwen");
  results.modelCallMs = pct(g.map((x) => x.wallMs));
  results.tokensPerSecond = pct(g.map((x) => x.tokensPerSecond ?? 0).filter((x) => x > 0));
  results.promptTokens = pct(g.map((x) => x.promptTokens));
  results.generatedTokens = pct(g.map((x) => x.generatedTokens));
  results.modelCalls = g.length;
  results.secondAttemptRate = round(attempts.filter((a) => a === 2).length / attempts.length);
  results.noTool = noTool;
  results.invalidAfterRetry = invalid;
  results.loadedTimeline = watch.stop();
  results.rssMb = rss();
}

async function phaseSinhala() {
  const scheduler = new InferenceScheduler({ maxQueued: 4 });
  const polisher = new SinhalaPolisher({ ollama: rec, scheduler });
  const watch = watchLoaded();
  await unloadAll();
  const polish = async (text: string) => {
    const t0 = now();
    const r = await polisher.polish(text, { priority: "guest", deadlineAt: Date.now() + 120_000, signal: new AbortController().signal });
    return { wall: ms(t0), r };
  };
  const cold = await polish(POLISHABLE[0]!);
  results.coldStartMs = round(cold.wall);
  results.coldLoadMsReportedByOllama = round(rec.gens[0]?.loadMs ?? 0);
  const warm: number[] = [];
  const reasons: Record<string, number> = {};
  let accepted = 0;
  for (let i = 0; i < 16; i++) {
    const r = await polish(POLISHABLE[(i + 1) % POLISHABLE.length]!);
    warm.push(r.wall);
    if (r.r.polished) accepted++;
    else reasons[r.r.reason ?? "?"] = (reasons[r.r.reason ?? "?"] ?? 0) + 1;
  }
  results.warmPolishMs = pct(warm);
  const g = rec.gens.filter((x) => x.model === "sinhala");
  results.modelCallMs = pct(g.map((x) => x.wallMs));
  results.tokensPerSecond = pct(g.map((x) => x.tokensPerSecond ?? 0).filter((x) => x > 0));
  results.generatedTokens = pct(g.map((x) => x.generatedTokens));
  results.polishAccepted = `${accepted}/16`;
  results.polishRejectedReasons = reasons;
  results.loadedTimeline = watch.stop();
  results.rssMb = rss();
}

async function phaseSwitch() {
  const scheduler = new InferenceScheduler({ maxQueued: 4 });
  const watch = watchLoaded();
  await unloadAll();
  const job = async (model: ModelKey, req: GenerateRequest) => {
    const t0 = now();
    await scheduler.submit({ model, priority: "guest", deadlineAt: Date.now() + 120_000, run: ({ signal }) => rec.generate(req, { signal }) });
    return ms(t0);
  };
  const q = qwenRequest(QWEN_PROMPTS[3]!);
  const s = sinhalaRequest(POLISHABLE[1]!);
  results.coldQwenMs = round(await job("qwen", q));
  const warmQ: number[] = [];
  const warmS: number[] = [];
  const toSinhala: number[] = [];
  const toQwen: number[] = [];
  const loadQ: number[] = [];
  const loadS: number[] = [];
  for (let i = 0; i < 6; i++) {
    toSinhala.push(await job("sinhala", s));
    loadS.push(rec.gens[rec.gens.length - 1]!.loadMs);
    warmS.push(await job("sinhala", s));
    toQwen.push(await job("qwen", q));
    loadQ.push(rec.gens[rec.gens.length - 1]!.loadMs);
    warmQ.push(await job("qwen", q));
  }
  results.switchToSinhalaMs = pct(toSinhala);
  results.switchToQwenMs = pct(toQwen);
  results.warmSinhalaMs = pct(warmS);
  results.warmQwenMs = pct(warmQ);
  results.ollamaLoadMsToSinhala = pct(loadS);
  results.ollamaLoadMsToQwen = pct(loadQ);
  results.switchOverheadSinhalaMs = round(pct(toSinhala).p50 - pct(warmS).p50);
  results.switchOverheadQwenMs = round(pct(toQwen).p50 - pct(warmQ).p50);
  results.schedulerSwitches = scheduler.state().switches;
  results.loadedTimeline = watch.stop();
  results.rssMb = rss();
}

/** An Agent server on 127.0.0.1 (an ephemeral loopback port, closed at the end) in front of the real Ollama and the mock backend. */
async function startAgent(opts: { polish?: boolean; env?: Record<string, string>; maxQueued?: number } = {}) {
  const metrics = new Metrics();
  const scheduler = new InferenceScheduler({ maxQueued: opts.maxQueued ?? 6, observer: (e) => metrics.job(e) });
  const base = mock();
  const planner = new EnglishPlanner({ ollama: client, scheduler, registry: base.registry });
  const polisher = opts.polish ? new SinhalaPolisher({ ollama: client, scheduler }) : undefined;
  const stack = createMockStack({ transport: base.transport, planner, englishMode: "router-first", ...(polisher ? { polisher } : {}), metrics, onVerifierFailure: (f) => metrics.verifierRejected(f.code) });
  const config = loadConfig({ AGENT_HMAC_KEYS: `k1:${SECRET}`, AGENT_PORT: "0", AI_ASSISTANT_ENABLED: "true", AGENT_RATE_IP_PER_MIN: "1000", AGENT_RATE_SESSION_PER_MIN: "1000", AGENT_RATE_IDENTITY_PER_MIN: "1000", AGENT_NEW_SESSIONS_PER_HOUR: "200", AGENT_MAX_CONCURRENT_PER_IDENTITY: "20", AGENT_DEADLINE_MS: "60000", ...(opts.env ?? {}) });
  const app = createAgentServer({ config, pipeline: stack.pipeline, ollama: client, scheduler, metrics });
  const { port } = await app.listen();
  const url = `http://127.0.0.1:${port}`;
  let n = 0;
  const send = async (message: string, sessionN?: number) => {
    const sessionId = `sess_bench_${String(sessionN ?? ++n).padStart(10, "0")}`;
    const body = JSON.stringify({ sessionId, message, contractVersion: "1.1" });
    const ip = `198.51.100.${(n % 200) + 1}`;
    const t0 = now();
    const res = await fetch(`${url}/v1/chat`, { method: "POST", headers: { "content-type": "application/json", ...signRequest({ keyId: "k1", secret: SECRET, method: "POST", path: "/v1/chat", identity: { kind: "guest" }, clientIp: ip, body }) }, body });
    const json = (await res.json()) as { meta?: { model: string | null; degraded: boolean; queuedMs: number }; error?: { code: string } };
    return { status: res.status, wall: ms(t0), model: json.meta?.model ?? null, degraded: json.meta?.degraded ?? false, queuedMs: json.meta?.queuedMs ?? 0, code: json.error?.code };
  };
  const health = async () => {
    const t0 = now();
    const res = await fetch(`${url}/v1/health`, { headers: signRequest({ keyId: "k1", secret: SECRET, method: "GET", path: "/v1/health", identity: { kind: "guest" }, clientIp: "198.51.100.250" }) });
    return { ok: res.status === 200, wall: ms(t0) };
  };
  const snapshot = async (): Promise<MetricsSnapshot> => {
    const res = await fetch(`${url}/v1/metrics`, { headers: signRequest({ keyId: "k1", secret: SECRET, method: "GET", path: "/v1/metrics", identity: { kind: "guest" }, clientIp: "198.51.100.250" }) });
    return (await res.json()) as MetricsSnapshot;
  };
  return { app, send, health, snapshot, scheduler, metrics };
}

async function phaseFull() {
  const watch = watchLoaded();
  await unloadAll();
  const a = await startAgent();
  const classes: Record<string, number[]> = { router_only: [], qwen_used: [], sinhala_router: [], degraded: [] };
  const statuses: Record<string, number> = {};
  const plan: string[] = [];
  for (let i = 0; i < 60; i++) {
    const m = i % 10;
    plan.push(m < 5 ? ENGLISH_KNOWN[i % ENGLISH_KNOWN.length]! : m < 7 ? ABSTAIN[i % ABSTAIN.length]! : m < 9 ? SINHALA_TEXTS[(i * 7) % SINHALA_TEXTS.length]! : ENGLISH_KNOWN[(i + 3) % ENGLISH_KNOWN.length]!);
  }
  const all: number[] = [];
  for (const text of plan) {
    const r = await a.send(text);
    statuses[r.status] = (statuses[r.status] ?? 0) + 1;
    all.push(r.wall);
    const sinhala = /[඀-෿]/.test(text);
    if (r.degraded) classes.degraded!.push(r.wall);
    else if (r.model) classes.qwen_used!.push(r.wall);
    else if (sinhala) classes.sinhala_router!.push(r.wall);
    else classes.router_only!.push(r.wall);
  }
  results.requests = plan.length;
  results.statuses = statuses;
  results.allMs = pct(all);
  results.byClassMs = Object.fromEntries(Object.entries(classes).map(([k, v]) => [k, pct(v)]));
  results.metrics = await a.snapshot();
  await a.app.close();
  results.loadedTimeline = watch.stop();
  results.rssMb = rss();
}

async function phaseFullPolish() {
  await unloadAll();
  const a = await startAgent({ polish: true });
  const lat: number[] = [];
  const models: Record<string, number> = {};
  const seq = [...ABSTAIN.slice(0, 3), SINHALA_TEXTS[0]!, ABSTAIN[3]!, SINHALA_TEXTS[1]!, SINHALA_TEXTS[2]!, ABSTAIN[4]!, SINHALA_TEXTS[3]!, "ආයුබෝවන්", "ස්තූතියි", "Hello"];
  for (const text of seq) {
    const r = await a.send(text);
    lat.push(r.wall);
    models[String(r.model)] = (models[String(r.model)] ?? 0) + 1;
  }
  results.requests = seq.length;
  results.allMs = pct(lat);
  results.modelUsed = models;
  results.metrics = await a.snapshot();
  await a.app.close();
}

async function phaseConcurrent() {
  await unloadAll();
  const a = await startAgent({ maxQueued: 6 });
  await a.send(ABSTAIN[0]!); // load Qwen once, so groups measure queueing rather than the cold start
  const rounds: Record<string, unknown> = {};
  let healthFails = 0;
  const healthMs: number[] = [];
  const poller = setInterval(async () => {
    try {
      const h = await a.health();
      healthMs.push(h.wall);
      if (!h.ok) healthFails++;
    } catch {
      healthFails++;
    }
  }, 1000);
  for (const size of [2, 3, 4]) {
    const walls: number[] = [];
    const queued: number[] = [];
    const statuses: Record<string, number> = {};
    for (let round = 0; round < 3; round++) {
      const rs = await Promise.all(Array.from({ length: size }, (_, i) => a.send(ABSTAIN[(round * size + i) % ABSTAIN.length]!)));
      for (const r of rs) {
        walls.push(r.wall);
        queued.push(r.queuedMs);
        statuses[r.status] = (statuses[r.status] ?? 0) + 1;
      }
    }
    rounds[`group_of_${size}`] = { requests: walls.length, statuses, latencyMs: pct(walls), queueWaitReportedMs: pct(queued) };
  }
  clearInterval(poller);
  results.groups = rounds;
  results.healthDuringLoad = { polls: healthMs.length, failures: healthFails, latencyMs: pct(healthMs) };
  results.metrics = await a.snapshot();
  await a.app.close();
  results.rssMb = rss();
}

async function phaseQueue50() {
  await unloadAll();
  const events: JobEvent[] = [];
  const scheduler = new InferenceScheduler({ maxQueued: 50, observer: (e) => events.push(e) });
  const watch = watchLoaded();
  const rejected: number[] = [];
  const ok: number[] = [];
  const outcomes: Record<string, number> = {};
  const t0 = now();
  const jobs: Promise<void>[] = [];
  let submitted = 0;
  for (let i = 0; i < 50; i++) {
    const useSinhala = i % 3 === 2; // about a third of the jobs need the other model
    const model: ModelKey = useSinhala ? "sinhala" : "qwen";
    const req = useSinhala ? sinhalaRequest(POLISHABLE[i % POLISHABLE.length]!) : qwenRequest(QWEN_PROMPTS[i % QWEN_PROMPTS.length]!);
    const enq = now();
    submitted++;
    jobs.push(
      scheduler
        .submit({ model, priority: i % 5 === 0 ? "customer" : "guest", deadlineAt: Date.now() + 20 * 60_000, run: ({ signal }) => rec.generate(req, { signal }) })
        .then(() => {
          ok.push(ms(enq));
          outcomes.ok = (outcomes.ok ?? 0) + 1;
        })
        .catch((e) => {
          const k = e instanceof QueueFullError ? "queue_full" : e instanceof JobDeadlineError ? "deadline" : e instanceof JobAbortedError ? "aborted" : "error";
          outcomes[k] = (outcomes[k] ?? 0) + 1;
          rejected.push(ms(enq));
        }),
    );
  }
  const depthAtSubmit = scheduler.state().depth;
  await Promise.all(jobs);
  const wall = ms(t0);
  results.jobs = submitted;
  results.outcomes = outcomes;
  results.queueDepthAfterSubmitting = depthAtSubmit;
  results.wallSeconds = round(wall / 1000);
  results.throughputJobsPerMinute = round((outcomes.ok ?? 0) / (wall / 60_000));
  results.timeInSystemMs = pct(ok);
  results.queueWaitMs = pct(events.map((e) => e.queuedMs));
  results.runMs = pct(events.map((e) => e.runMs));
  results.runMsQwen = pct(events.filter((e) => e.model === "qwen").map((e) => e.runMs));
  results.runMsSinhala = pct(events.filter((e) => e.model === "sinhala").map((e) => e.runMs));
  results.runMsAfterSwitch = pct(events.filter((e) => e.switched).map((e) => e.runMs));
  results.schedulerState = scheduler.state();
  results.switches = scheduler.state().switches;
  results.maxConcurrentModelCalls = 1;
  results.loadedTimeline = watch.stop();
  results.rssMb = rss();
}

async function phaseSaturation() {
  await unloadAll();
  const scheduler = new InferenceScheduler({ maxQueued: 6 });
  const accepted: Promise<unknown>[] = [];
  const rejectMs: number[] = [];
  let rejected = 0;
  const retryAfter: number[] = [];
  for (let i = 0; i < 30; i++) {
    const t0 = now();
    const req = qwenRequest(QWEN_PROMPTS[i % QWEN_PROMPTS.length]!);
    const p = scheduler.submit({ model: "qwen", priority: "guest", deadlineAt: Date.now() + 15 * 60_000, run: ({ signal }) => rec.generate(req, { signal }) });
    accepted.push(
      p.catch((e) => {
        if (e instanceof QueueFullError) {
          rejected++;
          rejectMs.push(ms(t0));
          retryAfter.push(e.retryAfterSec);
        }
      }),
    );
  }
  await Promise.all(accepted);
  results.submitted = 30;
  results.rejected = rejected;
  results.completed = scheduler.state().completed;
  results.rejectionLatencyMs = pct(rejectMs);
  results.retryAfterSec = pct(retryAfter);
  results.schedulerState = scheduler.state();
  results.rssMb = rss();
}

async function phaseTimeout() {
  await unloadAll();
  const scheduler = new InferenceScheduler({ maxQueued: 6 });
  const submit = (text: string, deadlineMs: number, signal?: AbortSignal) => scheduler.submit({ model: "qwen", priority: "guest", deadlineAt: Date.now() + deadlineMs, ...(signal ? { signal } : {}), run: ({ signal: s }) => rec.generate(qwenRequest(text), { signal: s }) });
  const timed = async <T>(p: Promise<T>) => {
    const t0 = now();
    const out = await p.then(() => "ok", (e: Error) => e.name);
    return { out, ms: round(ms(t0)) };
  };
  // warm Qwen and measure what a normal request costs
  const warm: number[] = [];
  for (let i = 0; i < 3; i++) warm.push((await timed(submit(QWEN_PROMPTS[i]!, 120_000))).ms);
  results.warmMs = pct(warm);
  const next = async (label: string) => {
    const t = await timed(submit(QWEN_PROMPTS[5]!, 120_000));
    results[`nextAfter_${label}`] = t;
  };
  // 1. running deadline: the model call is cancelled when the deadline passes
  results.runningDeadline800ms = await timed(submit(QWEN_PROMPTS[6]!, 800));
  await next("runningDeadline");
  // 2. cancellation of a running job
  const ac = new AbortController();
  const running = timed(submit(QWEN_PROMPTS[7]!, 120_000, ac.signal));
  await sleep(800);
  const abortAt = now();
  ac.abort();
  results.cancelRunning = { ...(await running), abortToSettledMs: round(ms(abortAt)) };
  await next("cancelRunning");
  // 3. a queued job whose deadline passes before it can start, and a queued job that is cancelled
  const blocker = timed(submit(QWEN_PROMPTS[8]!, 120_000));
  await sleep(100);
  const expiring = timed(submit(QWEN_PROMPTS[9]!, 500));
  const ac2 = new AbortController();
  const cancelled = timed(submit(QWEN_PROMPTS[10]!, 120_000, ac2.signal));
  await sleep(200);
  ac2.abort();
  results.queuedDeadline500ms = await expiring;
  results.queuedCancelled = await cancelled;
  results.blockerCompleted = await blocker;
  results.schedulerState = scheduler.state();
  results.slotFreeAtEnd = scheduler.state().running === null && scheduler.state().depth === 0;
  results.rssMb = rss();
}

const PHASES: Record<string, () => Promise<void>> = { router: phaseRouter, qwen: phaseQwen, sinhala: phaseSinhala, switch: phaseSwitch, full: phaseFull, fullpolish: phaseFullPolish, concurrent: phaseConcurrent, queue50: phaseQueue50, saturation: phaseSaturation, timeout: phaseTimeout };

const run = PHASES[phase];
if (!run) {
  process.stderr.write(`unknown phase ${phase}\n`);
  process.exit(2);
}
const t0 = now();
run()
  .then(() => {
    results.durationSeconds = round(ms(t0) / 1000);
    log(results);
    if (outFile) writeFileSync(outFile, JSON.stringify(results, null, 1));
    process.exit(0);
  })
  .catch((e) => {
    process.stderr.write(`phase ${phase} failed: ${(e as Error).message}\n`);
    results.error = (e as Error).message;
    if (outFile) writeFileSync(outFile, JSON.stringify(results, null, 1));
    process.exit(1);
  });
