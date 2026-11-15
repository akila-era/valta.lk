import { ConfirmationStore } from "../browser/confirmations";
import type { BrowserDriver } from "../browser/driver";
import { BrowserSessionManager, type AuditSink, type SessionLimits } from "../browser/sessions";
import { BrowserToolService } from "../browser/service";
import type { UrlPolicy } from "../security/url-policy";
import { BrowserAgent } from "./agent";
import type { BrowserAgentConfig } from "./config";

export * from "./agent";
export * from "./config";
export * from "./intent";
export * from "./templates";

export interface CreateBrowserAgentOptions {
  driver: BrowserDriver;
  policy: UrlPolicy;
  config: BrowserAgentConfig;
  now?: () => number;
  audit?: AuditSink;
  metrics?: { browserTool(tool: string, outcome: string): void; browserTaskMs(ms: number): void };
}

/**
 * Builds the session manager, the single-use confirmation store, the tool service and the agent around ONE driver and ONE URL policy.
 * The limits come from the configuration: a browser session must live long enough for a proposal to be answered (proposal time plus a margin),
 * one session per shopper identity, and a hard cap on concurrent contexts.
 */
export function createBrowserAgent(o: CreateBrowserAgentOptions): BrowserAgent {
  const now = o.now ?? Date.now;
  const ttlMs = o.config.proposalTtlSec * 1000;
  const limits: SessionLimits = {
    idleMs: ttlMs + 15_000,
    maxLifetimeMs: Math.max(o.config.taskTimeoutMs, ttlMs) + 30_000,
    maxSteps: o.config.stepBudget,
    maxConcurrent: o.config.maxSessions,
    maxPerIdentity: 1,
  };
  const audit = o.audit ?? (() => {});
  const sessions = new BrowserSessionManager(o.driver, limits, now, audit);
  const confirmations = new ConfirmationStore(now, ttlMs);
  const service = new BrowserToolService({ driver: o.driver, sessions, confirmations, policy: o.policy, now, audit });
  return new BrowserAgent({ service, sessions, confirmations, config: o.config, now, audit, ...(o.metrics ? { metrics: o.metrics } : {}) });
}
