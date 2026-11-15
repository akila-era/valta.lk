import { HttpSttProvider, HttpTtsProvider, noSttProvider, noTtsProvider, validateLoopbackUrl, type SttProvider, type TtsProvider } from "./providers";
import { DEFAULT_MAX_SECONDS, MAX_AUDIO_BYTES } from "./audio";

export interface VoiceConfig {
  stt: SttProvider;
  tts: TtsProvider;
  maxSeconds: number;
  maxBytes: number;
  concurrency: number;
  queueDepth: number;
  limits: { sttPerMin: number; sttPerHour: number; ttsPerMin: number };
}

type Env = Readonly<Record<string, string | undefined>>;

export class VoiceConfigError extends Error {
  constructor(readonly issues: string[]) {
    super(`Invalid voice configuration:\n- ${issues.join("\n- ")}`);
    this.name = "VoiceConfigError";
  }
}

function intVar(env: Env, name: string, def: number, min: number, max: number, issues: string[]): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    issues.push(`${name} must be an integer between ${min} and ${max}.`);
    return def;
  }
  return n;
}

function provider(env: Env, name: string, issues: string[]): "none" | "http" {
  const raw = (env[name] ?? "none").trim().toLowerCase();
  if (raw === "none" || raw === "http") return raw;
  issues.push(`${name} must be "none" or "http".`);
  return "none";
}

/** Pure: reads only the object it is given. Names the variable and the rule, never a value. Defaults to everything off. */
export function loadVoiceConfig(env: Env): VoiceConfig {
  const issues: string[] = [];
  let stt: SttProvider = noSttProvider;
  let tts: TtsProvider = noTtsProvider;

  if (provider(env, "AGENT_STT_PROVIDER", issues) === "http") {
    const url = validateLoopbackUrl(env.AGENT_STT_URL, "AGENT_STT_URL", issues);
    const timeoutMs = intVar(env, "AGENT_STT_TIMEOUT_MS", 20_000, 1_000, 120_000, issues);
    if (url) stt = new HttpSttProvider({ baseUrl: url, model: env.AGENT_STT_MODEL?.trim() || undefined, timeoutMs });
  }
  if (provider(env, "AGENT_TTS_PROVIDER", issues) === "http") {
    const url = validateLoopbackUrl(env.AGENT_TTS_URL, "AGENT_TTS_URL", issues);
    const timeoutMs = intVar(env, "AGENT_TTS_TIMEOUT_MS", 20_000, 1_000, 120_000, issues);
    if (url) {
      tts = new HttpTtsProvider({ baseUrl: url, model: env.AGENT_TTS_MODEL?.trim() || undefined, voices: { en: env.AGENT_TTS_VOICE_EN?.trim() || undefined, si: env.AGENT_TTS_VOICE_SI?.trim() || undefined }, timeoutMs });
    }
  }

  const cfg: VoiceConfig = {
    stt,
    tts,
    maxSeconds: intVar(env, "AGENT_VOICE_MAX_SECONDS", DEFAULT_MAX_SECONDS, 3, 60, issues),
    maxBytes: MAX_AUDIO_BYTES,
    concurrency: intVar(env, "AGENT_VOICE_CONCURRENCY", 1, 1, 2, issues),
    queueDepth: intVar(env, "AGENT_VOICE_QUEUE_DEPTH", 3, 0, 6, issues),
    limits: {
      sttPerMin: intVar(env, "AGENT_VOICE_STT_PER_MIN", 10, 1, 60, issues),
      sttPerHour: intVar(env, "AGENT_VOICE_STT_PER_HOUR", 60, 1, 600, issues),
      ttsPerMin: intVar(env, "AGENT_VOICE_TTS_PER_MIN", 20, 1, 120, issues),
    },
  };
  if (issues.length > 0) throw new VoiceConfigError(issues);
  return cfg;
}
