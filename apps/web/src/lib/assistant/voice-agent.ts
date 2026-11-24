import "server-only";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { isIP } from "node:net";
import { UNIDENTIFIED_CLIENT_ADDRESS } from "./client-address";
import type { AssistantConfig } from "./config";
import { identityClaim, type AgentIdentity } from "./sign";

/**
 * Server-side helpers shared by the two voice routes. Audio passes through here in memory only: it is never written anywhere and is
 * overwritten once the Agent has answered. Nothing from the audio or the transcript is logged.
 */
export const MAX_AUDIO_BYTES = 5_000_000;
export const MAX_SPEECH_REQUEST_BYTES = 8_000;
export const MAX_SPEECH_CHARS = 1_600;
const MAX_AGENT_JSON_BYTES = 20_000;

/** Same canonical string as signAgentRequest, but the body is raw bytes (audio must not pass through a string). */
export function signAgentBytes(p: { keyId: string; secret: string; method: string; path: string; identity: AgentIdentity; clientIp: string; body: Uint8Array; nowMs?: number; nonce?: string }): Record<string, string> {
  const timestamp = String(Math.floor((p.nowMs ?? Date.now()) / 1000));
  const nonce = p.nonce ?? randomBytes(16).toString("hex");
  const identity = identityClaim(p.identity);
  const bodySha = createHash("sha256").update(p.body).digest("hex");
  const canonical = [timestamp, nonce, p.method.toUpperCase(), p.path, identity, p.clientIp, bodySha].join("\n");
  return {
    "x-volta-key-id": p.keyId,
    "x-volta-timestamp": timestamp,
    "x-volta-nonce": nonce,
    "x-volta-identity": identity,
    "x-volta-client-ip": p.clientIp,
    "x-volta-signature": createHmac("sha256", p.secret).update(canonical).digest("hex"),
  };
}

export class BodyTooLarge extends Error {}

/** Reads a request body as a stream and stops the moment it passes `max` (the rest is never read). */
export async function readBodyCapped(req: Request, max: number): Promise<Buffer> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > max) throw new BodyTooLarge();
  return readStreamCapped(req.body, max);
}

export async function readStreamCapped(body: ReadableStream<Uint8Array> | null, max: number): Promise<Buffer> {
  if (!body) return Buffer.alloc(0);
  const reader = body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) {
        chunks.length = 0;
        await reader.cancel().catch(() => {});
        throw new BodyTooLarge();
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock?.();
  }
  return Buffer.concat(chunks);
}

/**
 * A cheap first look at the first bytes (wav, ogg, webm/matroska, mp4). The Agent does the real structural check; this only avoids
 * sending obviously unrelated uploads (images, HTML, archives) over the tunnel. The browser's Content-Type is not consulted.
 */
export function looksLikeAudio(b: Uint8Array): boolean {
  if (b.length < 12) return false;
  const s = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
  if (s(0, 4) === "RIFF" && s(8, 12) === "WAVE") return true;
  if (s(0, 4) === "OggS") return true;
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return true;
  if (s(4, 8) === "ftyp") return true;
  return false;
}

/** True for an MP3 (ID3 tag or frame sync) or a WAV: the only things the speak route may return to a browser. */
export function audioKindOf(b: Uint8Array): "audio/wav" | "audio/mpeg" | null {
  if (b.length < 12) return null;
  const s = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
  if (s(0, 4) === "RIFF" && s(8, 12) === "WAVE") return "audio/wav";
  if (s(0, 3) === "ID3" || (b[0] === 0xff && ((b[1] ?? 0) & 0xe0) === 0xe0)) return "audio/mpeg";
  return null;
}

/** The address the Agent keys its limits on. An unusable one gets the ONE reserved address (same policy as the chat route), never the all-zero address. */
export const guestOrCustomerIp = (raw: string): string => (isIP(raw) !== 0 ? raw : UNIDENTIFIED_CLIENT_ADDRESS);

export type AgentVoiceReply = { ok: true; status: number; body: Buffer; contentType: string } | { ok: false; reason: "network" | "too_large" } | { ok: false; reason: "agent"; status: number; code: string; retryAfterSec?: number };

/** One signed call to the Agent's voice route. Redirects are refused; the answer is size capped. */
export async function callAgentVoice(cfg: AssistantConfig, p: { path: "/v1/voice/transcribe" | "/v1/voice/speak"; body: Buffer; contentType: string; identity: AgentIdentity; clientIp: string; lang?: string; maxReplyBytes: number; fetchImpl?: typeof fetch }): Promise<AgentVoiceReply> {
  const f = p.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await f(new URL(p.path, cfg.agentUrl), {
      method: "POST",
      headers: { "content-type": p.contentType, ...(p.lang ? { "x-volta-voice-lang": p.lang } : {}), ...signAgentBytes({ keyId: cfg.keyId, secret: cfg.secret, method: "POST", path: p.path, identity: p.identity, clientIp: p.clientIp, body: p.body }) },
      body: new Uint8Array(p.body),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(Math.min(cfg.timeoutMs, 45_000)),
    });
  } catch {
    return { ok: false, reason: "network" };
  }
  const contentType = res.headers.get("content-type") ?? "";
  const cap = res.ok ? p.maxReplyBytes : MAX_AGENT_JSON_BYTES;
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > cap) return { ok: false, reason: "too_large" };
  let body: Buffer;
  try {
    body = await readStreamCapped(res.body, cap);
  } catch {
    return { ok: false, reason: "too_large" };
  }
  if (res.ok) return { ok: true, status: res.status, body, contentType };
  let code = "UPSTREAM_ERROR";
  try {
    const c = (JSON.parse(body.toString("utf8")) as { error?: { code?: unknown } }).error?.code;
    if (typeof c === "string" && /^[A-Z_]{3,40}$/.test(c)) code = c;
  } catch {
    // keep the generic code
  }
  const retry = Number(res.headers.get("retry-after"));
  return { ok: false, reason: "agent", status: res.status, code, ...(Number.isFinite(retry) && retry > 0 ? { retryAfterSec: Math.min(300, Math.ceil(retry)) } : {}) };
}

/** The shopper-facing answer for an Agent refusal. Wording is fixed here; nothing from the Agent's message is forwarded. */
export function voiceFailure(r: Extract<AgentVoiceReply, { ok: false }>): { status: number; code: string; message: string; retryAfterSec?: number } {
  if (r.reason !== "agent") return { status: 503, code: "ASSISTANT_UNAVAILABLE", message: "Voice is not available right now. Please type your message." };
  switch (r.status) {
    case 501:
      return { status: 501, code: "VOICE_UNAVAILABLE", message: "Voice is not available yet." };
    case 413:
      return { status: 413, code: "PAYLOAD_TOO_LARGE", message: "The recording is too large." };
    case 415:
      return { status: 415, code: "UNSUPPORTED_AUDIO", message: "This audio format is not supported." };
    case 422: {
      const known: Record<string, string> = { INVALID_AUDIO: "The recording could not be read.", AUDIO_TOO_SHORT: "The recording is too short.", AUDIO_TOO_LONG: "The recording is too long.", NO_SPEECH: "No speech was heard. Please try again." };
      return { status: 422, code: known[r.code] ? r.code : "INVALID", message: known[r.code] ?? "That request could not be processed." };
    }
    case 429:
      return { status: 429, code: "RATE_LIMITED", message: "Too many voice requests. Please wait a moment.", ...(r.retryAfterSec ? { retryAfterSec: r.retryAfterSec } : {}) };
    default:
      return { status: 503, code: "ASSISTANT_UNAVAILABLE", message: "Voice is not available right now. Please type your message.", ...(r.retryAfterSec ? { retryAfterSec: r.retryAfterSec } : {}) };
  }
}
