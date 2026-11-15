import { afterEach, beforeEach, vi } from "vitest";
import { MemoryBudgetStore, type BudgetStore } from "../../src/gateway/budget-store";
import { buildGateway, type BuildGatewayOptions } from "../../src/gateway/factory";
import type { Gateway } from "../../src/gateway/gateway";
import { FakeModelProvider, type FakeStep } from "../../src/gateway/provider";
import type { LoadedGatewayConfig } from "../../src/gateway/config";
import type { BudgetController } from "../../src/gateway/budget";

/** Obviously fake. It is NOT a credential and must never resemble a real one. */
export const FAKE_KEY = "FAKE_TEST_KEY_not_a_secret_0123456789";

/** Counts every attempt to use the global fetch; any call fails the test. Register once at the top of a test file. */
export const networkAttempts = { count: 0 };

export function installNoNetworkGuard(): void {
  beforeEach(() => {
    networkAttempts.count = 0;
    vi.stubGlobal("fetch", () => {
      networkAttempts.count++;
      throw new Error("REAL NETWORK CALL ATTEMPTED IN A GATEWAY TEST");
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    if (networkAttempts.count !== 0) throw new Error(`a gateway test attempted ${networkAttempts.count} real network call(s)`);
  });
}

/** Model ids used only as test fixtures (they exist in the seed price table). */
export const CHAT_MODEL = "gemini-3.8-flash";
export const FAST_MODEL = "gemini-3.5-flash-lite";

export const BASE_ENV: Record<string, string> = {
  GEMINI_ENABLED: "true",
  GEMINI_API_KEY: FAKE_KEY,
  GEMINI_MODEL: CHAT_MODEL,
  GEMINI_FAST_MODEL: FAST_MODEL,
  GEMINI_ALLOW_UNVERIFIED_PRICES: "true",
};

export interface Harness {
  gateway: Gateway;
  provider: FakeModelProvider;
  budget: BudgetController;
  loaded: LoadedGatewayConfig;
  store: BudgetStore;
  clock: { now: number };
  logs: Record<string, string | number | boolean>[];
  advance(ms: number): void;
}

export async function makeHarness(over: Record<string, string> = {}, steps: FakeStep[] = [], opts: Partial<BuildGatewayOptions> = {}): Promise<Harness> {
  const clock = { now: Date.UTC(2026, 10, 14, 12, 0, 0) };
  const logs: Record<string, string | number | boolean>[] = [];
  const provider = new FakeModelProvider(steps, { sleep: async () => {} });
  const store = opts.store ?? new MemoryBudgetStore();
  const built = await buildGateway(
    { ...BASE_ENV, ...over },
    { provider, store, clock: () => clock.now, logger: { log: (e) => logs.push(e) }, ...opts },
  );
  if (!built.budget) throw new Error("harness expects a ready gateway");
  return { gateway: built.gateway, provider, budget: built.budget, loaded: built.loaded, store, clock, logs, advance: (ms) => void (clock.now += ms) };
}

export const userText = (text: string) => ({ role: "user" as const, parts: [{ type: "text" as const, text }] });
