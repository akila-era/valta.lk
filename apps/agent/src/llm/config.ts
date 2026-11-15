/**
 * Configuration of the LLM-first lane. EVERYTHING defaults to OFF: with no environment variable set, the production pipeline is untouched.
 *
 *   AGENT_LLM_FIRST              off | shadow | on        (default off)
 *   AGENT_LLM_HISTORY            off | memory             (default off: no conversation history reaches any model)
 *   AGENT_LLM_HISTORY_TURNS      1..10                    (default 6)
 *   AGENT_LLM_SHADOW_SAMPLE      0..1                     (default 1: share of conversations the shadow lane tries)
 *   AGENT_LLM_LEGACY_SOURCE_LABEL true                    (default off; a shim, see lane.ts: until contract 1.4 has a source for model text)
 *
 * The loader never throws and never echoes a value: a bad setting names the variable and the rule, and falls back to the safe default.
 */
export type LlmFirstMode = "off" | "shadow" | "on";

export interface LlmHistoryConfig {
  enabled: boolean;
  maxTurns: number;
  /** Per stored message (user or assistant): longer text is cut. */
  maxCharsPerMessage: number;
  /** Idle time after which a conversation's history is forgotten. */
  ttlMs: number;
  /** Conversations kept at once (oldest idle first out). */
  maxSessions: number;
}

export interface LlmFirstConfig {
  mode: LlmFirstMode;
  history: LlmHistoryConfig;
  shadowSample: number;
  /** Test-only shim: label model text with the one existing source value that exists today. Off by default: the "on" mode then refuses to serve. */
  legacySourceLabel: boolean;
  /** Names and rules of settings that were invalid (never values). */
  issues: string[];
}

type Env = Readonly<Record<string, string | undefined>>;

export const DEFAULT_HISTORY: LlmHistoryConfig = Object.freeze({
  enabled: false,
  maxTurns: 6,
  maxCharsPerMessage: 1_200,
  ttlMs: 30 * 60_000,
  maxSessions: 5_000,
});

function pick<T extends string>(env: Env, name: string, allowed: readonly T[], def: T, issues: string[]): T {
  const raw = env[name]?.trim().toLowerCase();
  if (raw === undefined || raw === "") return def;
  if ((allowed as readonly string[]).includes(raw)) return raw as T;
  issues.push(`${name} must be one of: ${allowed.join(", ")}.`);
  return def;
}

export function loadLlmFirstConfig(env: Env): LlmFirstConfig {
  const issues: string[] = [];
  const mode = pick(env, "AGENT_LLM_FIRST", ["off", "shadow", "on"] as const, "off", issues);
  const historyMode = pick(env, "AGENT_LLM_HISTORY", ["off", "memory"] as const, "off", issues);

  let maxTurns = DEFAULT_HISTORY.maxTurns;
  const rawTurns = env.AGENT_LLM_HISTORY_TURNS?.trim();
  if (rawTurns) {
    const n = Number(rawTurns);
    if (Number.isInteger(n) && n >= 1 && n <= 10) maxTurns = n;
    else issues.push("AGENT_LLM_HISTORY_TURNS must be an integer between 1 and 10.");
  }

  let shadowSample = 1;
  const rawSample = env.AGENT_LLM_SHADOW_SAMPLE?.trim();
  if (rawSample) {
    const n = Number(rawSample);
    if (Number.isFinite(n) && n >= 0 && n <= 1) shadowSample = n;
    else issues.push("AGENT_LLM_SHADOW_SAMPLE must be a number between 0 and 1.");
  }

  const rawShim = env.AGENT_LLM_LEGACY_SOURCE_LABEL?.trim().toLowerCase();
  let legacySourceLabel = false;
  if (rawShim === "true") legacySourceLabel = true;
  else if (rawShim && rawShim !== "false") issues.push('AGENT_LLM_LEGACY_SOURCE_LABEL must be "true" or "false".');

  return {
    mode,
    history: { ...DEFAULT_HISTORY, enabled: historyMode === "memory", maxTurns },
    shadowSample,
    legacySourceLabel,
    issues,
  };
}
