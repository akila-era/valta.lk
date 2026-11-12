import { signRequest, type Identity } from "../../src/auth/hmac";
import { loadConfig } from "../../src/config";
import type { ChatPipeline, PipelineResult } from "../../src/http/pipeline";
import { createAgentServer, type RunningServer, type ServerDeps } from "../../src/http/server";
import { createLogger } from "../../src/observability/logger";

export const SECRET = "s".repeat(40);
export const KEY_ID = "k1";

export const okResult = (over: Partial<PipelineResult> = {}): PipelineResult => ({
  language: "en",
  reply: { text: "Here is what I found.", source: "template" },
  needsNativeReview: false,
  cards: [],
  actions: [],
  suggestions: [],
  meta: { model: null, degraded: false, queuedMs: 0 },
  ...over,
});

export const echoPipeline: ChatPipeline = { run: async () => okResult() };

export interface Started {
  app: RunningServer;
  url: string;
  logs: string[];
  calls: { identity: Identity; sessionId: string }[];
}

export interface StartOptions extends Partial<Omit<ServerDeps, "config" | "pipeline">> {
  env?: Record<string, string>;
  pipeline?: ChatPipeline;
}

/** Starts a real Agent HTTP server on a loopback port. The pipeline records every call so tests can prove nothing ran. */
export async function startServer(opts: StartOptions = {}): Promise<Started> {
  const { env, pipeline, ...rest } = opts;
  const config = loadConfig({ AGENT_HMAC_KEYS: `${KEY_ID}:${SECRET}`, AGENT_PORT: "0", AI_ASSISTANT_ENABLED: "true", ...env });
  const logs: string[] = [];
  const calls: Started["calls"] = [];
  const inner = pipeline ?? echoPipeline;
  const recording: ChatPipeline = {
    run: async (input, emit) => {
      calls.push({ identity: input.identity, sessionId: input.request.sessionId });
      return inner.run(input, emit);
    },
  };
  const app = createAgentServer({ config, pipeline: recording, logger: createLogger({ write: (l) => logs.push(l) }), memory: async () => ({ availableMb: 1000, swapUsedMb: 0 }), ...rest });
  const { port } = await app.listen();
  return { app, url: `http://127.0.0.1:${port}`, logs, calls };
}

export interface PostOptions {
  identity?: Identity;
  ip?: string;
  path?: string;
  nowMs?: number;
  nonce?: string;
  headers?: Record<string, string>;
  /** Send this exact text instead of JSON.stringify(body) (signed as given). */
  raw?: string;
  secret?: string;
}

export const GUEST: Identity = { kind: "guest" };
export const customer = (id: string): Identity => ({ kind: "customer", customerId: id });

export function post(url: string, body: unknown, o: PostOptions = {}): Promise<Response> {
  const raw = o.raw ?? JSON.stringify(body);
  const path = o.path ?? "/v1/chat";
  const sig = signRequest({ keyId: KEY_ID, secret: o.secret ?? SECRET, method: "POST", path, identity: o.identity ?? GUEST, clientIp: o.ip ?? "203.0.113.7", body: raw, ...(o.nowMs !== undefined ? { nowMs: o.nowMs } : {}), ...(o.nonce ? { nonce: o.nonce } : {}) });
  return fetch(`${url}${path}`, { method: "POST", headers: { "content-type": "application/json", ...sig, ...(o.headers ?? {}) }, body: raw });
}

export const chat = (message = "Show me phones", sessionId = "sess_0123456789abcdef") => ({ sessionId, message });
export const sid = (n: number | string) => `sess_${String(n).padStart(16, "0")}`;

/** A signed GET (health, metrics). */
export function get(url: string, path: string, o: { identity?: Identity; ip?: string; secret?: string; nowMs?: number } = {}): Promise<Response> {
  const sig = signRequest({ keyId: KEY_ID, secret: o.secret ?? SECRET, method: "GET", path, identity: o.identity ?? GUEST, clientIp: o.ip ?? "203.0.113.7", ...(o.nowMs !== undefined ? { nowMs: o.nowMs } : {}) });
  return fetch(`${url}${path}`, { method: "GET", headers: sig });
}
