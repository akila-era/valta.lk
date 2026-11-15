import type { Gateway, GatewayFailure } from "../gateway/gateway";
import type { Message, Part, ToolDeclaration as GatewayToolDeclaration } from "../gateway/provider";
import type { Actor } from "../tools/registry";
import { retrievedSources, searchRan, toVerifierEvidence, type LlmToolDeps, type LlmToolExecutor, type SessionFacts, type TurnState } from "../tools/llm";
import { hasSinhala } from "../util/script";
import { explainVerdict, noticeFor, planRepair, verifyAnswerV2, type Exclusions, type Language, type VerdictSummary, type VerifyV2Input, type VerifyV2Policy } from "../verify/v2";
import type { ConversationHistory } from "./history";
import { buildSystemPrompt, promptProtectedStrings, type HonorificPreference, type PromptInput } from "./prompt";

/**
 * One customer turn of the LLM-first lane:
 *   original message + bounded history + session facts -> model (with only the tools that can really run) -> tool rounds through the executor
 *   (authorised, limited, fenced) -> the model writes the answer -> verifier v2 checks it against THIS turn's tool evidence -> repair or degrade honestly.
 *
 * What this loop never does: pick a canned reply as the answer, rewrite the customer's message, trust a tool or a web page as instructions, or present a
 * failure as an answer. When the model, a tool or the verifier cannot deliver, the result says so (`ok:false`, `degraded:true`) and carries an honest notice.
 */
export interface LlmTurnDeps {
  gateway: Gateway;
  executor: LlmToolExecutor;
  toolDeps: LlmToolDeps;
  history?: ConversationHistory;
  now?: () => number;
  /** All model calls of one turn (tool rounds, repairs). Default 6. */
  maxModelCalls?: number;
  policy?: Omit<VerifyV2Policy, "honorific">;
}

export interface LlmTurnInput {
  requestId: string;
  sessionKey: string;
  actor: Actor;
  /** The customer's message EXACTLY as received. It is sent to the model verbatim and never rewritten. */
  message: string;
  language: Language;
  honorific?: HonorificPreference;
  exclusions?: Exclusions;
  sessionNotes?: readonly string[];
  sessionFacts?: SessionFacts;
  preferences?: PromptInput["preferences"];
  cart?: Parameters<LlmToolExecutor["startTurn"]>[0]["cart"];
  signal?: AbortSignal;
  /** Epoch ms after which no new model call starts. */
  deadlineAt?: number;
}

export type LlmTurnFailureKind = "gateway" | "blocked" | "empty" | "timeout" | "unverifiable";

export interface LlmTurnResult {
  /** False means DEGRADED: `text` is an honest system notice, not a model answer. */
  ok: boolean;
  text: string;
  language: Language;
  needsNativeReview: boolean;
  source: "llm" | "notice";
  degraded: boolean;
  failure?: { kind: LlmTurnFailureKind; code?: string };
  /** Counts and codes only: never text. */
  verdict: VerdictSummary | null;
  repairsApplied: string[];
  modelCalls: number;
  costLkr: number;
  modelNames: string[];
  tools: { name: string; status: string }[];
  evidenceCount: number;
  sources: { url: string; title?: string }[];
  proposals: TurnState["proposals"];
  latencyMs: number;
}

const userMessage = (text: string): Message => ({ role: "user", parts: [{ type: "text", text }] });
const modelMessage = (text: string): Message => ({ role: "model", parts: [{ type: "text", text }] });

export async function runLlmTurn(deps: LlmTurnDeps, input: LlmTurnInput): Promise<LlmTurnResult> {
  const now = deps.now ?? Date.now;
  const t0 = now();
  const maxCalls = deps.maxModelCalls ?? 6;
  const honorific = input.honorific ?? "none";

  const turn = deps.executor.startTurn({
    actor: input.actor,
    requestId: input.requestId,
    sessionKey: input.sessionKey,
    session: input.sessionFacts ?? {},
    ...(input.cart ? { cart: input.cart } : {}),
    ...(input.signal ? { signal: input.signal } : {}),
    deps: deps.toolDeps,
    now,
  });
  const declarations = deps.executor.declarations(turn);
  const system = buildSystemPrompt({
    language: input.language,
    honorific,
    offeredTools: declarations.map((d) => d.name),
    unavailableTools: deps.executor.unavailable(turn),
    ...(input.exclusions ? { exclusions: input.exclusions } : {}),
    ...(input.sessionNotes ? { sessionNotes: input.sessionNotes } : {}),
    ...(input.preferences ? { preferences: input.preferences } : {}),
  });

  const messages: Message[] = [];
  for (const h of deps.history?.window(input.sessionKey) ?? []) {
    messages.push(userMessage(h.user));
    messages.push(modelMessage(h.assistant));
  }
  messages.push(userMessage(input.message));

  let calls = 0;
  let costLkr = 0;
  const modelNames = new Set<string>();
  const repairsApplied: string[] = [];

  const base = (): Pick<LlmTurnResult, "modelCalls" | "costLkr" | "modelNames" | "tools" | "evidenceCount" | "sources" | "proposals" | "latencyMs" | "language"> => ({
    modelCalls: calls,
    costLkr,
    modelNames: [...modelNames],
    tools: turn.audit.map((a) => ({ name: a.tool, status: a.status })),
    evidenceCount: turn.evidence.length,
    sources: retrievedSources(turn.evidence),
    proposals: turn.proposals,
    latencyMs: Math.max(0, now() - t0),
    language: input.language,
  });

  const degraded = (kind: LlmTurnFailureKind, text: string, needsReview: boolean, code?: string, verdict: VerdictSummary | null = null): LlmTurnResult => ({
    ok: false,
    text,
    needsNativeReview: needsReview || input.language !== "en" || hasSinhala(text),
    source: "notice",
    degraded: true,
    failure: { kind, ...(code ? { code } : {}) },
    verdict,
    repairsApplied,
    ...base(),
  });

  const noticeResult = (kind: LlmTurnFailureKind, verdict: VerdictSummary | null = null): LlmTurnResult => {
    const n = noticeFor(input.language);
    return degraded(kind, n.text, n.needsNativeReview, undefined, verdict);
  };

  const gatewayFailure = (res: GatewayFailure): LlmTurnResult => {
    const english = input.language === "en";
    return degraded("gateway", english ? res.userMessage.en : res.userMessage.si, !english, res.error.code);
  };

  const timedOut = (): boolean => input.deadlineAt !== undefined && now() >= input.deadlineAt;

  // ---- 1. model and tool rounds ----
  let toolsOpen = declarations.length > 0;
  let answer = "";
  for (;;) {
    if (timedOut()) return noticeResult("timeout");
    if (calls >= maxCalls) break;
    const res = await deps.gateway.generate(
      {
        class: "chat",
        system,
        messages: [...messages],
        ...(toolsOpen ? { tools: declarations as unknown as GatewayToolDeclaration[], toolMode: "auto" as const } : { toolMode: "none" as const }),
        ...(input.signal ? { signal: input.signal } : {}),
      },
      { sessionId: input.sessionKey },
    );
    calls++;
    if (!res.ok) return gatewayFailure(res);
    costLkr += res.costLkr;
    modelNames.add(res.modelName);
    const r = res.response;
    if (r.blocked) return noticeResult("blocked");
    if (toolsOpen && r.toolCalls.length > 0) {
      const parts: Part[] = [];
      if (r.text) parts.push({ type: "text", text: r.text });
      for (const call of r.toolCalls) parts.push({ type: "tool_call", call });
      messages.push({ role: "model", parts });
      const round = await deps.executor.runRound(turn, r.toolCalls.map((c) => ({ name: c.name, arguments: c.args })));
      messages.push({
        role: "tool",
        parts: round.results.map((tr, i) => ({ type: "tool_result" as const, callId: r.toolCalls[i]!.id, name: r.toolCalls[i]!.name, result: tr.modelText })),
      });
      if (!round.canContinue) toolsOpen = false;
      continue;
    }
    answer = r.text.trim();
    break;
  }
  if (!answer) return noticeResult("empty");

  // ---- 2. verification and repair ----
  const protectedStrings = promptProtectedStrings(system);
  const previous = deps.history?.lastAssistant(input.sessionKey);
  const verifyInput = (text: string): VerifyV2Input => ({
    answerText: text,
    language: input.language,
    toolEvidence: toVerifierEvidence(turn.evidence),
    sourcesFetchedThisTurn: retrievedSources(turn.evidence),
    searchPerformed: searchRan(turn.audit),
    userMessage: input.message,
    actor: input.actor.kind,
    performedActions: [],
    protectedStrings,
    policy: { ...deps.policy, honorific: { preference: honorific } },
    ...(input.exclusions ? { exclusions: input.exclusions } : {}),
    ...(previous ? { previousAssistantReply: previous } : {}),
  });

  const accept = (text: string, verdict: VerdictSummary): LlmTurnResult => {
    deps.history?.append(input.sessionKey, { user: input.message, assistant: text });
    return {
      ok: true,
      text,
      needsNativeReview: input.language !== "en" || hasSinhala(text),
      source: "llm",
      degraded: false,
      verdict,
      repairsApplied,
      ...base(),
    };
  };

  let current = answer;
  let result = verifyAnswerV2(verifyInput(current));
  if (result.verdict === "pass") return accept(current, explainVerdict(result));

  for (const repair of planRepair(result, verifyInput(current))) {
    if (repair.kind === "autofix") {
      const again = verifyAnswerV2(verifyInput(repair.text));
      repairsApplied.push("autofix");
      if (again.verdict === "pass") return accept(repair.text, explainVerdict(again));
      current = repair.text;
      result = again;
    } else if (repair.kind === "regenerate") {
      if (calls >= maxCalls || timedOut()) continue;
      repairsApplied.push("regenerate");
      messages.push(modelMessage(current), userMessage(repair.feedback));
      const res = await deps.gateway.generate({ class: "chat", system, messages: [...messages], toolMode: "none", ...(input.signal ? { signal: input.signal } : {}) }, { sessionId: input.sessionKey });
      calls++;
      if (!res.ok) return gatewayFailure(res);
      costLkr += res.costLkr;
      modelNames.add(res.modelName);
      if (res.response.blocked || !res.response.text.trim()) continue;
      const again = verifyAnswerV2(verifyInput(res.response.text.trim()));
      if (again.verdict === "pass") return accept(res.response.text.trim(), explainVerdict(again));
      current = res.response.text.trim();
      result = again;
    } else if (repair.kind === "redact") {
      if (!repair.text.trim()) continue;
      repairsApplied.push("redact");
      const again = verifyAnswerV2(verifyInput(repair.text));
      if (again.verdict === "pass") return accept(repair.text, explainVerdict(again));
    } else {
      // notice: nothing usable remains. An honest message, never a shopping fallback.
      return degraded("unverifiable", repair.text, repair.needsNativeReview, undefined, explainVerdict(result));
    }
  }
  return noticeResult("unverifiable", explainVerdict(result));
}
