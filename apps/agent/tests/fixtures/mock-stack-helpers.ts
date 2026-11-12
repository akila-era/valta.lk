import { OllamaClient } from "../../src/ollama/client";
import { EnglishPlanner } from "../../src/pipeline/english-planner";
import { SinhalaPolisher } from "../../src/pipeline/polisher";
import { InferenceScheduler, type SchedulerOptions } from "../../src/queue/scheduler";
import { createMockStack, type MockStackOptions } from "../../src/mock/stack";
import { FixtureErpTransport } from "../../src/mock/erp-fixture";
import type { FakeOllama } from "../fake-ollama/server";

type Opts = Omit<MockStackOptions<FixtureErpTransport>, "planner" | "englishMode" | "polisher"> & {
  /** A Qwen planner is available. */
  qwen?: boolean;
  /** "qwen" (default): Qwen chooses every English tool call. "router-first": the router answers what it knows and Qwen is the fallback. */
  mode?: "qwen" | "router-first";
  /** SinhalaLLM may reword fixed Sinhala templates. */
  polish?: boolean;
  scheduler?: SchedulerOptions;
  ollamaTimeoutMs?: number;
};

/**
 * The mock pipeline. With a fake Ollama and `qwen` or `polish`, the planner and polisher talk to it through a real scheduler,
 * which is returned so a test can read its state; without them the pipeline is the default router-first one with no model.
 */
export function mockStack(fake: FakeOllama | null, opts: Opts = {}) {
  const { qwen, mode, polish, scheduler: schedOpts, ollamaTimeoutMs, ...rest } = opts;
  const transport = rest.transport ?? new FixtureErpTransport();
  const scheduler = new InferenceScheduler({ maxQueued: 5, ...(schedOpts ?? {}) });
  const ollama = fake ? new OllamaClient({ baseUrl: fake.url, ...(ollamaTimeoutMs ? { requestTimeoutMs: ollamaTimeoutMs } : {}) }) : null;
  if (!fake || !ollama || (!qwen && !polish)) return { ...createMockStack({ ...rest, transport }), scheduler, ollama };
  const base = createMockStack({ transport });
  const planner = qwen ? new EnglishPlanner({ ollama, scheduler, registry: base.registry }) : undefined;
  const polisher = polish ? new SinhalaPolisher({ ollama, scheduler }) : undefined;
  const stack = createMockStack({ ...rest, transport, ...(planner ? { planner, englishMode: mode ?? ("qwen" as const) } : {}), ...(polisher ? { polisher } : {}) });
  return { ...stack, scheduler, ollama };
}

export const toolCall = (name: string, args: Record<string, unknown>) => ({ function: { name, arguments: args } });
