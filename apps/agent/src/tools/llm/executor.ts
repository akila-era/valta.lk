import { z } from "zod";
import type { OllamaToolSchema } from "../../ollama/models";
import { shouldOfferFetch, shouldOfferSearch } from "../../search";
import { canonicalJson } from "../../util/canonical";
import type { ProposedAction } from "../../backend/types";
import type { Actor, CartLineSnapshot } from "../registry";
import type { ToolEvidence } from "./evidence";
import { capText, fenceUntrusted } from "./fence";
import { coerceToSchema, parseRawToolCall } from "./parse-call";
import { newTurnScratch, type LlmTool, type LlmToolDeps, type SessionFacts, type TurnScratch } from "./types";

/**
 * Runs the tool calls a MODEL proposes, under the SERVER's authority. The model chooses what to ask for; this layer decides whether it may, validates the
 * arguments against a strict schema, applies per-turn limits, runs the tool with a timeout, and returns (a) text for the model, always honest about failure, and
 * (b) structured `ToolEvidence` for the verifier. It never throws into the model loop: every problem becomes a failure result with a stable code.
 *
 * Authorisation: only tools in the lane's `enabled` set (further narrowed per turn) can run; "disabled" tools never run; research tools are not even OFFERED unless a
 * provider and quota allow them (so a model cannot pretend a search happened); browser tools and any unknown name are refused. Web-derived text is fenced as data.
 */
export interface TurnLimits {
  maxRounds: number;
  maxCallsPerRound: number;
  /** Calls allowed per tool per turn (counted even when they fail), with a default for tools not listed. */
  maxCallsPerTool: Record<string, number>;
  defaultMaxCallsPerTool: number;
  /** Total time tools may use in one turn. */
  totalBudgetMs: number;
  /** Text of ALL results shown to the model in one turn. */
  maxTurnResultChars: number;
}

export const DEFAULT_TURN_LIMITS: TurnLimits = Object.freeze({
  maxRounds: 3,
  maxCallsPerRound: 3,
  maxCallsPerTool: { web_search: 3, lookup_documentation: 3, fetch_page: 3, calculator: 4 },
  defaultMaxCallsPerTool: 4,
  totalBudgetMs: 12_000,
  maxTurnResultChars: 14_000,
});

/** One function the model may call, in a shape no provider owns. `parameters` is a plain JSON schema object (type "object", properties, required). */
export interface ToolDeclaration {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export type CallStatus =
  | "ok"
  | "tool_error"
  | "malformed_call"
  | "unknown_tool"
  | "not_enabled"
  | "invalid_args"
  | "duplicate"
  | "too_many_calls"
  | "tool_limit"
  | "rounds_exhausted"
  | "budget_exhausted"
  | "timeout"
  | "aborted";

/** Counts and names only: never the message, the query, the arguments or the result text. */
export interface AuditRecord {
  round: number;
  tool: string;
  status: CallStatus;
  code?: string;
  ms: number;
  resultChars: number;
  evidenceCount: number;
  repairs: string[];
  droppedFields: number;
}

export interface ToolCallResult {
  tool: string;
  status: CallStatus;
  code?: string;
  /** What the model is shown: fenced data on success, an honest error line otherwise. */
  modelText: string;
  evidence: ToolEvidence[];
  /** Set only by a successful cart proposal tool: the action the shopper's browser may apply after the shopper confirms. NOT something that happened. */
  proposal?: ProposedAction;
  audit: AuditRecord;
}

export interface RoundResult {
  round: number;
  results: ToolCallResult[];
  evidence: ToolEvidence[];
  /** True while another round of tool calls is still allowed (rounds and time left). */
  canContinue: boolean;
}

export interface TurnInit {
  actor: Actor;
  requestId: string;
  sessionKey: string;
  session?: SessionFacts;
  /** The browser's cart snapshot for this request (untrusted; the shop backend revalidates it). */
  cart?: readonly CartLineSnapshot[];
  signal?: AbortSignal;
  deps: LlmToolDeps;
  /** Narrows the lane's enabled set for this turn (for example to the shop tools only). */
  allow?: readonly string[];
  now?: () => number;
}

export interface TurnState {
  readonly init: TurnInit;
  readonly scratch: TurnScratch;
  readonly allowed: ReadonlySet<string>;
  readonly startedAt: number;
  round: number;
  resultChars: number;
  readonly callsPerTool: Map<string, number>;
  readonly seen: Set<string>;
  readonly evidence: ToolEvidence[];
  /** Cart proposals produced this turn, in order (the turn loop sends them to the browser as actions; the existing action verification still applies). */
  readonly proposals: ProposedAction[];
  readonly audit: AuditRecord[];
}

const TOOL_GAP = "The tool could not be used";

export class LlmToolExecutor {
  private readonly byName = new Map<string, LlmTool>();
  private readonly enabled: ReadonlySet<string>;
  readonly limits: TurnLimits;

  constructor(opts: { tools: readonly LlmTool[]; enabled?: readonly string[]; limits?: Partial<TurnLimits> }) {
    for (const t of opts.tools) {
      if (this.byName.has(t.name)) throw new Error("Duplicate tool name.");
      this.byName.set(t.name, t);
    }
    // Default lane: every tool EXCEPT cart proposals, which must be switched on by name (a lane that never mentions them can never propose a cart change).
    this.enabled = new Set(opts.enabled ?? opts.tools.filter((t) => t.auth !== "proposal").map((t) => t.name));
    this.limits = { ...DEFAULT_TURN_LIMITS, ...opts.limits, maxCallsPerTool: { ...DEFAULT_TURN_LIMITS.maxCallsPerTool, ...opts.limits?.maxCallsPerTool } };
  }

  startTurn(init: TurnInit): TurnState {
    const narrowed = init.allow ? new Set(init.allow) : null;
    const allowed = new Set([...this.enabled].filter((n) => (narrowed ? narrowed.has(n) : true) && this.byName.has(n)));
    const now = (init.now ?? Date.now)();
    return { init, scratch: newTurnScratch(), allowed, startedAt: now, round: 0, resultChars: 0, callsPerTool: new Map(), seen: new Set(), evidence: [], proposals: [], audit: [] };
  }

  private isOffered(t: LlmTool, deps: LlmToolDeps): boolean {
    if (t.auth === "disabled") return false;
    const availability = { provider: deps.search?.provider, providerEnabled: deps.search?.providerEnabled, quota: deps.search?.quota };
    if (t.auth === "search") return shouldOfferSearch(availability);
    if (t.auth === "external") return shouldOfferFetch(availability);
    return true;
  }

  /** The tool list to put in the model's request (Ollama shape): only tools that can really run this turn. */
  offered(turn: TurnState): OllamaToolSchema[] {
    return this.declarations(turn).map((d) => ({ type: "function" as const, function: { name: d.name, description: d.description, parameters: d.parameters } }));
  }

  /**
   * The same tools in a PROVIDER-NEUTRAL shape ({name, description, parameters as plain JSON schema}), for any gateway (Gemini function declarations, Ollama, others)
   * to convert. Only tools that can really run this turn are listed: a disabled or unavailable tool is never declared, so a model cannot call what it was not given.
   */
  declarations(turn: TurnState): ToolDeclaration[] {
    return [...turn.allowed]
      .map((n) => this.byName.get(n)!)
      .filter((t) => this.isOffered(t, turn.init.deps))
      .map((t) => ({ name: t.name, description: t.description, parameters: structuredClone(t.parameters) }));
  }

  /** Honest one-line statement of what is NOT available this turn, for the prompt (so the model never claims a capability it was not given). */
  unavailable(turn: TurnState): string[] {
    return [...turn.allowed].map((n) => this.byName.get(n)!).filter((t) => !this.isOffered(t, turn.init.deps)).map((t) => t.name);
  }

  async runRound(turn: TurnState, rawCalls: readonly unknown[]): Promise<RoundResult> {
    turn.round++;
    const results: ToolCallResult[] = [];
    for (let i = 0; i < rawCalls.length; i++) results.push(await this.runOne(turn, rawCalls[i], i));
    const evidence = results.flatMap((r) => r.evidence);
    const remaining = this.remainingMs(turn);
    return { round: turn.round, results, evidence, canContinue: turn.round < this.limits.maxRounds && remaining > 0 };
  }

  private remainingMs(turn: TurnState): number {
    return this.limits.totalBudgetMs - ((turn.init.now ?? Date.now)() - turn.startedAt);
  }

  private finish(turn: TurnState, started: number, tool: string, status: CallStatus, modelText: string, extra: { code?: string; evidence?: ToolEvidence[]; proposal?: ProposedAction; repairs?: string[]; droppedFields?: number } = {}): ToolCallResult {
    const evidence = status === "ok" ? (extra.evidence ?? []) : [];
    const audit: AuditRecord = {
      round: turn.round,
      tool,
      status,
      ...(extra.code ? { code: extra.code } : {}),
      ms: Math.max(0, (turn.init.now ?? Date.now)() - started),
      resultChars: modelText.length,
      evidenceCount: evidence.length,
      repairs: extra.repairs ?? [],
      droppedFields: extra.droppedFields ?? 0,
    };
    turn.audit.push(audit);
    turn.evidence.push(...evidence);
    const proposal = status === "ok" ? extra.proposal : undefined;
    if (proposal) turn.proposals.push(proposal);
    return { tool, status, ...(extra.code ? { code: extra.code } : {}), modelText, evidence, ...(proposal ? { proposal } : {}), audit };
  }

  private errorLine(tool: string, code: string, message: string): string {
    return `TOOL_ERROR tool=${tool} code=${code}: ${message}`;
  }

  private async runOne(turn: TurnState, raw: unknown, index: number): Promise<ToolCallResult> {
    const now = turn.init.now ?? Date.now;
    const started = now();
    const parsed = parseRawToolCall(raw);
    if (!parsed.ok) {
      const code = `MALFORMED_${parsed.reason.toUpperCase()}`;
      return this.finish(turn, started, "unknown", "malformed_call", this.errorLine("unknown", code, "The tool call could not be read. Send a call with a tool name and a JSON object of arguments."), { code, repairs: parsed.repairs });
    }
    const name = parsed.name;
    const tool = this.byName.get(name);
    if (!tool) return this.finish(turn, started, "unknown", "unknown_tool", this.errorLine("unknown", "UNKNOWN_TOOL", "No such tool."), { code: "UNKNOWN_TOOL", repairs: parsed.repairs });
    if (turn.round > this.limits.maxRounds) return this.finish(turn, started, name, "rounds_exhausted", this.errorLine(name, "ROUNDS_EXHAUSTED", "The tool budget for this turn is used up. Answer with what you already have, and say what is missing."), { code: "ROUNDS_EXHAUSTED", repairs: parsed.repairs });
    if (index >= this.limits.maxCallsPerRound) return this.finish(turn, started, name, "too_many_calls", this.errorLine(name, "TOO_MANY_CALLS", `At most ${this.limits.maxCallsPerRound} tool calls per round.`), { code: "TOO_MANY_CALLS", repairs: parsed.repairs });
    if (!turn.allowed.has(name) || !this.isOffered(tool, turn.init.deps)) {
      const research = tool.auth === "search" || tool.auth === "external";
      const msg = research ? "Web research is not available right now. Do not say that you searched or read a page." : "This tool is not available.";
      return this.finish(turn, started, name, "not_enabled", this.errorLine(name, "NOT_ENABLED", msg), { code: "NOT_ENABLED", repairs: parsed.repairs });
    }
    const limit = this.limits.maxCallsPerTool[name] ?? this.limits.defaultMaxCallsPerTool;
    const used = turn.callsPerTool.get(name) ?? 0;
    if (used >= limit) return this.finish(turn, started, name, "tool_limit", this.errorLine(name, "TOOL_LIMIT", `At most ${limit} calls to ${name} per turn.`), { code: "TOOL_LIMIT", repairs: parsed.repairs });

    const coerced = coerceToSchema(tool, parsed.args);
    const repairs = [...new Set([...parsed.repairs, ...coerced.repairs])];
    const valid = tool.args.safeParse(coerced.args);
    if (!valid.success) {
      // Field names come from OUR schema; the names of unexpected keys were dropped before validation and are never echoed.
      const fields = [...new Set(valid.error.issues.map((i) => i.path.join(".") || "(root)"))].slice(0, 6).join(", ");
      return this.finish(turn, started, name, "invalid_args", this.errorLine(name, "INVALID_ARGUMENTS", `Invalid or missing arguments: ${fields}.`), { code: "INVALID_ARGUMENTS", repairs, droppedFields: coerced.droppedFields });
    }
    const key = `${name}:${canonicalJson(valid.data)}`;
    if (turn.seen.has(key)) return this.finish(turn, started, name, "duplicate", this.errorLine(name, "DUPLICATE_CALL", "This exact call was already made this turn; use its earlier result."), { code: "DUPLICATE_CALL", repairs, droppedFields: coerced.droppedFields });
    turn.seen.add(key);
    turn.callsPerTool.set(name, used + 1);

    const remaining = this.remainingMs(turn);
    if (remaining <= 0) return this.finish(turn, started, name, "budget_exhausted", this.errorLine(name, "BUDGET_EXHAUSTED", "The time for tools in this turn is used up. Answer with what you already have."), { code: "BUDGET_EXHAUSTED", repairs, droppedFields: coerced.droppedFields });

    const timeoutMs = Math.max(1, Math.min(tool.timeoutMs, remaining));
    const outer = turn.init.signal;
    const signal = AbortSignal.any([...(outer ? [outer] : []), AbortSignal.timeout(timeoutMs)]);
    let run;
    try {
      run = await new Promise<Awaited<ReturnType<LlmTool["execute"]>>>((resolve, reject) => {
        const onAbort = () => reject(outer?.aborted ? new AbortedMarker() : new TimeoutMarker());
        if (signal.aborted) return onAbort();
        signal.addEventListener("abort", onAbort, { once: true });
        tool
          .execute(valid.data as never, { actor: turn.init.actor, requestId: turn.init.requestId, sessionKey: turn.init.sessionKey, signal, session: turn.init.session ?? {}, ...(turn.init.cart ? { cart: turn.init.cart } : {}), turn: turn.scratch, deps: turn.init.deps, now })
          .then(resolve, reject)
          .finally(() => signal.removeEventListener("abort", onAbort));
      });
    } catch (e) {
      if (e instanceof TimeoutMarker) return this.finish(turn, started, name, "timeout", this.errorLine(name, "TIMEOUT", "The tool took too long. Do not claim it returned a result."), { code: "TIMEOUT", repairs, droppedFields: coerced.droppedFields });
      if (e instanceof AbortedMarker) return this.finish(turn, started, name, "aborted", this.errorLine(name, "ABORTED", "The request was cancelled."), { code: "ABORTED", repairs, droppedFields: coerced.droppedFields });
      return this.finish(turn, started, name, "tool_error", this.errorLine(name, "TOOL_FAILED", `${TOOL_GAP}. Do not claim it returned a result.`), { code: "TOOL_FAILED", repairs, droppedFields: coerced.droppedFields });
    }
    if (!run.ok) return this.finish(turn, started, name, "tool_error", this.errorLine(name, run.code, run.message), { code: run.code, repairs, droppedFields: coerced.droppedFields });

    let json: string;
    try {
      json = JSON.stringify(run.data) ?? "null";
    } catch {
      return this.finish(turn, started, name, "tool_error", this.errorLine(name, "RESULT_UNREADABLE", "The tool returned data that cannot be shown."), { code: "RESULT_UNREADABLE", repairs, droppedFields: coerced.droppedFields });
    }
    const room = Math.max(0, this.limits.maxTurnResultChars - turn.resultChars);
    const cap = Math.min(tool.maxResultChars, room);
    if (cap < 200) return this.finish(turn, started, name, "tool_error", this.errorLine(name, "TURN_RESULT_LIMIT", "No room is left for more tool output in this turn."), { code: "TURN_RESULT_LIMIT", repairs, droppedFields: coerced.droppedFields });
    const shown = capText(json, cap).text;
    turn.resultChars += shown.length;
    // All results are shown as data. Web-derived and catalogue text can contain anything, so it is always fenced.
    const modelText = fenceUntrusted(shown, name);
    return this.finish(turn, started, name, "ok", modelText, { evidence: run.evidence, ...(run.proposal ? { proposal: run.proposal } : {}), repairs, droppedFields: coerced.droppedFields });
  }
}

class TimeoutMarker extends Error {}
class AbortedMarker extends Error {}

/** Re-exported so callers can build a typed schema list without importing zod. */
export type ToolArgsOf<T extends LlmTool> = z.output<T["args"]>;
