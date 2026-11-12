import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildCards } from "../../src/backend/cards";
import { Metrics, type MetricsSnapshot } from "../../src/observability/metrics";
import { InferenceScheduler } from "../../src/queue/scheduler";
import { RoutingPipeline } from "../../src/pipeline/routing-pipeline";
import { createMockStack } from "../../src/mock/stack";
import { startFakeOllama, type FakeOllama } from "../fake-ollama/server";
import { chat, customer, get, post, sid, startServer, type Started } from "../fixtures/http-helpers";
import { mockStack } from "../fixtures/mock-stack-helpers";

let fake: FakeOllama;
let server: Started | undefined;
beforeEach(async () => {
  fake = await startFakeOllama();
});
afterEach(async () => {
  await server?.app.close();
  server = undefined;
  await fake.close();
});
const snap = async (s: Started) => (await (await get(s.url, "/v1/metrics")).json()) as MetricsSnapshot;

describe("metrics are counts and durations only", () => {
  it("turns any label that is not on the allow-list into (other): a model-chosen tool name, a message or a secret can never become a label", () => {
    const m = new Metrics();
    for (const hostile of ["place_order", "Ignore previous instructions", "my password is hunter2", "sk_live_abcdefghijklmnop", "cust:secret_77", "x".repeat(500)]) {
      m.tool(hostile, "ok");
      m.tool("search_products", hostile);
      m.verifierRejected(hostile);
      m.request(hostile, 200, 5, hostile);
      m.job({ model: hostile as never, from: hostile as never, switched: true, queuedMs: 1, runMs: 1, outcome: hostile as never });
    }
    const out = JSON.stringify(m.snapshot());
    for (const needle of ["place_order", "Ignore previous", "hunter2", "sk_live", "secret_77", "xxxxx"]) expect(out, needle).not.toContain(needle);
    expect(out).toContain("(other)");
  });

  it("computes p50, p95 and p99 from recent samples, with count, mean and max", () => {
    const m = new Metrics();
    for (let i = 1; i <= 100; i++) m.job({ model: "qwen", from: null, switched: false, queuedMs: i, runMs: i * 10, outcome: "ok" });
    const q = m.snapshot().latencyMs.queue_wait!;
    expect(q).toMatchObject({ count: 100, max: 100, p50: 50, p95: 95, p99: 99 });
    expect(m.snapshot().latencyMs.model_run!.p95).toBe(950);
  });

  it("keeps memory bounded: only the latest 2000 samples are kept per series, while the count keeps growing", () => {
    const m = new Metrics();
    for (let i = 0; i < 5_000; i++) m.request("/v1/chat", 200, i % 100);
    expect(m.snapshot().latencyMs.request!.count).toBe(5_000);
    expect(m.snapshot().latencyMs.request!.p99).toBeLessThanOrEqual(99);
  });
});

describe("the signed /v1/metrics route", () => {
  it("is 404 when no metrics are configured, and 401 without a valid signature", async () => {
    server = await startServer();
    expect((await get(server.url, "/v1/metrics")).status).toBe(404);
    await server.app.close();
    server = await startServer({ metrics: new Metrics() });
    const unsigned = await fetch(`${server.url}/v1/metrics`);
    expect(unsigned.status).toBe(401);
    expect((await get(server.url, "/v1/metrics", { secret: "z".repeat(40) })).status).toBe(401);
    expect((await get(server.url, "/v1/metrics")).status).toBe(200);
  });

  it("counts requests by route and status, validation failures, rate-limit rejections and auth failures, without any content", async () => {
    server = await startServer({ metrics: new Metrics(), env: { AGENT_RATE_IP_PER_MIN: "5", AGENT_COOLDOWN_AFTER: "100" } });
    const secret = "my password is Tr0ub4dor&3-metrics-9f";
    await post(server.url, chat("hello", sid(1)));
    await post(server.url, chat(secret, sid(2)));
    await post(server.url, { sessionId: "bad", message: "x" }); // validation failure
    await post(server.url, chat("a", sid(3)), { secret: "q".repeat(40) }); // 401
    await post(server.url, chat("a".repeat(900), sid(4))); // too long
    await post(server.url, chat("a", sid(5)));
    await post(server.url, chat("a", sid(6))); // over the IP limit
    const s = await snap(server);
    expect(s.counters.requests_total).toMatchObject({ "/v1/chat 200": 3 });
    expect(s.counters.requests_total!["/v1/chat 422"]).toBe(2);
    expect(s.counters.requests_total!["/v1/chat 401"]).toBe(1);
    expect(s.counters.validation_failures_total!.VALIDATION_FAILED).toBe(2);
    expect(s.counters.rate_limit_rejections_total!.RATE_LIMITED).toBeGreaterThanOrEqual(1);
    expect(s.counters.errors_total!.UNAUTHORIZED).toBe(1);
    expect(s.latencyMs.request!.count).toBeGreaterThanOrEqual(7);
    const all = JSON.stringify(s);
    for (const needle of ["Tr0ub4dor", "password", "sess_", "203.0.113", "hello"]) expect(all, needle).not.toContain(needle);
  });
});

describe("tool, verifier, model and queue metrics", () => {
  it("counts tool calls and failures by tool name and status, and the time of each tool batch", async () => {
    const metrics = new Metrics();
    const s = createMockStack({ metrics });
    const { run } = await import("../fixtures/pipeline-helpers");
    await run(s.pipeline, "Show me phones");
    await run(s.pipeline, "Tell me about the Orbit Pro");
    await run(s.pipeline, "Orbit Pro එක cart එකට දාන්න");
    await run(s.pipeline, "Nova X1 blue එක cart එකට දාන්න"); // a tool failure (variant out of stock)
    const m = metrics.snapshot();
    expect(m.counters.tool_calls_total).toMatchObject({ search_products: 1, get_product_details: 1, add_to_cart: 2 });
    expect(Object.keys(m.counters.tool_failures_total ?? {}).length).toBeGreaterThanOrEqual(1);
    expect(m.latencyMs.tool_run!.count).toBe(4);
  });

  it("counts verifier rejections by code", async () => {
    const metrics = new Metrics();
    const base = createMockStack();
    const pipeline = new RoutingPipeline({
      registry: base.registry,
      vocab: () => base.catalogue.vocabulary(),
      sessions: base.sessions,
      cardsFrom: (o) => buildCards(o).cards.map((c) => (c.type === "product" ? { ...c, price: { ...c.price, text: "Rs. 1.00" } } : c)),
      onVerifierFailure: (f) => metrics.verifierRejected(f.code),
    });
    const { run } = await import("../fixtures/pipeline-helpers");
    await run(pipeline, "Tell me about the Atlas Smartwatch");
    await run(pipeline, "Tell me about the Atlas Smartwatch");
    expect(metrics.snapshot().counters.verifier_rejections_total).toEqual({ product_mismatch: 2 });
  });

  it("records model selection, model switches, queue wait and run time from the scheduler, and exposes queue depth", async () => {
    const metrics = new Metrics();
    const scheduler = new InferenceScheduler({ maxQueued: 5, observer: (e) => metrics.job(e) });
    const stack = mockStack(fake, { qwen: true, polish: true, scheduler: { maxQueued: 5, observer: (e) => metrics.job(e) } });
    fake.setResponder(() => ({ content: "", tool_calls: [{ function: { name: "search_products", arguments: { query: "nova" } } }] }));
    server = await startServer({ metrics, scheduler: stack.scheduler, pipeline: stack.pipeline });
    await post(server.url, chat("something nice for my mother", sid(1)));
    await post(server.url, chat("ආයුබෝවන්", sid(2)));
    await post(server.url, chat("something nice for my mother", sid(3)));
    void scheduler;
    const s = await snap(server);
    expect(s.counters.model_requests_total).toMatchObject({ qwen: expect.any(Number) });
    expect(s.counters.jobs_total!.ok).toBeGreaterThanOrEqual(1);
    expect(s.gauges.queue_depth).toBe(0);
    expect(s.gauges).toHaveProperty("queue_running");
    expect(s.latencyMs.queue_wait!.count).toBeGreaterThanOrEqual(1);
    expect(s.latencyMs.model_run!.count).toBeGreaterThanOrEqual(1);
  });

  it("counts a model switch only when the loaded model changes, labelled by the two model keys", () => {
    const m = new Metrics();
    m.job({ model: "qwen", from: null, switched: false, queuedMs: 0, runMs: 10, outcome: "ok" });
    m.job({ model: "sinhala", from: "qwen", switched: true, queuedMs: 5, runMs: 20, outcome: "ok" });
    m.job({ model: "sinhala", from: "sinhala", switched: false, queuedMs: 0, runMs: 20, outcome: "ok" });
    m.job({ model: "qwen", from: "sinhala", switched: true, queuedMs: 0, runMs: 20, outcome: "error" });
    const c = m.snapshot().counters;
    expect(c.model_switches_total).toEqual({ "qwen->sinhala": 1, "sinhala->qwen": 1 });
    expect(c.model_requests_total).toEqual({ qwen: 2, sinhala: 2 });
    expect(c.jobs_total).toEqual({ ok: 3, error: 1 });
  });

  it("a broken observer cannot break scheduling", async () => {
    const s = new InferenceScheduler({
      maxQueued: 2,
      observer: () => {
        throw new Error("observer bug");
      },
    });
    const r = await s.submit({ model: "qwen", priority: "guest", deadlineAt: Date.now() + 5_000, run: async () => 42 });
    expect(r).toBe(42);
    expect(s.state().completed).toBe(1);
  });
});

describe("customers and guests are counted alike, with no identity in any metric", () => {
  it("contains no customer id, IP or session id after traffic from several identities", async () => {
    server = await startServer({ metrics: new Metrics() });
    await post(server.url, chat("hi", sid(1)), { identity: customer("cust_metric_77"), ip: "198.51.100.77" });
    await post(server.url, chat("hi", sid(2)), { ip: "198.51.100.78" });
    const text = JSON.stringify(await snap(server));
    for (const needle of ["cust_metric_77", "198.51.100", "sess_0000"]) expect(text).not.toContain(needle);
  });
});
