import { createAgentStack, type AgentStackOptions } from "../app/stack";
import type { ErpTransport } from "../backend/transport";
import type { SiteData } from "../backend/site";
import type { EnglishPlanner } from "../pipeline/english-planner";
import type { SinhalaPolisher } from "../pipeline/polisher";
import type { ChatResponder } from "../pipeline/chat-responder";
import type { RoutingDeps } from "../pipeline/routing-pipeline";
import { FixtureErpTransport } from "./erp-fixture";
import { createMockSiteData } from "./site-data";

export interface MockStackOptions<T extends ErpTransport = FixtureErpTransport> {
  transport?: T;
  site?: SiteData;
  planner?: EnglishPlanner;
  polisher?: SinhalaPolisher;
  chat?: ChatResponder;
  englishMode?: "router-first" | "qwen";
  now?: () => number;
  catalogueTtlMs?: number;
  onVerifierFailure?: RoutingDeps["onVerifierFailure"];
  metrics?: RoutingDeps["metrics"];
  onDecision?: RoutingDeps["onDecision"];
}

/**
 * The whole M1 pipeline wired to MOCK data: fixtures for the ERP and the website data (the wiring itself lives in app/stack.ts and is shared with
 * the production entry). Used by tests and the local playground. Production wiring (src/main.ts) never imports this folder.
 */
export function createMockStack<T extends ErpTransport = FixtureErpTransport>(opts: MockStackOptions<T> = {}) {
  const transport = (opts.transport ?? new FixtureErpTransport()) as T;
  const site = opts.site ?? createMockSiteData();
  const rest: Omit<AgentStackOptions<T>, "transport" | "site"> = { ...opts };
  return createAgentStack<T>({ ...rest, transport, site });
}
