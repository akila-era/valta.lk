import { z } from "zod";
import type { Identity } from "../auth/hmac";
import { formatIdentity } from "../auth/hmac";
import { MemoryRateStore, RateStoreError, type RateStore } from "../security/rate-limit";
import { inspectAudio, inspectSpeechOutput, type AudioRefusal } from "./audio";
import type { VoiceConfig } from "./config";
import { ProviderError, type SttLang } from "./providers";
import { noVoiceMetrics, type VoiceMetrics } from "./metrics";
import { VoiceBusyError, VoiceDeadlineError, VoiceQueue } from "./queue";
import { cleanText, detectScript, MAX_SPEECH_CHARS, MAX_TRANSCRIPT_CHARS, type SpokenLanguage } from "./text";

/**
 * The two voice routes as PURE handlers: a request (already authenticated by the server, so identity and client IP are the signed ones)
 * goes in, a status, headers and body come out. Nothing here touches HTTP, files or logs. The audit record in every answer holds only
 * counts and codes: never audio, never text.
 *
 * Voice is an input and output skin on the normal chat route: a transcript is returned to the shopper to read and edit, and enters the
 * assistant only as an ordinary chat message. There is no voice-specific conversation, memory or tool path.
 */
export const VOICE_VERSION = "1";

export const VOICE_ROUTES = Object.freeze({
  "/v1/voice/transcribe": { method: "POST", maxBodyBytes: 5_000_000, kind: "audio" },
  "/v1/voice/speak": { method: "POST", maxBodyBytes: 8_000, kind: "json" },
} as const);
export type VoiceRoute = keyof typeof VOICE_ROUTES;
export const isVoiceRoute = (route: string): route is VoiceRoute => Object.hasOwn(VOICE_ROUTES, route);

export interface VoiceRequest {
  route: VoiceRoute;
  /** The raw body. The handler overwrites it with zeros when it is done (audio is never kept). */
  body: Buffer;
  identity: Identity;
  clientIp: string;
  requestId: string;
  /** Value of the `x-volta-voice-lang` header, if any. Not signed; validated against a fixed list. */
  langHeader?: string | undefined;
}

export interface VoiceAudit {
  route: VoiceRoute;
  outcome: string;
  status: number;
  bytesIn: number;
  audioMs?: number;
  provider: string;
}

export interface VoiceResponse {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
  audit: VoiceAudit;
}

const NO_STORE = { "cache-control": "no-store", "x-content-type-options": "nosniff" };

type Plain = { code: string; message: string; status: number; retryAfterSec?: number; extra?: Record<string, unknown> };

const AUDIO_REFUSALS: Record<AudioRefusal, Plain> = {
  empty: { code: "INVALID_AUDIO", message: "No audio was received.", status: 422 },
  too_large: { code: "PAYLOAD_TOO_LARGE", message: "The recording is too large.", status: 413 },
  too_short: { code: "AUDIO_TOO_SHORT", message: "The recording is too short.", status: 422 },
  too_long: { code: "AUDIO_TOO_LONG", message: "The recording is too long.", status: 422 },
  unrecognised: { code: "UNSUPPORTED_AUDIO", message: "This audio format is not supported.", status: 415 },
  unsupported_codec: { code: "UNSUPPORTED_AUDIO", message: "This audio format is not supported.", status: 415 },
  malformed: { code: "INVALID_AUDIO", message: "The recording could not be read.", status: 422 },
  truncated: { code: "INVALID_AUDIO", message: "The recording is incomplete.", status: 422 },
  trailing_data: { code: "INVALID_AUDIO", message: "The recording could not be read.", status: 422 },
};

class RateLimited extends Error {
  constructor(readonly retryAfterSec: number) {
    super("limited");
  }
}

/** Per-caller limits (client IP, and customer id for customers) using the same sliding-window store as the chat limits. Fails closed. */
export class VoiceLimiter {
  constructor(private readonly store: RateStore, private readonly now: () => number, private readonly limits: VoiceConfig["limits"]) {}

  private hit(key: string, limit: number, windowMs: number): void {
    const t = this.now();
    const r = this.store.hit(key, windowMs, t);
    if (r.count > limit) throw new RateLimited(Math.max(1, Math.ceil((r.oldestAt + windowMs - t) / 1000)));
  }

  check(kind: "stt" | "tts", identityKey: string, clientIp: string): void {
    const perMin = kind === "stt" ? this.limits.sttPerMin : this.limits.ttsPerMin;
    this.hit(`voice:${kind}:ip:${clientIp}`, perMin, 60_000);
    if (identityKey.startsWith("cust:")) this.hit(`voice:${kind}:id:${identityKey}`, perMin, 60_000);
    if (kind === "stt") this.hit(`voice:stt:h:${identityKey.startsWith("cust:") ? identityKey : `ip:${clientIp}`}`, this.limits.sttPerHour, 3_600_000);
  }
}

const SpeakBody = z.object({ text: z.string().min(1).max(MAX_SPEECH_CHARS * 4), lang: z.enum(["en", "si"]) }).strict();

function languageOf(engine: string | undefined, text: string): SpokenLanguage {
  const script = detectScript(text);
  if (script === "si" || script === "mixed") return script;
  const e = (engine ?? "").toLowerCase();
  if (e === "si" || e === "sinhala" || e === "sinhalese") return "si"; // the engine heard Sinhala but wrote Latin letters
  if (script === "en") return "en";
  return "unknown";
}

export interface VoiceServiceOptions {
  now?: () => number;
  store?: RateStore;
  /** Per-job deadline for the engine. */
  deadlineMs?: number;
  /** Hooks for counters and latencies (codes and durations only). Defaults to no-ops. */
  metrics?: VoiceMetrics;
}

/** The engine's own deadline is the abort signal; the queue gives a provider that ignores it this much extra time before taking the slot back. */
const DEADLINE_GRACE_MS = 1_000;
/** Tolerance when comparing the length an engine reports with the cap (decoders round and add padding). */
const REPORTED_DURATION_SLACK_MS = 500;

export class VoiceService {
  private readonly queue: VoiceQueue;
  private readonly limiter: VoiceLimiter;
  private readonly deadlineMs: number;
  private readonly metrics: VoiceMetrics;
  private readonly clock: () => number;

  constructor(private readonly config: VoiceConfig, opts: VoiceServiceOptions = {}) {
    this.metrics = opts.metrics ?? noVoiceMetrics;
    this.clock = opts.now ?? Date.now;
    this.queue = new VoiceQueue(config.concurrency, config.queueDepth);
    this.limiter = new VoiceLimiter(opts.store ?? new MemoryRateStore({ maxKeys: 10_000 }), opts.now ?? Date.now, config.limits);
    this.deadlineMs = opts.deadlineMs ?? 25_000;
  }

  /** Which features are configured; safe to expose (names only). */
  capabilities(): { stt: boolean; tts: boolean; ttsLanguages: Array<"en" | "si"> } {
    return { stt: this.config.stt.name !== "none", tts: this.config.tts.name !== "none", ttsLanguages: (["en", "si"] as const).filter((l) => this.config.tts.supports(l)) };
  }

  /** How many request bodies may be read at the same time before authentication: the worker slots, the queue and two spare. */
  uploadBudget(): number {
    return this.config.concurrency + this.config.queueDepth + 2;
  }

  queueState(): { running: number; waiting: number } {
    return this.queue.state();
  }

  /** Never throws. Whatever happens, the request body is overwritten with zeros before this returns. */
  async handle(req: VoiceRequest): Promise<VoiceResponse> {
    const out = await this.handleUnmetered(req);
    const failed = out.status >= 400;
    this.metrics.request(req.route, out.status, failed ? out.audit.outcome : undefined);
    if (failed && out.status !== 501 && out.status < 500) this.metrics.rejected(out.audit.outcome);
    else if (out.status === 503 || out.status === 504) this.metrics.rejected(out.audit.outcome);
    return out;
  }

  private async handleUnmetered(req: VoiceRequest): Promise<VoiceResponse> {
    const bytesIn = req.body.length;
    const provider = req.route === "/v1/voice/transcribe" ? this.config.stt.name : this.config.tts.name;
    const audit = (outcome: string, status: number, audioMs?: number): VoiceAudit => ({ route: req.route, outcome, status, bytesIn, provider, ...(audioMs !== undefined ? { audioMs } : {}) });
    const fail = (p: Plain): VoiceResponse => ({
      status: p.status,
      headers: { "content-type": "application/json; charset=utf-8", ...NO_STORE, ...(p.retryAfterSec !== undefined ? { "retry-after": String(p.retryAfterSec) } : {}) },
      body: Buffer.from(JSON.stringify({ error: { code: p.code, message: p.message, requestId: req.requestId, ...(p.retryAfterSec !== undefined ? { retryAfterSec: p.retryAfterSec } : {}), ...(p.extra ?? {}) } })),
      audit: audit(p.code, p.status),
    });
    try {
      return req.route === "/v1/voice/transcribe" ? await this.transcribe(req, fail, audit) : await this.speak(req, fail, audit);
    } catch (e) {
      if (e instanceof RateLimited) return fail({ code: "RATE_LIMITED", message: "Too many voice requests. Please wait a moment.", status: 429, retryAfterSec: e.retryAfterSec });
      if (e instanceof VoiceBusyError) return fail({ code: "QUEUE_FULL", message: "The voice service is busy. Please try again shortly.", status: 503, retryAfterSec: e.retryAfterSec });
      if (e instanceof VoiceDeadlineError) return fail({ code: "TIMEOUT", message: "The voice service took too long.", status: 504 });
      if (e instanceof RateStoreError) return fail({ code: "QUEUE_FULL", message: "The voice service is busy. Please try again shortly.", status: 503, retryAfterSec: 5 });
      if (e instanceof ProviderError) {
        if (e.kind === "unsupported") return fail({ code: "VOICE_UNAVAILABLE", message: "Voice is not available.", status: 501 });
        if (e.kind === "timeout") return fail({ code: "TIMEOUT", message: "The voice service took too long.", status: 504 });
        if (e.kind === "bad_output") return fail({ code: "UPSTREAM_ERROR", message: "The voice service could not complete the request.", status: 502 });
        return fail({ code: "AI_UNAVAILABLE", message: "The voice service is temporarily unavailable.", status: 503, retryAfterSec: 10 });
      }
      return fail({ code: "INTERNAL", message: "Internal error.", status: 500 });
    } finally {
      req.body.fill(0);
    }
  }

  private async transcribe(req: VoiceRequest, fail: (p: Plain) => VoiceResponse, audit: (o: string, s: number, ms?: number) => VoiceAudit): Promise<VoiceResponse> {
    if (this.config.stt.name === "none") return fail({ code: "VOICE_UNAVAILABLE", message: "Voice input is not available.", status: 501 });
    this.limiter.check("stt", formatIdentity(req.identity), req.clientIp);

    const lang = (req.langHeader ?? "auto").trim().toLowerCase();
    if (lang !== "auto" && lang !== "en" && lang !== "si") return fail({ code: "VALIDATION_FAILED", message: "The request is not valid.", status: 422 });

    const check = inspectAudio(req.body, { maxBytes: this.config.maxBytes, maxSeconds: this.config.maxSeconds });
    if (!check.ok) return fail(AUDIO_REFUSALS[check.reason]);
    if (check.silent) return fail({ code: "NO_SPEECH", message: "No speech was heard. Please try again.", status: 422 });

    const queuedAt = this.clock();
    const out = await this.queue.run(async () => {
      const startedAt = this.clock();
      this.metrics.queueWait(Math.max(0, startedAt - queuedAt));
      try {
        return await this.config.stt.transcribe({ audio: req.body, format: check.format, lang: lang as SttLang, signal: AbortSignal.timeout(this.deadlineMs) });
      } finally {
        this.metrics.engineLatency("stt", Math.max(0, this.clock() - startedAt));
      }
    }, this.deadlineMs + DEADLINE_GRACE_MS);
    // The length cap is also enforced on what the ENGINE says it decoded: a header can lie, the decoder's own count is the second opinion.
    if (out.durationMs !== undefined && out.durationMs > this.config.maxSeconds * 1000 + REPORTED_DURATION_SLACK_MS) return fail(AUDIO_REFUSALS.too_long);
    const text = cleanText(out.text, MAX_TRANSCRIPT_CHARS);
    if (text === "") return fail({ code: "NO_SPEECH", message: "No speech was heard. Please try again.", status: 422 });
    const body = Buffer.from(JSON.stringify({ voiceVersion: VOICE_VERSION, text, language: languageOf(out.language, text), durationMs: check.durationMs, requestId: req.requestId }));
    return { status: 200, headers: { "content-type": "application/json; charset=utf-8", ...NO_STORE }, body, audit: audit("ok", 200, check.durationMs ?? undefined) };
  }

  private async speak(req: VoiceRequest, fail: (p: Plain) => VoiceResponse, audit: (o: string, s: number, ms?: number) => VoiceAudit): Promise<VoiceResponse> {
    if (this.config.tts.name === "none") return fail({ code: "VOICE_UNAVAILABLE", message: "Spoken replies are not available.", status: 501, extra: { fallback: "browser" } });
    this.limiter.check("tts", formatIdentity(req.identity), req.clientIp);

    let parsed: z.infer<typeof SpeakBody>;
    try {
      const r = SpeakBody.safeParse(JSON.parse(req.body.toString("utf8")));
      if (!r.success) return fail({ code: "VALIDATION_FAILED", message: "The request is not valid.", status: 422 });
      parsed = r.data;
    } catch {
      return fail({ code: "INVALID_REQUEST", message: "The request body is not valid JSON.", status: 400 });
    }
    const text = cleanText(parsed.text, MAX_SPEECH_CHARS);
    if (text === "") return fail({ code: "VALIDATION_FAILED", message: "The request is not valid.", status: 422 });
    if (!this.config.tts.supports(parsed.lang)) return fail({ code: "VOICE_LANGUAGE_UNSUPPORTED", message: "No voice is available for this language.", status: 501, extra: { fallback: "browser" } });

    const queuedAt = this.clock();
    const out = await this.queue.run(async () => {
      const startedAt = this.clock();
      this.metrics.queueWait(Math.max(0, startedAt - queuedAt));
      try {
        return await this.config.tts.synthesize({ text, lang: parsed.lang, signal: AbortSignal.timeout(this.deadlineMs) });
      } finally {
        this.metrics.engineLatency("tts", Math.max(0, this.clock() - startedAt));
      }
    }, this.deadlineMs + DEADLINE_GRACE_MS);
    const check = inspectSpeechOutput(out.audio); // the engine's own label is ignored: the bytes decide
    if (!check.ok) throw new ProviderError("bad_output");
    return { status: 200, headers: { "content-type": check.contentType, "content-length": String(out.audio.length), ...NO_STORE, "x-voice-duration-ms": String(check.durationMs) }, body: out.audio, audit: audit("ok", 200, check.durationMs) };
  }
}

/**
 * What the Agent server needs to mount voice. See docs/VOLTA_VOICE_IMPLEMENTATION_REPORT.md ("Wiring") for the lines to add.
 */
export function registerVoiceRoutes(config: VoiceConfig, opts: VoiceServiceOptions = {}): { routes: typeof VOICE_ROUTES; service: VoiceService; handle: (r: VoiceRequest) => Promise<VoiceResponse> } {
  const service = new VoiceService(config, opts);
  return { routes: VOICE_ROUTES, service, handle: (r) => service.handle(r) };
}
