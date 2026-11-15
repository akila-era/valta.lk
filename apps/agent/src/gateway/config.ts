import { isIP } from "node:net";
import { Secret } from "./secret";

/**
 * Gateway configuration. Reads ONLY the env object it is given. Messages name the variable and the rule, never a value, so a bad
 * secret can never reach a log. Gemini is OFF unless GEMINI_ENABLED is exactly "true".
 */
type Env = Readonly<Record<string, string | undefined>>;

export const DEFAULT_GEMINI_BASE_URL = "https://generativelanguage.googleapis.com";
/** Hosts the gateway may call by default. A different host needs GEMINI_ALLOW_CUSTOM_API_HOST=true (and still https, no credentials, no IP literal). */
const DEFAULT_HOST_SUFFIX = ".googleapis.com";

export interface GatewayConfig {
  apiKey: Secret;
  baseUrl: string;
  models: { chat: string; fast: string; voice: string };
  limits: { maxInputTokens: number; maxOutputTokens: number; maxThinkingTokens: number; thinkingLevel?: "minimal" | "low" | "medium" | "high" };
  budget: {
    monthlyLkr: number;
    softLkr: number;
    hardLkr: number;
    reserveLkr: number;
    dailyCapLkr: number;
    /** UNOFFICIAL exchange rate (extracted from a central-bank PDF dated 2026-11-09). Configurable; a person must confirm it. */
    lkrPerUsd: number;
    voiceShare: number;
    searchShare: number;
    reservationTimeoutMs: number;
    allowUnverifiedPrices: boolean;
    timezone: "UTC" | "Asia/Colombo";
    storePath: string | undefined;
    priceTablePath: string | undefined;
  };
  resilience: {
    timeoutMs: number;
    maxAttempts: number;
    backoffBaseMs: number;
    backoffMaxMs: number;
    breakerFailures: number;
    breakerCooldownMs: number;
    maxConcurrent: number;
    maxQueue: number;
  };
  rate: { perSessionPerMin: number; globalPerMin: number };
}

export type GatewayStatus =
  | { state: "disabled" }
  | { state: "not_configured"; missing: string[] }
  | { state: "misconfigured"; issues: string[] }
  | { state: "ready" };

export interface LoadedGatewayConfig {
  status: GatewayStatus;
  /** Present only when status.state is "ready". */
  config?: GatewayConfig;
}

const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;

function num(env: Env, name: string, def: number, min: number, max: number, issues: string[], integer = true): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return def;
  const n = Number(raw);
  if (!Number.isFinite(n) || (integer && !Number.isInteger(n)) || n < min || n > max) {
    issues.push(`${name} must be ${integer ? "an integer" : "a number"} between ${min} and ${max}.`);
    return def;
  }
  return n;
}

function flag(env: Env, name: string, def: boolean, issues: string[]): boolean {
  const raw = env[name]?.trim().toLowerCase();
  if (raw === undefined || raw === "") return def;
  if (raw === "true") return true;
  if (raw === "false") return false;
  issues.push(`${name} must be "true" or "false".`);
  return def;
}

/** A URL is acceptable when it is https, has no credentials, no explicit non-443 port, no IP literal, and (by default) a Google API host. */
export function checkBaseUrl(raw: string, allowCustomHost: boolean): { ok: true; url: string } | { ok: false; rule: string } {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return { ok: false, rule: "must be a valid URL" };
  }
  if (u.protocol !== "https:") return { ok: false, rule: "must use https" };
  if (u.username || u.password) return { ok: false, rule: "must not contain credentials" };
  if (u.port && u.port !== "443") return { ok: false, rule: "must not use a custom port" };
  if (u.search || u.hash) return { ok: false, rule: "must not contain a query or fragment" };
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (isIP(host) !== 0) return { ok: false, rule: "must be a host name, not an IP address" };
  if (host === "localhost" || !host.includes(".")) return { ok: false, rule: "must be a public host name" };
  if (!allowCustomHost && !host.endsWith(DEFAULT_HOST_SUFFIX)) return { ok: false, rule: "must be a googleapis.com host (a custom host needs GEMINI_ALLOW_CUSTOM_API_HOST=true)" };
  const path = u.pathname.replace(/\/+$/, "");
  return { ok: true, url: `${u.origin}${path}` };
}

function plausibleKey(v: string): boolean {
  return v.length >= 16 && v.length <= 512 && !/\s/.test(v) && !/[\u0000-\u001f\u007f]/.test(v);
}

export function loadGatewayConfig(env: Env): LoadedGatewayConfig {
  if (env.GEMINI_ENABLED?.trim().toLowerCase() !== "true") return { status: { state: "disabled" } };

  const issues: string[] = [];
  const missing: string[] = [];

  const rawKey = env.GEMINI_API_KEY;
  let apiKey: Secret | undefined;
  if (rawKey === undefined || rawKey.trim() === "") missing.push("GEMINI_API_KEY");
  else if (!plausibleKey(rawKey.trim())) issues.push("GEMINI_API_KEY is not a plausible API key (16 to 512 characters, no whitespace or control characters).");
  else apiKey = new Secret(rawKey.trim());

  const model = (name: string): string => {
    const v = env[name]?.trim();
    if (!v) {
      missing.push(name);
      return "";
    }
    if (!MODEL_ID.test(v)) {
      issues.push(`${name} is not a valid model identifier (letters, digits, dot, dash, underscore; up to 80 characters).`);
      return "";
    }
    return v;
  };
  const chat = model("GEMINI_MODEL");
  // The fast and voice models fall back to the main model when unset, so a minimal setup needs only GEMINI_MODEL.
  const fastRaw = env.GEMINI_FAST_MODEL?.trim();
  const voiceRaw = env.GEMINI_VOICE_MODEL?.trim();
  if (fastRaw && !MODEL_ID.test(fastRaw)) issues.push("GEMINI_FAST_MODEL is not a valid model identifier.");
  if (voiceRaw && !MODEL_ID.test(voiceRaw)) issues.push("GEMINI_VOICE_MODEL is not a valid model identifier.");

  const allowCustomHost = flag(env, "GEMINI_ALLOW_CUSTOM_API_HOST", false, issues);
  let baseUrl = DEFAULT_GEMINI_BASE_URL;
  const rawBase = env.GEMINI_API_BASE_URL?.trim();
  if (rawBase) {
    const c = checkBaseUrl(rawBase, allowCustomHost);
    if (c.ok) baseUrl = c.url;
    else issues.push(`GEMINI_API_BASE_URL ${c.rule}.`);
  }

  const limits = {
    maxInputTokens: num(env, "GEMINI_MAX_INPUT_TOKENS", 12_000, 256, 1_000_000, issues),
    maxOutputTokens: num(env, "GEMINI_MAX_OUTPUT_TOKENS", 800, 16, 65_536, issues),
    maxThinkingTokens: num(env, "GEMINI_MAX_THINKING_TOKENS", 0, 0, 32_768, issues),
  };
  // The documented control for current models. Thinking tokens are billed as output and count against GEMINI_MAX_OUTPUT_TOKENS, so this decides cost.
  // "minimal" is accepted by Gemini 3.5 Flash-Lite (its default) but REJECTED by Gemini 3.8 Flash and Gemini 4.
  const rawLevel = env.GEMINI_THINKING_LEVEL?.trim().toLowerCase();
  let thinkingLevel: "minimal" | "low" | "medium" | "high" | undefined;
  if (rawLevel) {
    if (rawLevel === "minimal" || rawLevel === "low" || rawLevel === "medium" || rawLevel === "high") thinkingLevel = rawLevel;
    else issues.push("GEMINI_THINKING_LEVEL must be one of: minimal, low, medium, high.");
  }
  const limitsWithLevel = thinkingLevel ? { ...limits, thinkingLevel } : limits;

  const monthlyLkr = num(env, "GATEWAY_BUDGET_MONTHLY_LKR", 3000, 1, 10_000_000, issues, false);
  const softLkr = num(env, "GATEWAY_BUDGET_SOFT_LKR", 2400, 0, 10_000_000, issues, false);
  const hardLkr = num(env, "GATEWAY_BUDGET_HARD_LKR", 2700, 0, 10_000_000, issues, false);
  const reserveLkr = num(env, "GATEWAY_BUDGET_RESERVE_LKR", 300, 0, 10_000_000, issues, false);
  if (softLkr > hardLkr) issues.push("GATEWAY_BUDGET_SOFT_LKR must not exceed GATEWAY_BUDGET_HARD_LKR.");
  if (hardLkr + reserveLkr > monthlyLkr + 1e-9) issues.push("GATEWAY_BUDGET_HARD_LKR plus GATEWAY_BUDGET_RESERVE_LKR must not exceed GATEWAY_BUDGET_MONTHLY_LKR.");
  const tz = (env.GATEWAY_BUDGET_TZ ?? "UTC").trim();
  if (tz !== "UTC" && tz !== "Asia/Colombo") issues.push('GATEWAY_BUDGET_TZ must be "UTC" or "Asia/Colombo".');

  const budget: GatewayConfig["budget"] = {
    monthlyLkr,
    softLkr,
    hardLkr,
    reserveLkr,
    dailyCapLkr: num(env, "GATEWAY_BUDGET_DAILY_LKR", 300, 1, 10_000_000, issues, false),
    lkrPerUsd: num(env, "GATEWAY_LKR_PER_USD", 337.05, 1, 100_000, issues, false),
    voiceShare: num(env, "GATEWAY_BUDGET_VOICE_SHARE", 0.15, 0, 1, issues, false),
    searchShare: num(env, "GATEWAY_BUDGET_SEARCH_SHARE", 0.1, 0, 1, issues, false),
    reservationTimeoutMs: num(env, "GATEWAY_RESERVATION_TIMEOUT_MS", 120_000, 1_000, 3_600_000, issues),
    allowUnverifiedPrices: flag(env, "GEMINI_ALLOW_UNVERIFIED_PRICES", false, issues),
    timezone: tz === "Asia/Colombo" ? "Asia/Colombo" : "UTC",
    storePath: env.GATEWAY_BUDGET_STORE_PATH?.trim() || undefined,
    priceTablePath: env.GATEWAY_PRICE_TABLE_PATH?.trim() || undefined,
  };

  const resilience: GatewayConfig["resilience"] = {
    timeoutMs: num(env, "GATEWAY_REQUEST_TIMEOUT_MS", 30_000, 1_000, 300_000, issues),
    maxAttempts: num(env, "GATEWAY_MAX_ATTEMPTS", 3, 1, 6, issues),
    backoffBaseMs: num(env, "GATEWAY_BACKOFF_BASE_MS", 500, 10, 60_000, issues),
    backoffMaxMs: num(env, "GATEWAY_BACKOFF_MAX_MS", 8_000, 10, 300_000, issues),
    breakerFailures: num(env, "GATEWAY_BREAKER_FAILURES", 5, 1, 100, issues),
    breakerCooldownMs: num(env, "GATEWAY_BREAKER_COOLDOWN_MS", 30_000, 1_000, 3_600_000, issues),
    maxConcurrent: num(env, "GATEWAY_MAX_CONCURRENT", 4, 1, 64, issues),
    maxQueue: num(env, "GATEWAY_MAX_QUEUE", 16, 0, 1_000, issues),
  };
  const rate = {
    perSessionPerMin: num(env, "GATEWAY_RATE_SESSION_PER_MIN", 20, 1, 10_000, issues),
    globalPerMin: num(env, "GATEWAY_RATE_GLOBAL_PER_MIN", 120, 1, 100_000, issues),
  };

  if (issues.length > 0) return { status: { state: "misconfigured", issues } };
  if (missing.length > 0 || !apiKey) return { status: { state: "not_configured", missing } };

  return {
    status: { state: "ready" },
    config: { apiKey, baseUrl, models: { chat, fast: fastRaw || chat, voice: voiceRaw || chat }, limits: limitsWithLevel, budget, resilience, rate },
  };
}

const KNOWN_VARIABLES = [
  "GEMINI_ENABLED",
  "GEMINI_API_KEY",
  "GEMINI_MODEL",
  "GEMINI_FAST_MODEL",
  "GEMINI_VOICE_MODEL",
  "GEMINI_API_BASE_URL",
  "GEMINI_MAX_INPUT_TOKENS",
  "GEMINI_MAX_OUTPUT_TOKENS",
  "GEMINI_MAX_THINKING_TOKENS",
  "GEMINI_ALLOW_UNVERIFIED_PRICES",
  "GEMINI_ALLOW_CUSTOM_API_HOST",
  "GATEWAY_BUDGET_MONTHLY_LKR",
  "GATEWAY_BUDGET_SOFT_LKR",
  "GATEWAY_BUDGET_HARD_LKR",
  "GATEWAY_BUDGET_RESERVE_LKR",
  "GATEWAY_BUDGET_DAILY_LKR",
  "GATEWAY_LKR_PER_USD",
  "GATEWAY_BUDGET_STORE_PATH",
] as const;

/** A summary safe for logs and health output: the state, the rule messages (names only) and WHICH variables are set. Never a value. */
export function describeStatus(loaded: LoadedGatewayConfig, env: Env): { state: GatewayStatus["state"]; detail: string[]; variablesSet: Record<string, boolean> } {
  const variablesSet: Record<string, boolean> = {};
  for (const n of KNOWN_VARIABLES) variablesSet[n] = (env[n] ?? "").trim() !== "";
  const s = loaded.status;
  const detail = s.state === "not_configured" ? s.missing.map((m) => `${m} is not set.`) : s.state === "misconfigured" ? s.issues : [];
  return { state: s.state, detail, variablesSet };
}
