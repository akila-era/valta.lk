import { buildCards } from "../backend/cards";
import { Catalogue } from "../backend/catalogue";
import { MockToolBackend } from "../backend/mock-backend";
import type { SiteData } from "../backend/site";
import type { ErpTransport } from "../backend/transport";
import type { EnglishPlanner } from "../pipeline/english-planner";
import type { SinhalaPolisher } from "../pipeline/polisher";
import type { ChatResponder } from "../pipeline/chat-responder";
import { RoutingPipeline, type RoutingDeps } from "../pipeline/routing-pipeline";
import { createSessionStore } from "../session/store";
import { createToolRegistry } from "../tools/definitions";
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
}

/**
 * The whole M1 pipeline wired to MOCK data: fixtures for the ERP and the website data, the tool backend, the registry, cards and
 * the routing pipeline. Used by tests and the local playground. Production wiring (src/main.ts) never imports this folder.
 */
export function createMockStack<T extends ErpTransport = FixtureErpTransport>(opts: MockStackOptions<T> = {}) {
  const transport = (opts.transport ?? new FixtureErpTransport()) as T;
  const site = opts.site ?? createMockSiteData();
  const catalogue = new Catalogue({ transport, site, ...(opts.now ? { now: opts.now } : {}), ...(opts.catalogueTtlMs !== undefined ? { ttlMs: opts.catalogueTtlMs } : {}) });
  const backend = new MockToolBackend({ catalogue, transport, site });
  const registry = createToolRegistry(backend);
  const sessions = createSessionStore(opts.now);
  const pipeline = new RoutingPipeline({
    registry,
    vocab: () => catalogue.vocabulary(),
    sessions,
    ...(opts.planner ? { planner: opts.planner } : {}),
    ...(opts.polisher ? { polisher: opts.polisher } : {}),
    ...(opts.chat ? { chat: opts.chat } : {}),
    ...(opts.englishMode ? { englishMode: opts.englishMode } : {}),
    cardsFrom: (o) => buildCards(o).cards,
    shownProductIdsFrom: (o) => buildCards(o).shownIds,
    ...(opts.onVerifierFailure ? { onVerifierFailure: opts.onVerifierFailure } : {}),
    ...(opts.metrics ? { metrics: opts.metrics } : {}),
    ...(opts.now ? { now: opts.now } : {}),
  });
  return { transport, site, catalogue, backend, registry, sessions, pipeline };
}
