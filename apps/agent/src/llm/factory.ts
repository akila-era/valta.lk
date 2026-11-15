import type { Gateway } from "../gateway/gateway";
import type { ChatPipeline, PipelineInput } from "../http/pipeline";
import { detectLanguage } from "../router/language";
import { createLlmTools, LlmToolExecutor, type LlmTool, type LlmToolDeps } from "../tools/llm";
import type { Exclusions, Language } from "../verify/v2";
import { loadLlmFirstConfig, type LlmFirstConfig } from "./config";
import { ConversationHistory } from "./history";
import { createLaneWrapper, type LaneStats, type LlmFirstPipeline } from "./lane";
import type { HonorificPreference } from "./prompt";
import { runLlmTurn, type LlmTurnResult } from "./turn";

type Env = Readonly<Record<string, string | undefined>>;

/** What the lane needs to know about the conversation that the legacy pipeline keeps in its own session state. Wiring it to that state is a later step. */
export interface LaneContext {
  honorific: HonorificPreference;
  exclusions?: Exclusions;
  sessionNotes?: string[];
  preferences?: { replyLanguage?: "en" | "si"; brief?: boolean; noQuestions?: boolean };
}

export interface CreateLlmFirstOptions {
  legacy: ChatPipeline;
  env: Env;
  gateway: Gateway;
  toolDeps: LlmToolDeps;
  /** Overrides the default tool set (tests). */
  tools?: LlmTool[];
  enabledTools?: readonly string[];
  contextFor?: (input: PipelineInput) => LaneContext;
  now?: () => number;
}

function languageOf(message: string, locale: string | undefined): Language {
  const info = detectLanguage(message, locale === "si" || locale === "en" ? { locale } : {});
  if (info.script === "si") return "si";
  if (info.script === "mixed") return "mixed";
  if (info.script === "si-latin") return "singlish";
  return "en";
}

/**
 * Returns the pipeline the HTTP layer should use. With AGENT_LLM_FIRST unset or "off" it returns the LEGACY pipeline object itself: nothing is wrapped, no
 * gateway call is possible, behaviour is byte-identical to today. Otherwise it returns the lane wrapper (see lane.ts).
 */
export function createLlmFirst(opts: CreateLlmFirstOptions): ChatPipeline | (LlmFirstPipeline & { config: LlmFirstConfig; stats(): ReturnType<LlmFirstPipeline["stats"]> }) {
  const config = loadLlmFirstConfig(opts.env);
  if (config.mode === "off") return opts.legacy;

  const now = opts.now ?? Date.now;
  const history = new ConversationHistory(config.history, now);
  const executor = new LlmToolExecutor({ tools: opts.tools ?? createLlmTools(), ...(opts.enabledTools ? { enabled: opts.enabledTools } : {}) });

  const runner = (input: PipelineInput): Promise<LlmTurnResult> => {
    const ctx: LaneContext = opts.contextFor?.(input) ?? { honorific: "none" };
    const customerId = input.identity.kind === "customer" ? input.identity.customerId : undefined;
    return runLlmTurn(
      { gateway: opts.gateway, executor, toolDeps: opts.toolDeps, history, now },
      {
        requestId: input.requestId,
        sessionKey: `${input.identity.kind === "customer" ? `cust:${customerId}` : "anon"}|${input.request.sessionId}`,
        actor: { kind: input.identity.kind, ...(customerId ? { customerId } : {}) },
        // The message exactly as the customer sent it.
        message: input.request.message,
        language: languageOf(input.request.message, input.request.locale),
        honorific: ctx.honorific,
        ...(ctx.exclusions ? { exclusions: ctx.exclusions } : {}),
        ...(ctx.sessionNotes ? { sessionNotes: ctx.sessionNotes } : {}),
        ...(ctx.preferences ? { preferences: ctx.preferences } : {}),
        signal: input.signal,
        deadlineAt: input.deadlineAt,
      },
    );
  };

  const lane = createLaneWrapper({ legacy: opts.legacy, config, runner, ready: async () => (await opts.gateway.status()).state === "ready", ...(opts.now ? { now: opts.now } : {}) });
  return Object.assign(lane, { config });
}

export type { LaneStats };
