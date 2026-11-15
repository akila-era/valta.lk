/**
 * Settings of the browser integration. The whole feature is OFF unless AGENT_BROWSER_ENABLED is exactly "true": when it is off no browser code
 * is constructed (no driver, no proxy, no session manager), the /v1/browser routes do not exist and chat behaves exactly as before.
 * Messages name the variable and the rule, never a value.
 */
export interface BrowserAgentConfig {
  enabled: boolean;
  /** Concurrent browser contexts in the whole Agent (each is a few hundred MB: see the resource report). */
  maxSessions: number;
  /** Tool steps one task may use. */
  stepBudget: number;
  /** Wall-clock limit of one browse task, in ms. */
  taskTimeoutMs: number;
  /** How long a proposal waits for the shopper's approval, in seconds. */
  proposalTtlSec: number;
}

export const DEFAULT_BROWSER_AGENT_CONFIG: BrowserAgentConfig = Object.freeze({ enabled: false, maxSessions: 2, stepBudget: 8, taskTimeoutMs: 30_000, proposalTtlSec: 120 });

export class BrowserConfigError extends Error {
  readonly issues: readonly string[];
  constructor(issues: string[]) {
    super(`Invalid browser configuration:\n- ${issues.join("\n- ")}`);
    this.name = "BrowserConfigError";
    this.issues = issues;
  }
}

type Env = Readonly<Record<string, string | undefined>>;

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

export function loadBrowserAgentConfig(env: Env): BrowserAgentConfig {
  const issues: string[] = [];
  const raw = env.AGENT_BROWSER_ENABLED?.trim().toLowerCase();
  let enabled = false;
  if (raw !== undefined && raw !== "") {
    if (raw === "true") enabled = true;
    else if (raw !== "false") issues.push('AGENT_BROWSER_ENABLED must be "true" or "false".');
  }
  const d = DEFAULT_BROWSER_AGENT_CONFIG;
  const cfg: BrowserAgentConfig = {
    enabled,
    maxSessions: intVar(env, "AGENT_BROWSER_MAX_SESSIONS", d.maxSessions, 1, 4, issues),
    stepBudget: intVar(env, "AGENT_BROWSER_STEP_BUDGET", d.stepBudget, 2, 20, issues),
    taskTimeoutMs: intVar(env, "AGENT_BROWSER_TASK_TIMEOUT_MS", d.taskTimeoutMs, 5_000, 60_000, issues),
    proposalTtlSec: intVar(env, "AGENT_BROWSER_CONFIRM_TTL_SEC", d.proposalTtlSec, 30, 300, issues),
  };
  if (issues.length) throw new BrowserConfigError(issues);
  return cfg;
}
