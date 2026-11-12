import { afterEach, describe, expect, it } from "vitest";
import { signRequest, type Identity } from "../../src/auth/hmac";
import { loadConfig } from "../../src/config";
import { CONTRACT_VERSION, ErrorEnvelope, HealthResponse, StreamEvent } from "../../src/contract/schemas";
import { createAgentServer, type RunningServer } from "../../src/http/server";
import { notEnabledPipeline, type ChatPipeline, type PipelineResult } from "../../src/http/pipeline";
import { createLogger } from "../../src/observability/logger";
import { OllamaClient, OllamaError } from "../../src/ollama/client";
import { InferenceScheduler, JobDeadlineError, QueueFullError } from "../../src/queue/scheduler";
import { startFakeOllama, type FakeOllama } from "../fake-ollama/server";

const SECRET = "t".repeat(40);
const SESSION = "sess_0123456789abcdef";
const CANARY = "CANARY-7f3a91-customer-text";

const okResult = (over: Partial<PipelineResult> = {}): PipelineResult => ({
  language: "en",
  reply: { text: "Here are some phones.", source: "template" },
  needsNativeReview: false,
  cards: [],
  actions: [],
  suggestions: [],
  meta: { model: null, degraded: false, queuedMs: 0 },
  ...over,
});
const echoPipeline: ChatPipeline = { run: async () => okResult() };

interface Started {
  app: RunningServer;
  url: string;
  logs: string[];
  fake?: FakeOllama;
}
const running: Started[] = [];

async function start(
  opts: { env?: Record<string, string>; pipeline?: ChatPipeline; ollama?: boolean; scheduler?: InferenceScheduler; memory?: boolean } = {},
): Promise<Started> {
  const config = loadConfig({ AGENT_HMAC_KEYS: `k1:${SECRET}`, AGENT_PORT: "0", AI_ASSISTANT_ENABLED: "true", ...opts.env });
  const logs: string[] = [];
  const fake = opts.ollama ? await startFakeOllama() : undefined;
  const app = createAgentServer({
    config,
    pipeline: opts.pipeline ?? echoPipeline,
    ...(fake ? { ollama: new OllamaClient({ baseUrl: fake.url }) } : {}),
    ...(opts.scheduler ? { scheduler: opts.scheduler } : {}),
    logger: createLogger({ write: (l) => logs.push(l) }),
    memory: async () => ({ availableMb: 1234, swapUsedMb: 0 }),
  });
  const { port } = await app.listen();
  const started: Started = { app, url: `http://127.0.0.1:${port}`, logs, ...(fake ? { fake } : {}) };
  running.push(started);
  return started;
}

afterEach(async () => {
  while (running.length) {
    const s = running.pop()!;
    await s.app.close();
    await s.fake?.close();
  }
});

interface CallOpts {
  method?: "GET" | "POST";
  body?: unknown;
  identity?: Identity;
  ip?: string;
  headers?: Record<string, string>;
  sign?: boolean;
  contentType?: string;
  signal?: AbortSignal;
}

/** Response whose json() is untyped: test assertions read fields freely. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Res = Omit<Response, "json"> & { json(): Promise<any> };

function call(s: Started, path: string, o: CallOpts = {}): Promise<Res> {
  const method = o.method ?? "POST";
  const raw = o.body === undefined ? "" : typeof o.body === "string" ? o.body : JSON.stringify(o.body);
  const sig = o.sign === false ? {} : signRequest({ keyId: "k1", secret: SECRET, method, path, identity: o.identity ?? { kind: "guest" }, clientIp: o.ip ?? "203.0.113.7", body: raw });
  return fetch(`${s.url}${path}`, {
    method,
    headers: { ...(method === "POST" ? { "content-type": o.contentType ?? "application/json" } : {}), ...sig, ...(o.headers ?? {}) },
    ...(method === "POST" ? { body: raw } : {}),
    ...(o.signal ? { signal: o.signal } : {}),
  }) as unknown as Promise<Res>;
}

const chatBody = (message = "Show me phones") => ({ sessionId: SESSION, message });

async function sseEvents(res: Pick<Response, "text">): Promise<{ event: string; data: unknown }[]> {
  const text = await res.text();
  const out: { event: string; data: unknown }[] = [];
  for (const block of text.split("\n\n")) {
    const ev = /^event: (.+)$/m.exec(block);
    const data = /^data: (.+)$/m.exec(block);
    if (ev && data) out.push({ event: ev[1]!, data: JSON.parse(data[1]!) });
  }
  return out;
}

describe("authentication", () => {
  it("answers 401 with one generic body for every kind of failure", async () => {
    const s = await start();
    const unsigned = await call(s, "/v1/chat", { body: chatBody(), sign: false });
    const wrong = (await fetch(`${s.url}/v1/chat`, {
      method: "POST",
      headers: { "content-type": "application/json", ...signRequest({ keyId: "k1", secret: "x".repeat(40), method: "POST", path: "/v1/chat", identity: { kind: "guest" }, clientIp: "203.0.113.7", body: JSON.stringify(chatBody()) }) },
      body: JSON.stringify(chatBody()),
    })) as unknown as Res;
    const bodies = await Promise.all([unsigned, wrong].map(async (r) => ({ status: r.status, body: await r.json() })));
    expect(bodies[0]!.status).toBe(401);
    expect(bodies[1]!.status).toBe(401);
    expect(bodies[0]!.body.error.message).toBe("Unauthorized.");
    expect(bodies[0]!.body.error.code).toBe("UNAUTHORIZED");
    expect(bodies[0]!.body.error.message).toBe(bodies[1]!.body.error.message); // no oracle for the failure reason
    expect(ErrorEnvelope.safeParse(bodies[0]!.body).success).toBe(true);
  });

  it("rejects a replayed request", async () => {
    const s = await start();
    const raw = JSON.stringify(chatBody());
    const headers = { "content-type": "application/json", ...signRequest({ keyId: "k1", secret: SECRET, method: "POST", path: "/v1/chat", identity: { kind: "guest" }, clientIp: "203.0.113.7", body: raw }) };
    expect((await fetch(`${s.url}/v1/chat`, { method: "POST", headers, body: raw })).status).toBe(200);
    expect((await fetch(`${s.url}/v1/chat`, { method: "POST", headers, body: raw })).status).toBe(401);
  });

  it("rejects a body altered after signing", async () => {
    const s = await start();
    const headers = { "content-type": "application/json", ...signRequest({ keyId: "k1", secret: SECRET, method: "POST", path: "/v1/chat", identity: { kind: "guest" }, clientIp: "203.0.113.7", body: JSON.stringify(chatBody("original")) }) };
    expect((await fetch(`${s.url}/v1/chat`, { method: "POST", headers, body: JSON.stringify(chatBody("tampered")) })).status).toBe(401);
  });

  it("passes the SIGNED identity and client ip to the pipeline, never anything else", async () => {
    let seen: { kind: string; customerId?: string; ip: string } | null = null;
    const pipeline: ChatPipeline = {
      run: async (input) => {
        seen = { kind: input.identity.kind, ...(input.identity.kind === "customer" ? { customerId: input.identity.customerId } : {}), ip: input.clientIp };
        return okResult();
      },
    };
    const s = await start({ pipeline });
    await call(s, "/v1/chat", { body: chatBody(), identity: { kind: "customer", customerId: "cust_42" }, ip: "198.51.100.9" });
    expect(seen).toEqual({ kind: "customer", customerId: "cust_42", ip: "198.51.100.9" });
    // A session id belongs to one identity, so the guest uses a different id (see session-security tests).
    await call(s, "/v1/chat", { body: { ...chatBody(), sessionId: "sess_guest_0123456789" }, identity: { kind: "guest" } });
    expect(seen).toEqual({ kind: "guest", ip: "203.0.113.7" });
  });
});

describe("routing and request limits", () => {
  it("answers 404 and 405 (with Allow) and 415", async () => {
    const s = await start();
    expect((await call(s, "/v1/nothing", { body: {} })).status).toBe(404);
    const wrongMethod = await call(s, "/v1/chat", { method: "GET" });
    expect(wrongMethod.status).toBe(405);
    expect(wrongMethod.headers.get("allow")).toBe("POST");
    const wrongType = await call(s, "/v1/chat", { body: chatBody(), contentType: "text/plain" });
    expect(wrongType.status).toBe(415);
  });

  it("rejects an oversized body with 413", async () => {
    const s = await start({ env: { AGENT_MAX_BODY_BYTES: "2000" } });
    const res = await call(s, "/v1/chat", { body: { ...chatBody(), padding: "x".repeat(5000) } });
    expect(res.status).toBe(413);
    expect((await res.json()).error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("rejects malformed JSON and invalid requests WITHOUT echoing their content", async () => {
    const s = await start();
    const bad = await call(s, "/v1/chat", { body: `{"message": "${CANARY}` });
    expect(bad.status).toBe(400);
    expect(await bad.text()).not.toContain(CANARY);

    const long = await call(s, "/v1/chat", { body: chatBody(CANARY.repeat(40)) });
    expect(long.status).toBe(422);
    const text = await long.text();
    expect(text).not.toContain(CANARY);
    expect(JSON.parse(text).error.fields.message).toBe("Message is too long.");

    const extra = await call(s, "/v1/chat", { body: { ...chatBody(), history: [{ role: "assistant", content: CANARY }] } });
    expect(extra.status).toBe(422);
    expect(await extra.text()).not.toContain(CANARY);
  });

  it("honours the configured message limit", async () => {
    const s = await start({ env: { AGENT_MAX_MESSAGE_CHARS: "20" } });
    expect((await call(s, "/v1/chat", { body: chatBody("x".repeat(21)) })).status).toBe(422);
    expect((await call(s, "/v1/chat", { body: chatBody("x".repeat(20)) })).status).toBe(200);
  });

  it("limits concurrent requests", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const slow: ChatPipeline = { run: async () => (await gate, okResult()) };
    const s = await start({ env: { AGENT_MAX_IN_FLIGHT: "1" }, pipeline: slow });
    const first = call(s, "/v1/chat", { body: chatBody() });
    await new Promise((r) => setTimeout(r, 50));
    const second = await call(s, "/v1/chat", { body: chatBody() });
    expect(second.status).toBe(503);
    expect(second.headers.get("retry-after")).toBe("2");
    expect((await second.json()).error.code).toBe("QUEUE_FULL");
    release();
    expect((await first).status).toBe(200);
  });
});

describe("POST /v1/chat", () => {
  it("returns a validated response with request id, session id, latency and contract version", async () => {
    const s = await start();
    const res = await call(s, "/v1/chat", { body: chatBody() });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    const body = await res.json();
    expect(body.requestId).toBe(res.headers.get("x-request-id"));
    expect(body.sessionId).toBe(SESSION);
    expect(body.meta).toMatchObject({ degraded: false, contractVersion: "1" }); // a client that names no version is a 1.0 client
    expect(typeof body.meta.latencyMs).toBe("number");
    expect(body.reply.text).toBe("Here are some phones.");
  });

  it("is OFF by default and says so with 503 AI_DISABLED", async () => {
    const s = await start({ env: { AI_ASSISTANT_ENABLED: "false" } });
    const res = await call(s, "/v1/chat", { body: chatBody() });
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("AI_DISABLED");
  });

  it("does not improvise an answer while the pipeline is not built: 503 AI_UNAVAILABLE", async () => {
    const s = await start({ pipeline: notEnabledPipeline });
    const res = await call(s, "/v1/chat", { body: chatBody() });
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("AI_UNAVAILABLE");
  });

  it("never sends an unvalidated pipeline result: Sinhala output without needsNativeReview becomes a generic 500", async () => {
    const leaky: ChatPipeline = { run: async () => okResult({ language: "si", needsNativeReview: false, reply: { text: "SECRET-INTERNAL ශ්‍රී ලංකාව", source: "sinhala-llm" } }) };
    const s = await start({ pipeline: leaky });
    const res = await call(s, "/v1/chat", { body: chatBody() });
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(JSON.parse(text).error.code).toBe("INTERNAL");
    expect(text).not.toContain("SECRET-INTERNAL");
  });

  it("accepts Sinhala output that carries needsNativeReview", async () => {
    const si: ChatPipeline = { run: async () => okResult({ language: "si", needsNativeReview: true, reply: { text: "ශ්‍රී ලංකාවේ අගනුවර කොළඹ", source: "template" } }) };
    const s = await start({ pipeline: si });
    const body = await (await call(s, "/v1/chat", { body: chatBody("ශ්‍රී ලංකාවේ අගනුවර කුමක්ද?") })).json();
    expect(body).toMatchObject({ language: "si", needsNativeReview: true });
  });

  it("maps pipeline failures to safe errors with no internal text", async () => {
    const cases: [unknown, number, string][] = [
      [new QueueFullError(7), 503, "QUEUE_FULL"],
      [new JobDeadlineError("queued"), 504, "TIMEOUT"],
      [new OllamaError("UNAVAILABLE", "connect ECONNREFUSED 127.0.0.1:11434"), 503, "AI_UNAVAILABLE"],
      [new OllamaError("HTTP", "Ollama answered HTTP 500.", 500), 502, "UPSTREAM_ERROR"],
      [new Error("db password=hunter2 at 10.0.0.9"), 500, "INTERNAL"],
    ];
    for (const [err, status, code] of cases) {
      const s = await start({ pipeline: { run: async () => Promise.reject(err) } });
      const res = await call(s, "/v1/chat", { body: chatBody() });
      const text = await res.text();
      expect([res.status, JSON.parse(text).error.code], code).toEqual([status, code]);
      expect(text).not.toMatch(/hunter2|10\.0\.0\.9|ECONNREFUSED|127\.0\.0\.1/);
      if (code === "QUEUE_FULL") expect(res.headers.get("retry-after")).toBe("7");
      await s.app.close();
      running.splice(running.indexOf(s), 1);
    }
  });

  it("answers 504 when the request deadline passes", async () => {
    const hang: ChatPipeline = { run: ({ signal }) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")))) };
    const s = await start({ pipeline: hang, env: { AGENT_DEADLINE_MS: "1000" } });
    const t0 = Date.now();
    const res = await call(s, "/v1/chat", { body: chatBody() });
    expect(res.status).toBe(504);
    expect((await res.json()).error.code).toBe("TIMEOUT");
    expect(Date.now() - t0).toBeGreaterThanOrEqual(900);
  });
});

describe("POST /v1/chat/stream (SSE)", () => {
  const streaming: ChatPipeline = {
    run: async (_input, emit) => {
      emit({ type: "status", phase: "queued", position: 1 });
      emit({ type: "status", phase: "routing" });
      emit({
        type: "card",
        card: { type: "product", id: "i1", slug: "nova-x1", name: "Nova X1", price: { amount: 129900, text: "Rs. 129,900.00" }, available: true, url: "/products/nova-x1" },
      });
      emit({ type: "action", action: { type: "navigate", actionId: "act_12345678", href: "/cart" } });
      return okResult();
    },
  };

  it("streams status, card, action, then the text and done, each valid against the contract", async () => {
    const s = await start({ pipeline: streaming });
    const res = await call(s, "/v1/chat/stream", { body: chatBody() });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(res.headers.get("cache-control")).toBe("no-store");
    const events = await sseEvents(res);
    expect(events.map((e) => e.event)).toEqual(["status", "status", "card", "action", "text", "done"]);
    for (const e of events) expect(StreamEvent.safeParse(e).success, e.event).toBe(true);
  });

  it("does not send the final text again when tokens were already streamed", async () => {
    const tokens: ChatPipeline = {
      run: async (_i, emit) => {
        emit({ type: "token", text: "Hel" });
        emit({ type: "token", text: "lo" });
        return okResult({ reply: { text: "Hello", source: "qwen" } });
      },
    };
    const s = await start({ pipeline: tokens });
    const events = await sseEvents(await call(s, "/v1/chat/stream", { body: chatBody() }));
    expect(events.map((e) => e.event)).toEqual(["token", "token", "done"]);
  });

  it("ends with an error event, then closes, when the pipeline fails after the stream started", async () => {
    const failing: ChatPipeline = {
      run: async (_i, emit) => {
        emit({ type: "status", phase: "routing" });
        throw new QueueFullError(3);
      },
    };
    const s = await start({ pipeline: failing });
    const res = await call(s, "/v1/chat/stream", { body: chatBody() });
    const events = await sseEvents(res);
    expect(events.map((e) => e.event)).toEqual(["status", "error"]);
    expect((events[1]!.data as { error: { code: string } }).error.code).toBe("QUEUE_FULL");
  });

  it("refuses an invalid card from the pipeline instead of forwarding it", async () => {
    const bad: ChatPipeline = {
      run: async (_i, emit) => {
        emit({ type: "card", card: { type: "product", id: "i1", slug: "x", name: "X", price: { amount: -5, text: "x" }, available: true, url: "/admin" } as never });
        return okResult();
      },
    };
    const s = await start({ pipeline: bad });
    const events = await sseEvents(await call(s, "/v1/chat/stream", { body: chatBody() }));
    expect(events.map((e) => e.event)).not.toContain("card");
    expect(events.at(-1)!.event).toBe("error");
  });

  it("cancels the pipeline when the client disconnects", async () => {
    let aborted = false;
    let started!: () => void;
    const ready = new Promise<void>((r) => (started = r));
    const slow: ChatPipeline = {
      run: ({ signal }, emit) =>
        new Promise((_, reject) => {
          emit({ type: "status", phase: "queued" });
          started();
          signal.addEventListener("abort", () => {
            aborted = true;
            reject(new Error("aborted"));
          });
        }),
    };
    const s = await start({ pipeline: slow });
    const ac = new AbortController();
    const resPromise = call(s, "/v1/chat/stream", { body: chatBody(), signal: ac.signal });
    await ready;
    ac.abort();
    await resPromise.catch(() => undefined);
    for (let i = 0; i < 40 && !aborted; i++) await new Promise((r) => setTimeout(r, 25));
    expect(aborted).toBe(true);
  });

  it("sends heartbeats while it waits", async () => {
    const slow: ChatPipeline = { run: async (_i, emit) => (emit({ type: "status", phase: "queued" }), await new Promise((r) => setTimeout(r, 450)), okResult()) };
    const s = await start({ pipeline: slow, env: { AGENT_HEARTBEAT_MS: "100" } });
    const text = await (await call(s, "/v1/chat/stream", { body: chatBody() })).text();
    expect(text).toMatch(/: ping/);
  });
});

describe("GET /v1/health", () => {
  it("requires authentication", async () => {
    const s = await start();
    expect((await call(s, "/v1/health", { method: "GET", sign: false })).status).toBe(401);
  });

  it("reports Ollama, queue and memory, and is ready only when enabled and reachable", async () => {
    const scheduler = new InferenceScheduler({ maxQueued: 3 });
    const s = await start({ ollama: true, scheduler });
    const body = HealthResponse.parse(await (await call(s, "/v1/health", { method: "GET" })).json());
    expect(body).toMatchObject({ ok: true, ready: true, enabled: true, contractVersion: CONTRACT_VERSION, ollama: { reachable: true, version: "0.40.16", loadedModel: null }, queue: { depth: 0, running: false }, memory: { availableMb: 1234, swapUsedMb: 0 } });

    await s.fake!.close();
    const down = HealthResponse.parse(await (await call(s, "/v1/health", { method: "GET" })).json());
    expect(down).toMatchObject({ ok: true, ready: false, ollama: { reachable: false } });
    s.fake = await startFakeOllama(); // so afterEach has something to close
  });

  it("is not ready while the kill switch is off, but still answers", async () => {
    const s = await start({ ollama: true, env: { AI_ASSISTANT_ENABLED: "false" } });
    const body = await (await call(s, "/v1/health", { method: "GET" })).json();
    expect(body).toMatchObject({ enabled: false, ready: false, ollama: { reachable: true } });
  });

  it("syncs the scheduler's idea of the loaded model from Ollama", async () => {
    const scheduler = new InferenceScheduler({ maxQueued: 3 });
    const s = await start({ ollama: true, scheduler });
    await new OllamaClient({ baseUrl: s.fake!.url }).generate({ model: "sinhala", purpose: "reply", messages: [{ role: "user", content: "hi" }] });
    const body = await (await call(s, "/v1/health", { method: "GET" })).json();
    expect(body.ollama.loadedModel).toBe("hf.co/namindu94/SinhalaLLM-1.7B:Q4_K_M");
    expect(scheduler.state().loaded).toBe("sinhala");
  });
});

describe("what is logged", () => {
  it("never logs message text, secrets, signatures, cart contents or customer ids", async () => {
    const s = await start();
    await call(s, "/v1/chat", { body: { ...chatBody(`please find ${CANARY}`), cart: [{ productId: "PRODUCT-CANARY-123", quantity: 1 }] }, identity: { kind: "customer", customerId: "CUSTOMER-CANARY-9" } });
    await call(s, "/v1/chat", { body: chatBody(CANARY), sign: false });
    await call(s, "/v1/chat", { body: chatBody(CANARY.repeat(60)) });
    expect(s.logs.length).toBeGreaterThanOrEqual(3);
    const all = s.logs.join("\n");
    expect(all).not.toMatch(/CANARY|PRODUCT-CANARY|CUSTOMER-CANARY/);
    expect(all).not.toContain(SECRET);
    expect(all).not.toMatch(/x-volta|signature|[0-9a-f]{64}/i);
    for (const line of s.logs) {
      expect(Object.keys(JSON.parse(line)).every((k) => ["ts", "requestId", "route", "method", "status", "latencyMs", "identityKind", "errorCode", "authReason", "degraded"].includes(k))).toBe(true);
    }
    const unauth = s.logs.map((l) => JSON.parse(l)).find((l) => l.status === 401);
    expect(unauth).toMatchObject({ errorCode: "UNAUTHORIZED", authReason: "MISSING_HEADER", identityKind: "none" });
  });
});
