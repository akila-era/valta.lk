import type { IncomingMessage, ServerResponse } from "node:http";
import { ReplayCache as ScratchReplay, verifyRequest, type ReplayCache } from "../auth/hmac";
import type { AbuseGuard } from "../security/rate-limit";
import { isVoiceRoute, VOICE_ROUTES, type VoiceAudit, type VoiceService } from "./service";

/**
 * Serves one voice request on the Agent's HTTP server with the SAME authentication as chat (HMAC over the raw body, replay cache,
 * slow-down of sockets that keep failing). The only differences from chat are what voice needs: a binary body with its own cap (read as a
 * stream and cut off the moment it passes the cap), and no JSON content-type requirement for audio.
 *
 * The server calls this for any path where `isVoiceRoute(path)` is true and uses the returned record for its own request log. The
 * record holds codes and counts only.
 */
export interface ServeVoiceInput {
  req: IncomingMessage;
  res: ServerResponse;
  route: string;
  requestId: string;
  voice: VoiceService;
  keys: ReadonlyMap<string, string>;
  replay: ReplayCache;
  guard: AbuseGuard;
  now: () => number;
  /** Test seams: how long a whole body may take and how long it may pause. Default to BODY_DEADLINE_MS and BODY_IDLE_MS. */
  bodyDeadlineMs?: number;
  bodyIdleMs?: number;
}

export interface ServeVoiceResult {
  status: number;
  errorCode?: string;
  authReason?: string;
  identityKind: "guest" | "customer" | "none";
  audit?: VoiceAudit;
}

const HEADERS = { "cache-control": "no-store", "x-content-type-options": "nosniff" };

/**
 * Pre-authentication limits (VO-02). The HMAC covers the body hash, so the body has to be read before the signature can be fully
 * checked; these limits bound what an unauthenticated caller can make the server hold:
 *  1. the headers are checked FIRST (known key id, fresh timestamp, well-formed nonce, signature, identity and address): a request that
 *     fails any of them never has its body read at all;
 *  2. only a small number of bodies may be read at once (the voice capacity plus two), the rest are refused with 503 at once;
 *  3. the whole body must arrive within BODY_DEADLINE_MS and no pause between chunks may exceed BODY_IDLE_MS: a slow or stalled upload
 *     is answered 408 and its connection dropped;
 *  4. the slot is released on every path (finished, refused, aborted, timed out, error).
 * What this cannot do: a caller who knows a valid key id and sends well-formed headers can still occupy the few slots for up to the
 * deadline. That is bounded (a few slots, seconds) and, behind the website, the Agent only listens on loopback.
 */
export const BODY_DEADLINE_MS = 10_000;
export const BODY_IDLE_MS = 3_000;

class UploadBudget {
  private active = 0;
  constructor(readonly limit: number) {}
  tryAcquire(): (() => void) | null {
    if (this.active >= this.limit) return null;
    this.active++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active--;
    };
  }
  inUse(): number {
    return this.active;
  }
}
const budgets = new WeakMap<VoiceService, UploadBudget>();
function budgetFor(voice: VoiceService): UploadBudget {
  let b = budgets.get(voice);
  if (!b) {
    b = new UploadBudget(voice.uploadBudget());
    budgets.set(voice, b);
  }
  return b;
}
/** Test and operations hook: how many request bodies are being read before authentication right now. A count only. */
export const uploadsInProgress = (voice: VoiceService): number => budgets.get(voice)?.inUse() ?? 0;

type PreAuth = { ok: true } | { ok: false; reason: string };

/**
 * Everything verifyRequest checks before the signature (headers present and well formed, known key id, clock), run on the headers alone.
 * With an empty body a correctly formed request can only fail at the signature step, so "BAD_SIGNATURE" here means "worth reading".
 */
function preAuthenticate(req: IncomingMessage, route: string, keys: ReadonlyMap<string, string>, nowMs: number): PreAuth {
  const verdict = verifyRequest({
    header: (name) => {
      const v = req.headers[name];
      return Array.isArray(v) ? v[0] : v;
    },
    method: req.method ?? "",
    path: route,
    body: Buffer.alloc(0),
    keys,
    nowMs,
    replay: new ScratchReplay(), // a throw-away cache: the real nonce is only consumed after the full signature check
  });
  if (verdict.ok || verdict.reason === "BAD_SIGNATURE") return { ok: true };
  return { ok: false, reason: verdict.reason };
}

function sendError(res: ServerResponse, status: number, code: string, message: string, requestId: string, extra: Record<string, string> = {}): void {
  const body = JSON.stringify({ error: { code, message, requestId } });
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(body), ...HEADERS, ...extra });
  res.end(body);
}

/** Answer, then drop the connection after a short grace so the client can still read the answer instead of seeing a reset. */
function sendErrorAndClose(res: ServerResponse, req: IncomingMessage, graceMs: number, status: number, code: string, message: string, requestId: string, extra: Record<string, string> = {}): void {
  res.once("finish", () => setTimeout(() => req.socket.destroy(), graceMs).unref());
  sendError(res, status, code, message, requestId, { connection: "close", ...extra });
}

class TooLarge extends Error {}
class SlowBody extends Error {}

function readCapped(req: IncomingMessage, max: number, deadlineMs: number, idleMs: number): Promise<Buffer> {
  const declared = Number(req.headers["content-length"]);
  if (Number.isFinite(declared) && declared > max) {
    req.resume(); // discard the incoming body as it arrives (never buffered) so the client can still read the 413
    return Promise.reject(new TooLarge());
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    let idle: ReturnType<typeof setTimeout> | undefined;
    const settle = (outcome: () => void, keep = false): void => {
      if (settled) return;
      settled = true;
      clearTimeout(overall);
      if (idle) clearTimeout(idle);
      if (!keep) chunks.length = 0; // drop whatever was buffered at once on any failure
      outcome();
    };
    const overall = setTimeout(() => settle(() => reject(new SlowBody())), deadlineMs);
    const armIdle = (): void => {
      if (idle) clearTimeout(idle);
      idle = setTimeout(() => settle(() => reject(new SlowBody())), idleMs);
    };
    armIdle();
    req.on("data", (c: Buffer) => {
      if (settled) return;
      size += c.length;
      if (size > max) {
        settle(() => reject(new TooLarge()));
        return;
      }
      chunks.push(c);
      armIdle();
    });
    req.on("end", () => settle(() => resolve(Buffer.concat(chunks)), true));
    req.on("error", (e) => settle(() => reject(e)));
    req.on("close", () => settle(() => reject(new Error("closed"))));
  });
}

export async function serveVoice(i: ServeVoiceInput): Promise<ServeVoiceResult> {
  const { req, res, route, requestId } = i;
  const result = (status: number, errorCode: string | undefined, extra: Partial<ServeVoiceResult> = {}): ServeVoiceResult => ({ status, ...(errorCode ? { errorCode } : {}), identityKind: "none", ...extra });
  if (!isVoiceRoute(route)) {
    sendError(res, 404, "NOT_FOUND", "Not found.", requestId);
    return result(404, "NOT_FOUND");
  }
  const spec = VOICE_ROUTES[route];
  if (req.method !== spec.method) {
    sendError(res, 405, "METHOD_NOT_ALLOWED", "Method not allowed.", requestId, { allow: spec.method });
    return result(405, "METHOD_NOT_ALLOWED");
  }
  const socketAddress = req.socket.remoteAddress ?? "unknown";
  try {
    i.guard.checkAuthFailures(socketAddress);
  } catch {
    sendError(res, 429, "RATE_LIMITED", "Too many requests. Please slow down.", requestId, { "retry-after": "60" });
    return result(429, "RATE_LIMITED");
  }
  if (spec.kind === "json" && !String(req.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) {
    sendError(res, 415, "UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json.", requestId);
    return result(415, "UNSUPPORTED_MEDIA_TYPE");
  }

  // Headers first: a request that cannot possibly authenticate never has its body read.
  const early = preAuthenticate(req, route, i.keys, i.now());
  if (!early.ok) {
    i.guard.recordAuthFailure(socketAddress);
    sendErrorAndClose(res, req, 1_000, 401, "UNAUTHORIZED", "Unauthorized.", requestId);
    return result(401, "UNAUTHORIZED", { authReason: early.reason });
  }
  // Only a few bodies may be read at the same time; the rest are refused before anything is buffered.
  const release = budgetFor(i.voice).tryAcquire();
  if (!release) {
    sendErrorAndClose(res, req, 1_000, 503, "QUEUE_FULL", "The voice service is busy. Please try again shortly.", requestId, { "retry-after": "5" });
    return result(503, "QUEUE_FULL");
  }

  let body: Buffer;
  try {
    body = await readCapped(req, spec.maxBodyBytes, i.bodyDeadlineMs ?? BODY_DEADLINE_MS, i.bodyIdleMs ?? BODY_IDLE_MS);
  } catch (e) {
    if (e instanceof SlowBody) {
      sendErrorAndClose(res, req, 200, 408, "REQUEST_TIMEOUT", "The upload was too slow.", requestId);
      return result(408, "REQUEST_TIMEOUT");
    }
    if (e instanceof TooLarge) {
      // Answer at once; the rest of the upload is discarded as it arrives (never buffered) and the connection is dropped after a short grace.
      sendErrorAndClose(res, req, 1_000, 413, "PAYLOAD_TOO_LARGE", "The request is too large.", requestId);
      return result(413, "PAYLOAD_TOO_LARGE");
    }
    sendError(res, 400, "INVALID_REQUEST", "The request could not be read.", requestId);
    return result(400, "INVALID_REQUEST");
  } finally {
    release(); // the unauthenticated read is over, whatever happened: the slot goes back at once
  }

  try {
    const verdict = verifyRequest({
      header: (name) => {
        const v = req.headers[name];
        return Array.isArray(v) ? v[0] : v;
      },
      method: req.method ?? "",
      path: route,
      body,
      keys: i.keys,
      nowMs: i.now(),
      replay: i.replay,
    });
    if (!verdict.ok) {
      i.guard.recordAuthFailure(socketAddress);
      sendError(res, 401, "UNAUTHORIZED", "Unauthorized.", requestId);
      return result(401, "UNAUTHORIZED", { authReason: verdict.reason });
    }
    const langHeader = req.headers["x-volta-voice-lang"];
    const out = await i.voice.handle({ route, body, identity: verdict.identity, clientIp: verdict.clientIp, requestId, langHeader: Array.isArray(langHeader) ? langHeader[0] : langHeader });
    res.writeHead(out.status, { ...out.headers, "content-length": String(out.body.length) });
    res.end(out.body);
    return result(out.status, out.status >= 400 ? out.audit.outcome : undefined, { identityKind: verdict.identity.kind, audit: out.audit });
  } finally {
    body.fill(0); // audio is never kept (the handler also zeroes it; this covers an authentication failure)
  }
}
