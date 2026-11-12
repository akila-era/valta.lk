import { randomUUID } from "node:crypto";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { formatIdentity, ReplayCache, verifyRequest, type Identity } from "../auth/hmac";
import { APP_VERSION, type AgentConfig } from "../config";
import {
  Card,
  ChatResponse,
  ClientAction,
  CONTRACT_VERSION,
  LEGACY_CONTRACT_VERSION,
  type ContractVersion,
  HealthResponse,
  makeChatRequestSchema,
  type ErrorEnvelope,
} from "../contract/schemas";
import { cardForVersion } from "../contract/compat";
import { AbuseGuard, type ChallengeProvider } from "../security/rate-limit";
import { SessionRegistry } from "../security/sessions";
import { renderTemplate } from "../router/templates";
import { verifyVersionShape } from "../verify/verifier";
import { ApiError, type ErrorCode } from "../errors";
import { OllamaError, type OllamaLike } from "../ollama/client";
import { ModelPolicyError, modelKeyOfTag } from "../ollama/models";
import { JobAbortedError, JobDeadlineError, QueueFullError, type InferenceScheduler } from "../queue/scheduler";
import { nullLogger, type Logger } from "../observability/logger";
import type { Metrics } from "../observability/metrics";
import { readMemory, type MemoryReading } from "../observability/memory";
import type { ChatPipeline, PipelineEvent } from "./pipeline";

export interface ServerDeps {
  config: AgentConfig;
  pipeline: ChatPipeline;
  ollama?: OllamaLike;
  scheduler?: InferenceScheduler;
  logger?: Logger;
  replay?: ReplayCache;
  /** Abuse limits. Built from config when not given (tests inject one with a fake clock or a broken store). */
  guard?: AbuseGuard;
  /** Session id ownership and expiry. Built when not given. */
  sessionRegistry?: SessionRegistry;
  /** CAPTCHA provider hook. None exists in M1. */
  challenge?: ChallengeProvider;
  now?: () => number;
  memory?: () => Promise<MemoryReading>;
  /** Operational counters and latencies, served (signed) at /v1/metrics. Counts and durations only. */
  metrics?: Metrics;
}

export interface RunningServer {
  server: http.Server;
  listen(): Promise<{ host: string; port: number }>;
  close(): Promise<void>;
}

const ROUTES: Record<string, string> = { "/v1/chat": "POST", "/v1/chat/stream": "POST", "/v1/health": "GET", "/v1/metrics": "GET" };

function readBody(req: IncomingMessage, maxBytes: number): Promise<Buffer> {
  const declared = Number(req.headers["content-length"]);
  if (Number.isFinite(declared) && declared > maxBytes) return Promise.reject(new ApiError("PAYLOAD_TOO_LARGE", "Request body is too large."));
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    req.on("data", (chunk: Buffer) => {
      if (settled) return;
      size += chunk.length;
      if (size > maxBytes) {
        settled = true;
        reject(new ApiError("PAYLOAD_TOO_LARGE", "Request body is too large."));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!settled) {
        settled = true;
        resolve(Buffer.concat(chunks));
      }
    });
    req.on("error", (e) => {
      if (!settled) {
        settled = true;
        reject(e);
      }
    });
  });
}

/** Maps anything a pipeline or backend throws to a safe ApiError. Messages here never contain request content. */
export function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  if (e instanceof QueueFullError) return new ApiError("QUEUE_FULL", "The assistant is busy. Please try again shortly.", { retryAfterSec: e.retryAfterSec });
  if (e instanceof JobDeadlineError) return new ApiError("TIMEOUT", "The assistant took too long to answer.");
  if (e instanceof OllamaError) {
    if (e.kind === "UNAVAILABLE") return new ApiError("AI_UNAVAILABLE", "The assistant is temporarily unavailable.");
    if (e.kind === "TIMEOUT") return new ApiError("TIMEOUT", "The assistant took too long to answer.");
    return new ApiError("UPSTREAM_ERROR", "The assistant could not complete the request.");
  }
  if (e instanceof ModelPolicyError) return new ApiError("INTERNAL", "Internal error.");
  return new ApiError("INTERNAL", "Internal error.");
}

export function createAgentServer(deps: ServerDeps): RunningServer {
  const { config, pipeline } = deps;
  const logger = deps.logger ?? nullLogger;
  const now = deps.now ?? Date.now;
  const replay = deps.replay ?? new ReplayCache({ now });
  const guard = deps.guard ?? new AbuseGuard(config.rate, { now, challengeMode: config.challengeMode, ...(deps.challenge ? { challenge: deps.challenge } : {}) });
  const sessionRegistry = deps.sessionRegistry ?? new SessionRegistry({ now });
  const memory = deps.memory ?? readMemory;
  const chatSchema = makeChatRequestSchema(config.maxMessageChars);
  const startedAt = now();
  let inFlight = 0;

  const envelope = (e: ApiError, requestId: string): ErrorEnvelope => ({
    error: {
      code: e.code as ErrorCode,
      message: e.message,
      requestId,
      ...(e.retryAfterSec !== undefined ? { retryAfterSec: e.retryAfterSec } : {}),
      ...(e.fields ? { fields: e.fields } : {}),
    },
  });

  function sendJson(res: ServerResponse, status: number, body: unknown, extra: Record<string, string> = {}): void {
    const text = JSON.stringify(body);
    res.writeHead(status, {
      "content-type": "application/json; charset=utf-8",
      "content-length": Buffer.byteLength(text),
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...extra,
    });
    res.end(text);
  }

  function sendError(res: ServerResponse, req: IncomingMessage, e: ApiError, requestId: string): void {
    const extra: Record<string, string> = {};
    if (e.retryAfterSec !== undefined) extra["retry-after"] = String(e.retryAfterSec);
    if (e.code === "PAYLOAD_TOO_LARGE") {
      // Stop reading the rest of an oversized body: answer, then drop the connection.
      extra.connection = "close";
      res.once("finish", () => req.socket.destroy());
    }
    if (e.code === "METHOD_NOT_ALLOWED") extra.allow = ROUTES[new URL(req.url ?? "/", "http://x").pathname] ?? "";
    sendJson(res, e.status, envelope(e, requestId), extra);
  }

  function sse(res: ServerResponse, event: string, data: unknown): void {
    if (res.writableEnded || res.destroyed) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  async function health(res: ServerResponse): Promise<void> {
    let reachable = false;
    let version: string | undefined;
    let loaded: string | null = null;
    if (deps.ollama) {
      try {
        const signal = AbortSignal.timeout(1_500);
        version = await deps.ollama.version(signal);
        reachable = true;
        const names = await deps.ollama.loadedModels(signal);
        loaded = names[0] ?? null;
        const key = loaded ? modelKeyOfTag(loaded) : null;
        if (key) deps.scheduler?.setLoaded(key);
      } catch {
        reachable = false;
      }
    }
    const st = deps.scheduler?.state();
    const body = HealthResponse.parse({
      ok: true,
      ready: config.assistantEnabled && reachable,
      enabled: config.assistantEnabled,
      appVersion: APP_VERSION,
      contractVersion: CONTRACT_VERSION,
      ollama: { reachable, ...(version ? { version } : {}), loadedModel: loaded },
      queue: { depth: st?.depth ?? 0, running: st ? st.running !== null : false },
      memory: await memory(),
      uptimeSec: Math.max(0, Math.round((now() - startedAt) / 1000)),
    });
    sendJson(res, 200, body);
  }

  /** Shapes the result for the client's contract version and refuses to send anything that version cannot understand. */
  function shapeForVersion(result: Awaited<ReturnType<ChatPipeline["run"]>>, version: ContractVersion) {
    const cards = result.cards.map((c) => cardForVersion(c, version));
    if (verifyVersionShape(cards, version).ok) return { ...result, cards };
    const tpl = renderTemplate("verification_failed", result.language === "en" ? "en" : "si");
    return { ...result, cards: [], actions: [], reply: { text: tpl.text, source: "template" as const }, needsNativeReview: result.language !== "en" || tpl.sinhala };
  }

  async function chat(req: IncomingMessage, res: ServerResponse, body: Buffer, identity: Identity, clientIp: string, requestId: string, stream: boolean, t0: number): Promise<{ degraded: boolean }> {
    if (!config.assistantEnabled) throw new ApiError("AI_DISABLED", "The assistant is currently disabled.");

    let json: unknown;
    try {
      json = JSON.parse(body.toString("utf8"));
    } catch {
      throw new ApiError("INVALID_REQUEST", "The request body is not valid JSON.");
    }
    const parsed = chatSchema.safeParse(json);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) fields[issue.path.join(".") || "(root)"] ??= issue.message;
      throw new ApiError("VALIDATION_FAILED", "The request is not valid.", { fields });
    }

    // Abuse controls run on trusted keys only: the signed client IP, the signed identity and the validated session id.
    await guard.checkChallenge({ clientIp, identityKey: formatIdentity(identity), ...(parsed.data.challengeToken ? { token: parsed.data.challengeToken } : {}) });
    guard.checkSession({ identityKey: formatIdentity(identity), sessionId: parsed.data.sessionId });
    const touched = sessionRegistry.touch(formatIdentity(identity), parsed.data.sessionId);
    if (touched.status === "conflict") {
      // The id belongs to another identity (for example a guest session reused after login): never share or take it over.
      throw new ApiError("VALIDATION_FAILED", "The request is not valid.", { fields: { sessionId: "This session id cannot be used. Start a new session." } });
    }
    if (touched.status === "new") guard.checkNewSession(formatIdentity(identity));

    const deadlineAt = t0 + config.deadlineMs;
    const abort = new AbortController();
    let deadlineHit = false;
    const timer = setTimeout(() => {
      deadlineHit = true;
      abort.abort();
    }, Math.max(0, deadlineAt - now()));
    res.once("close", () => {
      if (!res.writableEnded) abort.abort();
    });
    // A client that does not name a contract version is a 1.0 client (comparisons of at most 3 products).
    const version: ContractVersion = parsed.data.contractVersion ?? LEGACY_CONTRACT_VERSION;
    const input = { requestId, identity, clientIp, request: parsed.data, signal: abort.signal, deadlineAt };

    try {
      if (!stream) {
        let result: Awaited<ReturnType<ChatPipeline["run"]>>;
        try {
          result = await pipeline.run(input, () => {});
        } catch (e) {
          if (deadlineHit) throw new ApiError("TIMEOUT", "The assistant took too long to answer.");
          throw e;
        }
        const out = ChatResponse.safeParse({
          requestId,
          sessionId: parsed.data.sessionId,
          ...result,
          ...shapeForVersion(result, version),
          meta: { ...result.meta, latencyMs: Math.max(0, now() - t0), contractVersion: version },
        });
        if (!out.success) throw new ApiError("INTERNAL", "Internal error.");
        sendJson(res, 200, out.data);
        return { degraded: out.data.meta.degraded };
      }

      res.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-store",
        "x-accel-buffering": "no",
        "x-content-type-options": "nosniff",
      });
      const heartbeat = setInterval(() => {
        if (!res.writableEnded && !res.destroyed) res.write(": ping\n\n");
      }, config.heartbeatMs);
      let tokensSent = false;
      const emit = (e: PipelineEvent): void => {
        if (e.type === "status") sse(res, "status", { phase: e.phase, ...(e.position !== undefined ? { position: e.position } : {}) });
        else if (e.type === "card") {
          const shaped = cardForVersion(e.card, version);
          if (verifyVersionShape([shaped], version).ok) sse(res, "card", Card.parse(shaped));
        }
        else if (e.type === "action") sse(res, "action", ClientAction.parse(e.action));
        else if (e.type === "token") {
          tokensSent = true;
          sse(res, "token", { text: e.text });
        } else sse(res, "text", { text: e.text, source: e.source, needsNativeReview: e.needsNativeReview });
      };
      try {
        const result = await pipeline.run(input, emit);
        const out = ChatResponse.safeParse({
          requestId,
          sessionId: parsed.data.sessionId,
          ...result,
          ...shapeForVersion(result, version),
          meta: { ...result.meta, latencyMs: Math.max(0, now() - t0), contractVersion: version },
        });
        if (!out.success) throw new ApiError("INTERNAL", "Internal error.");
        if (!tokensSent) sse(res, "text", { text: out.data.reply.text, source: out.data.reply.source, needsNativeReview: out.data.needsNativeReview });
        sse(res, "done", { meta: out.data.meta });
        res.end();
        return { degraded: out.data.meta.degraded };
      } catch (e) {
        const clientGone = res.destroyed || (abort.signal.aborted && !deadlineHit) || (e instanceof JobAbortedError && !deadlineHit);
        if (clientGone) {
          if (!res.writableEnded) res.end();
          return { degraded: false };
        }
        const api = deadlineHit ? new ApiError("TIMEOUT", "The assistant took too long to answer.") : toApiError(e);
        sse(res, "error", envelope(api, requestId));
        res.end();
        throw Object.assign(api, { alreadyResponded: true });
      } finally {
        clearInterval(heartbeat);
      }
    } finally {
      clearTimeout(timer);
    }
  }

  const server = http.createServer((req, res) => {
    const t0 = now();
    const requestId = `req_${randomUUID()}`;
    res.setHeader("x-request-id", requestId);
    const url = new URL(req.url ?? "/", "http://localhost");
    const route = url.pathname;
    let status = 500;
    let errorCode: string | undefined;
    let authReason: string | undefined;
    let identityKind: "guest" | "customer" | "none" = "none";
    let degraded = false;

    const finish = (): void => {
      deps.metrics?.request(route, res.statusCode || status, Math.max(0, now() - t0), errorCode);
      logger.log({
        requestId,
        route: route in ROUTES ? route : "(unknown)",
        method: req.method ?? "?",
        status: res.statusCode || status,
        latencyMs: Math.max(0, now() - t0),
        identityKind,
        ...(errorCode ? { errorCode } : {}),
        ...(authReason ? { authReason } : {}),
        ...(degraded ? { degraded } : {}),
      });
    };

    void (async () => {
      inFlight++;
      try {
        const expected = ROUTES[route];
        if (!expected) throw new ApiError("NOT_FOUND", "Not found.");
        if (req.method !== expected) throw new ApiError("METHOD_NOT_ALLOWED", "Method not allowed.");
        if (inFlight > config.maxInFlight) throw new ApiError("QUEUE_FULL", "The assistant is busy. Please try again shortly.", { retryAfterSec: 2 });
        // Before anything is trusted: a socket that keeps failing authentication is slowed down. The key is the socket's own address,
        // never a forwarded-for header.
        const socketAddress = req.socket.remoteAddress ?? "unknown";
        try {
          guard.checkAuthFailures(socketAddress);
        } catch (e) {
          // If the counters are broken, chat fails safe (refused) but the signed read-only monitoring routes stay reachable, so the
          // failure can be seen. Their signature is still verified below.
          const monitoring = route === "/v1/health" || route === "/v1/metrics";
          if (!(monitoring && e instanceof ApiError && e.code === "QUEUE_FULL")) throw e;
        }

        if (expected === "POST" && !String(req.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) {
          throw new ApiError("UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json.");
        }
        const body = await readBody(req, expected === "POST" ? config.maxBodyBytes : 0);

        const verdict = verifyRequest({
          header: (name) => {
            const v = req.headers[name];
            return Array.isArray(v) ? v[0] : v;
          },
          method: req.method ?? "",
          path: route,
          body,
          keys: config.hmacKeys,
          nowMs: now(),
          replay,
        });
        if (!verdict.ok) {
          guard.recordAuthFailure(socketAddress);
          authReason = verdict.reason;
          throw new ApiError("UNAUTHORIZED", "Unauthorized.");
        }
        identityKind = verdict.identity.kind;

        if (route === "/v1/health") {
          await health(res);
          status = 200;
        } else if (route === "/v1/metrics") {
          if (deps.metrics) {
            if (deps.scheduler) deps.metrics.fromScheduler(deps.scheduler.state());
            deps.metrics.setGauge("in_flight", inFlight);
            sendJson(res, 200, deps.metrics.snapshot());
          } else {
            throw new ApiError("NOT_FOUND", "Not found.");
          }
          status = 200;
        } else {
          const identityKey = formatIdentity(verdict.identity);
          guard.checkRequest({ clientIp: verdict.clientIp, identityKey });
          const release = guard.acquire({ clientIp: verdict.clientIp, identityKey });
          try {
            const r = await chat(req, res, body, verdict.identity, verdict.clientIp, requestId, route === "/v1/chat/stream", t0);
            degraded = r.degraded;
            status = 200;
          } finally {
            release();
          }
        }
      } catch (e) {
        const api = toApiError(e);
        errorCode = api.code;
        status = api.status;
        if (!(e as { alreadyResponded?: boolean }).alreadyResponded && !res.headersSent) sendError(res, req, api, requestId);
        else if (!res.writableEnded) res.end();
      } finally {
        inFlight--;
        finish();
      }
    })();
  });

  server.requestTimeout = 30_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;

  return {
    server,
    listen: () =>
      new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(config.port, config.host, () => {
          server.off("error", reject);
          const a = server.address() as AddressInfo;
          resolve({ host: a.address, port: a.port });
        });
      }),
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}
