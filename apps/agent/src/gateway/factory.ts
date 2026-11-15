import { promises as fs } from "node:fs";
import { BudgetController, type BudgetAlert } from "./budget";
import { FileBudgetStore, MemoryBudgetStore, type BudgetStore } from "./budget-store";
import { loadGatewayConfig, type LoadedGatewayConfig } from "./config";
import { GeminiProvider } from "./gemini-provider";
import { createGateway, type Gateway, type GatewayLogger } from "./gateway";
import { SEED_PRICE_TABLE, parsePriceTable, type PriceTable } from "./prices";
import type { ModelProvider } from "./provider";

export interface BuildGatewayOptions {
  /** Used only when the status is "ready". Defaults to the global fetch at that moment (never before). */
  fetch?: typeof fetch;
  /** Overrides the provider (tests, or another provider later). */
  provider?: ModelProvider;
  store?: BudgetStore;
  prices?: PriceTable;
  clock?: () => number;
  logger?: GatewayLogger;
  onAlert?: (a: BudgetAlert) => void;
}

/**
 * Builds a gateway from an environment object. With GEMINI_ENABLED unset or false this reads no file, opens no connection and creates
 * no provider: the returned gateway answers every request with a typed "disabled" failure. NOTHING in the Agent calls this yet.
 */
export async function buildGateway(env: Readonly<Record<string, string | undefined>>, opts: BuildGatewayOptions = {}): Promise<{ gateway: Gateway; loaded: LoadedGatewayConfig; budget?: BudgetController }> {
  const loaded = loadGatewayConfig(env);
  if (loaded.status.state !== "ready" || !loaded.config) return { gateway: createGateway({ config: loaded, ...(opts.clock ? { clock: opts.clock } : {}), ...(opts.logger ? { logger: opts.logger } : {}) }), loaded };
  const cfg = loaded.config;

  let prices = opts.prices ?? SEED_PRICE_TABLE;
  if (!opts.prices && cfg.budget.priceTablePath) prices = parsePriceTable(JSON.parse(await fs.readFile(cfg.budget.priceTablePath, "utf8")));

  const store = opts.store ?? (cfg.budget.storePath ? new FileBudgetStore(cfg.budget.storePath) : new MemoryBudgetStore());
  const budget = new BudgetController({ budget: cfg.budget, store, prices, ...(opts.clock ? { clock: opts.clock } : {}), ...(opts.onAlert ? { onAlert: opts.onAlert } : {}) });
  const provider = opts.provider ?? new GeminiProvider({ apiKey: cfg.apiKey, baseUrl: cfg.baseUrl, fetch: opts.fetch ?? globalThis.fetch });
  return { gateway: createGateway({ config: loaded, provider, budget, ...(opts.clock ? { clock: opts.clock } : {}), ...(opts.logger ? { logger: opts.logger } : {}) }), loaded, budget };
}
