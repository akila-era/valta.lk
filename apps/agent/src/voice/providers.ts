import { isLoopbackHost } from "../config";
import type { AudioFormat } from "./audio";
import { inspectSpeechOutput } from "./audio";
import { cleanText, MAX_TRANSCRIPT_CHARS } from "./text";

export type SttLang = "auto" | "en" | "si";
export type TtsLang = "en" | "si";

export interface SttProvider {
  readonly name: string;
  /** `durationMs` is the length of audio the engine says it decoded (when it reports one): the service enforces the length cap on it too. */
  transcribe(a: { audio: Buffer; format: AudioFormat; lang: SttLang; signal: AbortSignal }): Promise<{ text: string; language?: string; durationMs?: number }>;
}

export interface TtsProvider {
  readonly name: string;
  supports(lang: TtsLang): boolean;
  synthesize(a: { text: string; lang: TtsLang; signal: AbortSignal }): Promise<{ audio: Buffer; contentType: string }>;
}

/** What a provider can fail with. Messages never contain audio or text. */
export class ProviderError extends Error {
  constructor(readonly kind: "unavailable" | "timeout" | "bad_output" | "unsupported") {
    super(kind);
    this.name = "ProviderError";
  }
}

/** The default: nothing is configured, so every voice route answers "not available". */
export const noSttProvider: SttProvider = {
  name: "none",
  async transcribe() {
    throw new ProviderError("unsupported");
  },
};
export const noTtsProvider: TtsProvider = {
  name: "none",
  supports: () => false,
  async synthesize() {
    throw new ProviderError("unsupported");
  },
};

const MAX_ENGINE_JSON_BYTES = 200_000;

/** Loopback only, no credentials; an engine is never reached over a network. */
export function validateLoopbackUrl(raw: string | undefined, name: string, issues: string[]): URL | null {
  if (!raw || raw.trim() === "") {
    issues.push(`${name} is required when its provider is "http".`);
    return null;
  }
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "http:") issues.push(`${name} must use http (loopback only).`);
    else if (!isLoopbackHost(u.hostname)) issues.push(`${name} must point to a loopback address; speech engines are never reached over a network.`);
    else if (u.username || u.password) issues.push(`${name} must not contain credentials.`);
    else return new URL(u.origin);
  } catch {
    issues.push(`${name} is not a valid URL.`);
  }
  return null;
}

async function readCapped(res: Response, max: number): Promise<Buffer> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > max) throw new ProviderError("bad_output");
  if (!res.body) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  let size = 0;
  const reader = res.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) {
        await reader.cancel().catch(() => {});
        throw new ProviderError("bad_output");
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock?.();
  }
  return Buffer.concat(chunks);
}

const asProviderError = (e: unknown): ProviderError => {
  if (e instanceof ProviderError) return e;
  if (e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError")) return new ProviderError("timeout");
  return new ProviderError("unavailable");
};

const FILE_EXT: Record<AudioFormat, { name: string; type: string }> = {
  wav: { name: "audio.wav", type: "audio/wav" },
  webm: { name: "audio.webm", type: "audio/webm" },
  ogg: { name: "audio.ogg", type: "audio/ogg" },
  mp4: { name: "audio.m4a", type: "audio/mp4" },
};

export interface HttpSttOptions {
  baseUrl: URL;
  /** Passed through to the engine as the "model" field when set. Never defaulted here: the operator chooses. */
  model?: string | undefined;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}

/** OpenAI-compatible transcription server on loopback (faster-whisper-server, whisper.cpp server, and similar). */
export class HttpSttProvider implements SttProvider {
  readonly name = "http";
  constructor(private readonly o: HttpSttOptions) {}

  async transcribe(a: { audio: Buffer; format: AudioFormat; lang: SttLang; signal: AbortSignal }): Promise<{ text: string; language?: string; durationMs?: number }> {
    const f = this.o.fetchImpl ?? fetch;
    const form = new FormData();
    const file = FILE_EXT[a.format];
    form.set("file", new Blob([new Uint8Array(a.audio)], { type: file.type }), file.name); // a fixed file name: nothing from the client reaches the engine
    if (this.o.model) form.set("model", this.o.model);
    if (a.lang !== "auto") form.set("language", a.lang);
    form.set("response_format", "verbose_json");
    form.set("temperature", "0");
    try {
      const res = await f(new URL("/v1/audio/transcriptions", this.o.baseUrl), { method: "POST", body: form, redirect: "error", signal: AbortSignal.any([a.signal, AbortSignal.timeout(this.o.timeoutMs)]) });
      if (!res.ok) throw new ProviderError("unavailable");
      const raw = await readCapped(res, MAX_ENGINE_JSON_BYTES);
      let data: unknown;
      try {
        data = JSON.parse(raw.toString("utf8"));
      } catch {
        throw new ProviderError("bad_output");
      }
      const d = data as { text?: unknown; language?: unknown; duration?: unknown } | null;
      if (!d || typeof d.text !== "string") throw new ProviderError("bad_output");
      // OpenAI-compatible verbose_json reports the decoded length in seconds; anything that is not a sane number is ignored, never trusted.
      const durationMs = typeof d.duration === "number" && Number.isFinite(d.duration) && d.duration >= 0 && d.duration < 100_000 ? Math.round(d.duration * 1000) : undefined;
      return { text: cleanText(d.text, MAX_TRANSCRIPT_CHARS), ...(typeof d.language === "string" ? { language: d.language.slice(0, 20) } : {}), ...(durationMs !== undefined ? { durationMs } : {}) };
    } catch (e) {
      throw asProviderError(e);
    }
  }
}

export interface HttpTtsOptions {
  baseUrl: URL;
  model?: string | undefined;
  voices: { en?: string | undefined; si?: string | undefined };
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}

/** OpenAI-compatible speech server on loopback. A language is "supported" only when the operator configured a voice for it. */
export class HttpTtsProvider implements TtsProvider {
  readonly name = "http";
  constructor(private readonly o: HttpTtsOptions) {}

  supports(lang: TtsLang): boolean {
    return Boolean(this.o.voices[lang]);
  }

  async synthesize(a: { text: string; lang: TtsLang; signal: AbortSignal }): Promise<{ audio: Buffer; contentType: string }> {
    const voice = this.o.voices[a.lang];
    if (!voice) throw new ProviderError("unsupported");
    const f = this.o.fetchImpl ?? fetch;
    try {
      const res = await f(new URL("/v1/audio/speech", this.o.baseUrl), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...(this.o.model ? { model: this.o.model } : {}), voice, input: a.text, response_format: "wav" }),
        redirect: "error",
        signal: AbortSignal.any([a.signal, AbortSignal.timeout(this.o.timeoutMs)]),
      });
      if (!res.ok) throw new ProviderError("unavailable");
      const audio = await readCapped(res, 5_000_000);
      const check = inspectSpeechOutput(audio); // the engine's header is ignored: the bytes decide
      if (!check.ok) throw new ProviderError("bad_output");
      return { audio, contentType: check.contentType };
    } catch (e) {
      throw asProviderError(e);
    }
  }
}
