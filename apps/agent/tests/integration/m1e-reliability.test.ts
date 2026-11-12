import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Metrics, type MetricsSnapshot } from "../../src/observability/metrics";
import { MODELS } from "../../src/ollama/models";
import { AbuseGuard, DEFAULT_RATE_CONFIG, type RateStore } from "../../src/security/rate-limit";
import { startFakeOllama, type FakeOllama } from "../fake-ollama/server";
import { chat, customer, get, GUEST, post, sid, startServer, type Started } from "../fixtures/http-helpers";
import { mockStack, toolCall } from "../fixtures/mock-stack-helpers";

const NEEDS_QWEN = "something nice for my mother"; // the router abstains on it, so in router-first mode Qwen decides
let fake: FakeOllama | undefined;
const servers: Started[] = [];
beforeEach(() => {
  fake = undefined;
});
afterEach(async () => {
  while (servers.length) await servers.pop()!.app.close();
  await fake?.close();
});

async function boot(f: Parameters<typeof startFakeOllama>[0], o: { env?: Record<string, string>; scheduler?: { maxQueued: number }; polish?: boolean } = {}) {
  fake = await startFakeOllama(f);
  fake.setResponder(() => ({ content: "", tool_calls: [toolCall("search_products", { query: "nova" })] }));
  const metrics = new Metrics();
  const stack = mockStack(fake, { qwen: true, mode: "router-first", polish: o.polish, scheduler: { maxQueued: o.scheduler?.maxQueued ?? 5, observer: (e) => metrics.job(e) } });
  const s = await startServer({ pipeline: stack.pipeline, ollama: stack.ollama!, scheduler: stack.scheduler, metrics, env: { AGENT_RATE_IP_PER_MIN: "200", AGENT_RATE_SESSION_PER_MIN: "200", AGENT_MAX_CONCURRENT_PER_IDENTITY: "10", AGENT_RATE_IDENTITY_PER_MIN: "200", AGENT_NEW_SESSIONS_PER_HOUR: "200", ...(o.env ?? {}) } });
  servers.push(s);
  return { s, stack, metrics, fake: fake! };
}
const ask = (s: Started, i: number, message = NEEDS_QWEN, ip = `198.51.100.${(i % 200) + 1}`) => post(s.url, chat(message, sid(i)), { ip });
const settled = async (stack: { scheduler: { state(): { running: unknown; depth: number } } }) => {
  for (let i = 0; i < 40; i++) {
    const st = stack.scheduler.state();
    if (st.running === null && st.depth === 0) return st;
    await new Promise((r) => setTimeout(r, 50));
  }
  return stack.scheduler.state();
};

describe("Ollama unavailable", () => {
  it("answers 503 AI_UNAVAILABLE for a message that needs the model, while deterministic answers keep working, and health says so", async () => {
    const { s, stack } = await boot({});
    expect((await ask(s, 1)).status).toBe(200);
    await fake!.close();
    const down = await ask(s, 2);
    expect(down.status).toBe(503);
    expect(((await down.json()) as { error: { code: string } }).error.code).toBe("AI_UNAVAILABLE");
    expect((await ask(s, 3, "Show me phones")).status).toBe(200); // the router answers without a model
    const h = (await (await get(s.url, "/v1/health")).json()) as { ready: boolean; ollama: { reachable: boolean } };
    expect(h).toMatchObject({ ready: false, ollama: { reachable: false } });
    expect(await settled(stack)).toMatchObject({ running: null, depth: 0 });
    fake = undefined;
  });

  it("recovers by itself when Ollama comes back (no restart needed)", async () => {
    const { s } = await boot({});
    fake!.setMode("http500");
    expect((await ask(s, 1)).status).toBe(502);
    fake!.setMode("ok");
    expect((await ask(s, 2)).status).toBe(200);
  });
});

describe("model unavailable or switching fails", () => {
  it("answers 502 UPSTREAM_ERROR when Qwen is not installed, frees the slot, and keeps serving deterministic answers", async () => {
    const { s, stack, metrics } = await boot({ models: [MODELS.sinhala] });
    const res = await ask(s, 1);
    expect(res.status).toBe(502);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("UPSTREAM_ERROR");
    expect(await settled(stack)).toMatchObject({ running: null, depth: 0 });
    expect((await ask(s, 2, "Show me phones")).status).toBe(200);
    expect(metrics.snapshot().counters.jobs_total).toMatchObject({ error: 1 });
  });

  it("a failed SinhalaLLM request after a Qwen one leaves the shopper with the fixed template and does not poison the queue", async () => {
    const { s, stack } = await boot({}, { polish: true });
    expect((await ask(s, 1)).status).toBe(200); // qwen loaded
    fake!.setMode("http500"); // the switch to SinhalaLLM fails
    const si = await post(s.url, chat("ආයුබෝවන්", sid(2)), { ip: "198.51.100.9" });
    const body = (await si.json()) as { reply: { source: string }; needsNativeReview: boolean };
    expect(si.status).toBe(200);
    expect(body.reply.source).toBe("template");
    expect(body.needsNativeReview).toBe(true);
    fake!.setMode("ok");
    expect((await ask(s, 3)).status).toBe(200);
    expect(await settled(stack)).toMatchObject({ running: null, depth: 0 });
  });

  it("a model switch that outlasts the request deadline ends in 504 TIMEOUT, and the next request is served once the model is loaded", async () => {
    const { s, stack } = await boot({ switchDelayMs: 1_600 }, { env: { AGENT_DEADLINE_MS: "1000" } });
    const t0 = Date.now();
    const res = await ask(s, 1);
    expect(res.status).toBe(504);
    expect(Date.now() - t0).toBeLessThan(2_500);
    await new Promise((r) => setTimeout(r, 1_200)); // the fake finishes "loading" in the background
    expect((await ask(s, 2)).status).toBe(200);
    expect(await settled(stack)).toMatchObject({ running: null, depth: 0 });
  });
});

describe("queue full, timeout and cancellation", () => {
  it("rejects the overflow with 503 QUEUE_FULL and Retry-After while accepted jobs still complete", async () => {
    const { s, stack, metrics } = await boot({ genDelayMs: 500 }, { scheduler: { maxQueued: 1 } });
    const results = await Promise.all([1, 2, 3, 4, 5].map((i) => ask(s, i)));
    const codes = results.map((r) => r.status).sort();
    expect(codes.filter((c) => c === 200).length).toBe(2); // one running, one queued
    expect(codes.filter((c) => c === 503).length).toBe(3);
    const full = results.find((r) => r.status === 503)!;
    expect(Number(full.headers.get("retry-after"))).toBeGreaterThanOrEqual(1);
    expect(await settled(stack)).toMatchObject({ running: null, depth: 0 });
    expect(stack.scheduler.state().rejectedFull).toBe(3);
    expect(metrics.snapshot().counters.errors_total!.QUEUE_FULL).toBe(3);
    expect((await ask(s, 9)).status).toBe(200); // fully recovered
  });

  it("times out a hung model with 504 within the deadline, frees the slot, and serves the next request", async () => {
    const { s, stack } = await boot({}, { env: { AGENT_DEADLINE_MS: "1000" } });
    fake!.setMode("hang");
    const t0 = Date.now();
    const res = await ask(s, 1);
    expect(res.status).toBe(504);
    expect(Date.now() - t0).toBeLessThan(2_500);
    expect(await settled(stack)).toMatchObject({ running: null, depth: 0 });
    fake!.setMode("ok");
    expect((await ask(s, 2)).status).toBe(200);
  });

  it("a client that disconnects mid-request cancels its job: the slot is freed and later requests are served", async () => {
    const { s, stack, metrics } = await boot({ genDelayMs: 2_000 });
    const ac = new AbortController();
    const pending = fetch(`${s.url}/v1/chat`, { method: "POST", signal: ac.signal, headers: { "content-type": "application/json", ...(await signedHeaders(s, chat(NEEDS_QWEN, sid(1)))) }, body: JSON.stringify(chat(NEEDS_QWEN, sid(1))) }).catch(() => "aborted");
    await new Promise((r) => setTimeout(r, 300));
    expect(stack.scheduler.state().running).not.toBeNull();
    ac.abort();
    expect(await pending).toBe("aborted");
    const st = await settled(stack);
    expect(st).toMatchObject({ running: null, depth: 0 });
    expect(metrics.snapshot().counters.jobs_total!.aborted).toBeGreaterThanOrEqual(1);
    fake!.setMode("ok");
    expect((await ask(s, 2, "Show me phones")).status).toBe(200);
  });
});

async function signedHeaders(_s: Started, body: unknown): Promise<Record<string, string>> {
  const { signRequest } = await import("../../src/auth/hmac");
  return signRequest({ keyId: "k1", secret: "s".repeat(40), method: "POST", path: "/v1/chat", identity: GUEST, clientIp: "203.0.113.7", body: JSON.stringify(body) });
}

describe("agent restart: what is lost, and what is not", () => {
  it("forgets rate counters, cooldowns, session bindings and metrics, and keeps no message or session data on disk", async () => {
    const env = { AGENT_RATE_IP_PER_MIN: "2", AGENT_COOLDOWN_AFTER: "1", AGENT_COOLDOWN_SEC: "300" };
    const a = await startServer({ env, metrics: new Metrics() });
    await post(a.url, chat("a", sid(1)), { ip: "203.0.113.50" });
    await post(a.url, chat("a", sid(1)), { ip: "203.0.113.50" });
    expect((await post(a.url, chat("a", sid(1)), { ip: "203.0.113.50" })).status).toBe(429); // limited, and in cooldown
    expect((await post(a.url, chat("a", sid(1)), { ip: "203.0.113.51", identity: customer("c1") })).status).toBe(422); // sid(1) is bound to the guest
    await a.app.close();

    const b = await startServer({ env, metrics: new Metrics() });
    servers.push(b);
    expect((await post(b.url, chat("a", sid(1)), { ip: "203.0.113.50" })).status).toBe(200); // counters and cooldown are gone
    expect((await post(b.url, chat("a", sid(2)), { ip: "203.0.113.51", identity: customer("c1") })).status).toBe(200);
    const m = (await (await get(b.url, "/v1/metrics")).json()) as MetricsSnapshot;
    expect(m.counters.requests_total).not.toHaveProperty("/v1/chat 429"); // the metrics started again from zero
  });

  it("a captured signed request that was already accepted can be replayed after a restart, within the 60 s clock window (documented limitation)", async () => {
    const nonce = "0123456789abcdef0123456789abcdef";
    const a = await startServer();
    expect((await post(a.url, chat("a", sid(1)), { nonce })).status).toBe(200);
    expect((await post(a.url, chat("a", sid(1)), { nonce })).status).toBe(401); // blocked while the process lives
    await a.app.close();
    const b = await startServer();
    servers.push(b);
    expect((await post(b.url, chat("a", sid(1)), { nonce })).status).toBe(200); // the nonce cache did not survive the restart
  });

  it("writes nothing to disk: no file, database or log store is used for messages, sessions, counters or metrics", () => {
    const root = fileURLToPath(new URL("../../src", import.meta.url));
    const files = (readdirSync(root, { recursive: true, withFileTypes: true }) as import("node:fs").Dirent[]).filter((e) => e.isFile() && e.name.endsWith(".ts")).map((e) => path.join(e.parentPath, e.name));
    const text = files.map((f) => readFileSync(f, "utf8")).join("\n");
    expect(text).not.toMatch(/writeFile|appendFile|createWriteStream|writeSync|sqlite|localStorage|indexedDB|\.mkdir\(/);
  });
});

describe("rate-limit storage failure and verifier failure do not take the service down", () => {
  it("chat requests are refused (503) while health and metrics stay available, and the failure is counted", async () => {
    const broken: RateStore = {
      hit() {
        throw new Error("down");
      },
      peek() {
        throw new Error("down");
      },
      size: () => 0,
    };
    const metrics = new Metrics();
    const s = await startServer({ metrics, guard: new AbuseGuard(DEFAULT_RATE_CONFIG, { store: broken }) });
    servers.push(s);
    expect((await post(s.url, chat())).status).toBe(503);
    expect((await get(s.url, "/v1/health")).status).toBe(200);
    const m = (await (await get(s.url, "/v1/metrics")).json()) as MetricsSnapshot;
    expect(m.counters.errors_total!.QUEUE_FULL).toBe(1);
  });
});
