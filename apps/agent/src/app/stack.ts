import { buildCards } from "../backend/cards";
import { Catalogue } from "../backend/catalogue";
import { MockToolBackend } from "../backend/mock-backend";
import type { SiteData } from "../backend/site";
import type { ErpTransport } from "../backend/transport";
import type { ChatResponder } from "../pipeline/chat-responder";
import type { EnglishPlanner } from "../pipeline/english-planner";
import type { SinhalaPolisher } from "../pipeline/polisher";
import { RoutingPipeline, type RoutingDeps } from "../pipeline/routing-pipeline";
import { createSessionStore } from "../session/store";
import { createToolRegistry } from "../tools/definitions";
import type { ToolRegistry } from "../tools/registry";

export interface AgentStackOptions<T extends ErpTransport> {
  /** Required: the production entry never falls back to fixture data. */
  transport: T;
  site: SiteData;
  /** A ready planner, or a function that builds it from the tool registry (the planner needs the registry, the registry needs the backend). */
  planner?: EnglishPlanner | ((registry: ToolRegistry) => EnglishPlanner);
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
 * The whole pipeline wired to the GIVEN data sources: the catalogue over the transport, the tool backend, the registry, cards and the
 * routing pipeline. It holds no fixture data of its own: tests pass fixtures (see mock/stack.ts), production passes the website relay.
 * (Extracted from mock/stack.ts so that production code never has to import the mock folder.)
 */
export function createAgentStack<T extends ErpTransport>(opts: AgentStackOptions<T>) {
  const { transport, site } = opts;
  const catalogue = new Catalogue({ transport, site, ...(opts.now ? { now: opts.now } : {}), ...(opts.catalogueTtlMs !== undefined ? { ttlMs: opts.catalogueTtlMs } : {}) });
  const backend = new MockToolBackend({ catalogue, transport, site });
  const registry = createToolRegistry(backend);
  const sessions = createSessionStore(opts.now);
  const planner = typeof opts.planner === "function" ? opts.planner(registry) : opts.planner;
  const pipeline = new RoutingPipeline({
    registry,
    vocab: () => catalogue.vocabulary(),
    sessions,
    ...(planner ? { planner } : {}),
    ...(opts.polisher ? { polisher: opts.polisher } : {}),
    ...(opts.chat ? { chat: opts.chat } : {}),
    ...(opts.englishMode ? { englishMode: opts.englishMode } : {}),
    cardsFrom: (o) => buildCards(o).cards,
    shownProductIdsFrom: (o) => buildCards(o).shownIds,
    ...(opts.onVerifierFailure ? { onVerifierFailure: opts.onVerifierFailure } : {}),
    ...(opts.metrics ? { metrics: opts.metrics } : {}),
    ...(opts.onDecision ? { onDecision: opts.onDecision } : {}),
    ...(opts.now ? { now: opts.now } : {}),
  });
  return { transport, site, catalogue, backend, registry, sessions, pipeline };
}
