import { MAX_MESSAGE_CHARS } from "./contract/schemas";
import { DEFAULT_RATE_CONFIG, type ChallengeMode, type RateConfig } from "./security/rate-limit";

export const APP_VERSION = "0.0.0-m1a";

export interface AgentConfig {
  host: string;
  port: number;
  ollamaUrl: string;
  /** keyId -> secret. Several keys can be active so a key can be rotated without downtime. */
  hmacKeys: ReadonlyMap<string, string>;
  /** Kill switch. Off unless explicitly enabled. */
  assistantEnabled: boolean;
  /**
   * CAPTCHA-ready hook. "off" (default), or "on-abuse": a client that recently hit a limit must present a challenge token that a provider
   * accepts. No provider exists in M1, so "on-abuse" fails closed for such clients until one is wired in.
   */
  challengeMode: ChallengeMode;
  /** Abuse limits (M1-D). */
  rate: RateConfig;
  maxBodyBytes: number;
  maxMessageChars: number;
  queueMaxDepth: number;
  deadlineMs: number;
  heartbeatMs: number;
  maxInFlight: number;
  /**
   * How English messages are handled. "router-first" (default, approved after the M1-B evaluation): the deterministic router answers
   * when it recognises the intent, and Qwen is used only when it abstains. "qwen": Qwen chooses the tools (kept for evaluation).
   */
  englishMode: "router-first" | "qwen";
}

/** Messages name the variable and the rule, never the value, so a bad secret can never reach a log. */
export class ConfigError extends Error {
  readonly issues: readonly string[];
  constructor(issues: string[]) {
    super(`Invalid configuration:\n- ${issues.join("\n- ")}`);
    this.name = "ConfigError";
    this.issues = issues;
  }
}

type Env = Readonly<Record<string, string | undefined>>;

const KEY_ID = /^[A-Za-z0-9_-]{1,16}$/;
const MIN_SECRET_CHARS = 32;
const MAX_KEYS = 4;
/** M1 forbids any switch that would log, retain or train on customer messages, or collect consent. */
const FORBIDDEN_SWITCH = /^(?:AGENT|AI)_(?:.*_)?(?:RETAIN\w*|RETENT\w*|CONSENT\w*|TRAIN\w*)(?:_.*)?$|^(?:AGENT|AI)_.*LOG_MESSAGE/i;

export function isLoopbackHost(host: string): boolean {
  const h = host.trim().toLowerCase().replace(/^\[|\]$/g, "");
  return h === "localhost" || h === "::1" || /^127(\.\d{1,3}){3}$/.test(h);
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

function boolVar(env: Env, name: string, def: boolean, issues: string[]): boolean {
  const raw = env[name]?.trim().toLowerCase();
  if (raw === undefined || raw === "") return def;
  if (raw === "true") return true;
  if (raw === "false") return false;
  issues.push(`${name} must be "true" or "false".`);
  return def;
}

function englishMode(env: Env, issues: string[]): "router-first" | "qwen" {
  const raw = (env.AGENT_ENGLISH_MODE ?? "router-first").trim().toLowerCase();
  if (raw === "router-first" || raw === "qwen") return raw;
  issues.push('AGENT_ENGLISH_MODE must be "router-first" or "qwen".');
  return "router-first";
}

function parseKeys(raw: string | undefined, issues: string[]): Map<string, string> {
  const keys = new Map<string, string>();
  if (!raw || raw.trim() === "") {
    issues.push("AGENT_HMAC_KEYS is required (no default exists).");
    return keys;
  }
  for (const part of raw.split(",")) {
    const i = part.indexOf(":");
    const id = i < 0 ? "" : part.slice(0, i).trim();
    const secret = i < 0 ? "" : part.slice(i + 1).trim();
    if (!KEY_ID.test(id)) {
      issues.push("AGENT_HMAC_KEYS entries must look like keyId:secret, with a key id of 1 to 16 letters, digits, - or _.");
      continue;
    }
    if (secret.length < MIN_SECRET_CHARS) {
      issues.push(`AGENT_HMAC_KEYS secret for key "${id}" must be at least ${MIN_SECRET_CHARS} characters.`);
      continue;
    }
    if (keys.has(id)) issues.push(`AGENT_HMAC_KEYS lists key id "${id}" more than once.`);
    keys.set(id, secret);
  }
  if (keys.size > MAX_KEYS) issues.push(`AGENT_HMAC_KEYS allows at most ${MAX_KEYS} keys.`);
  return keys;
}

/** Pure: reads only the object it is given. Fails fast with every problem listed at once. */
export function loadConfig(env: Env): AgentConfig {
  const issues: string[] = [];

  for (const [name, value] of Object.entries(env)) {
    if (FORBIDDEN_SWITCH.test(name) && value !== undefined && value.trim() !== "" && value.trim().toLowerCase() !== "false") {
      issues.push(`${name} is not supported: M1 has no message logging, retention, consent collection or training switch.`);
    }
  }

  const hmacKeys = parseKeys(env.AGENT_HMAC_KEYS, issues);

  const host = (env.AGENT_HOST ?? "127.0.0.1").trim();
  const allowNonLoopback = boolVar(env, "AGENT_ALLOW_NON_LOOPBACK", false, issues);
  if (!isLoopbackHost(host) && !allowNonLoopback) {
    issues.push("AGENT_HOST must be a loopback address (set AGENT_ALLOW_NON_LOOPBACK=true only with a documented, approved reason).");
  }

  const port = intVar(env, "AGENT_PORT", 8787, 0, 65535, issues);

  let ollamaUrl = (env.OLLAMA_URL ?? "http://127.0.0.1:11434").trim();
  try {
    const u = new URL(ollamaUrl);
    if (u.protocol !== "http:" && u.protocol !== "https:") issues.push("OLLAMA_URL must use http or https.");
    else if (!isLoopbackHost(u.hostname)) issues.push("OLLAMA_URL must point to a loopback address; Ollama is never reached over a network.");
    else if (u.username || u.password) issues.push("OLLAMA_URL must not contain credentials.");
    ollamaUrl = u.origin;
  } catch {
    issues.push("OLLAMA_URL is not a valid URL.");
  }

  const assistantEnabled = boolVar(env, "AI_ASSISTANT_ENABLED", false, issues);

  const mode = (env.AI_CHALLENGE_MODE ?? "off").trim().toLowerCase();
  if (mode !== "off" && mode !== "on-abuse") issues.push('AI_CHALLENGE_MODE must be "off" or "on-abuse" (no CAPTCHA provider exists in M1).');
  const d = DEFAULT_RATE_CONFIG;
  const rate: RateConfig = {
    ipPerMin: intVar(env, "AGENT_RATE_IP_PER_MIN", d.ipPerMin, 1, 1_000, issues),
    sessionPerMin: intVar(env, "AGENT_RATE_SESSION_PER_MIN", d.sessionPerMin, 1, 1_000, issues),
    identityPerMin: intVar(env, "AGENT_RATE_IDENTITY_PER_MIN", d.identityPerMin, 1, 1_000, issues),
    maxConcurrent: intVar(env, "AGENT_MAX_CONCURRENT_PER_IDENTITY", d.maxConcurrent, 1, 20, issues),
    newSessionsPerHour: intVar(env, "AGENT_NEW_SESSIONS_PER_HOUR", d.newSessionsPerHour, 1, 200, issues),
    authFailPerMin: intVar(env, "AGENT_AUTH_FAIL_PER_MIN", d.authFailPerMin, 1, 1_000, issues),
    cooldownAfter: intVar(env, "AGENT_COOLDOWN_AFTER", d.cooldownAfter, 1, 100, issues),
    cooldownSec: intVar(env, "AGENT_COOLDOWN_SEC", d.cooldownSec, 1, 3_600, issues),
  };

  const cfg: AgentConfig = {
    host,
    port,
    ollamaUrl,
    hmacKeys,
    assistantEnabled,
    challengeMode: mode === "on-abuse" ? "on-abuse" : "off",
    rate,
    maxBodyBytes: intVar(env, "AGENT_MAX_BODY_BYTES", 20_000, 1_000, 100_000, issues),
    maxMessageChars: intVar(env, "AGENT_MAX_MESSAGE_CHARS", MAX_MESSAGE_CHARS, 1, MAX_MESSAGE_CHARS, issues),
    queueMaxDepth: intVar(env, "AGENT_QUEUE_MAX_DEPTH", 6, 0, 50, issues),
    deadlineMs: intVar(env, "AGENT_DEADLINE_MS", 45_000, 1_000, 120_000, issues),
    heartbeatMs: intVar(env, "AGENT_HEARTBEAT_MS", 15_000, 100, 60_000, issues),
    maxInFlight: intVar(env, "AGENT_MAX_IN_FLIGHT", 16, 1, 256, issues),
    englishMode: englishMode(env, issues),
  };

  if (issues.length) throw new ConfigError(issues);
  return cfg;
}
