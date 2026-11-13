import { BROWSER_LIMITS } from "./protocol";
import { BROWSER_TOOL_NAMES, IDEMPOTENT_TOOLS, type BrowserToolName, type BrowserToolResult, type ConfirmationProposal, type ElementView, type PageView } from "./tools";
import type { BrowserToolService } from "./service";
import type { SessionOwner, BrowserSessionManager } from "./sessions";

/**
 * The controlled action loop:
 *   request → (planner) next step → policy validation → tool execution → verification → next decision → outcome
 *
 * The planner is an interface: M3-A tests it with scripted planners; M3-E will plug a model in. Whatever plans, the loop enforces:
 *  - only the typed browser tools, never a session id of the planner's choosing (the loop supplies its own);
 *  - a step budget, a deadline and cancellation, and the session is always destroyed at the end;
 *  - an expectation is checked after a step, and the planner is told when it was NOT met;
 *  - read-only steps may be retried once after re-inspecting the page; a step that changes anything is never repeated blindly;
 *  - a finish is accepted only if the claims it makes are re-verified against a fresh page read, so the assistant never says it
 *    did something it did not do. The planner's own words are never shown to the shopper: the outcome carries codes.
 *  - an action that needs the shopper's confirmation pauses the whole task; only a token from the approval path resumes it.
 */
export interface Expectation {
  urlPathIncludes?: string;
  textIncludes?: string;
  /** Absolute cart count in the browser session. */
  cartCount?: number;
}

export interface PlannedStep {
  tool: string;
  args: Record<string, unknown>;
  expect?: Expectation;
  confirmation?: string;
}

export type PlannerDecision = { kind: "step"; step: PlannedStep } | { kind: "finish"; claims: Expectation[] };

export interface HistoryEntry {
  tool: string;
  ok: boolean;
  verified: boolean;
  expectationMet: boolean | null;
  reason?: string;
}

export interface LoopContext {
  goal: string;
  stepNumber: number;
  history: HistoryEntry[];
  /** The latest page as the model may see it (fenced, capped, untrusted). */
  page?: PageView;
  /** Elements from the latest `browser.find_elements` result, with the refs a click or type may use. */
  elements?: ElementView[];
  /** What happened in the previous step, in plain codes. */
  note?: "expectation_not_met" | "blocked" | "duplicate_blocked" | "failed" | "retry_done";
}

export interface ActionPlanner {
  next(ctx: LoopContext): Promise<PlannerDecision>;
}

export type TaskStatus = "completed" | "needs_confirmation" | "blocked" | "failed" | "step_limit" | "timeout" | "cancelled";

export interface PausedTask {
  goal: string;
  step: PlannedStep;
  proposal: ConfirmationProposal;
  sessionId: string;
  history: HistoryEntry[];
  stepsUsed: number;
}

export interface TaskOutcome {
  status: TaskStatus;
  /** Why it did not complete (a code), for the shopper-facing template and for audit. */
  reason?: string;
  history: HistoryEntry[];
  stepsUsed: number;
  paused?: PausedTask;
  /** True only when a finish was accepted after its claims were re-verified. */
  claimsVerified: boolean;
  finalPage?: PageView;
}

export interface RunnerOptions {
  maxSteps?: number;
  deadlineMs?: number;
  now?: () => number;
  /** After this many blocked attempts the task stops: repeated probing is not retried. */
  maxPolicyBlocks?: number;
}

const BLOCKING = new Set(["blocked_url", "blocked_redirect", "blocked_resource", "refused_financial", "refused_sensitive_field", "confirmation_invalid"]);

function expectationMet(e: Expectation, page: PageView | undefined, cartCount: number | undefined): boolean {
  if (!page) return false;
  if (e.urlPathIncludes !== undefined) {
    let path = "";
    try {
      path = new URL(page.url).pathname + new URL(page.url).search;
    } catch {
      return false;
    }
    if (!path.includes(e.urlPathIncludes)) return false;
  }
  if (e.textIncludes !== undefined && !page.text.toLowerCase().includes(e.textIncludes.toLowerCase())) return false;
  if (e.cartCount !== undefined && cartCount !== e.cartCount) return false;
  return true;
}

export class BrowserTaskRunner {
  private readonly maxSteps: number;
  private readonly deadlineMs: number;
  private readonly now: () => number;
  private readonly maxBlocks: number;

  constructor(
    private readonly service: BrowserToolService,
    private readonly sessions: BrowserSessionManager,
    opts: RunnerOptions = {},
  ) {
    this.maxSteps = Math.min(opts.maxSteps ?? BROWSER_LIMITS.maxStepsPerTask, BROWSER_LIMITS.maxStepsPerTask);
    this.deadlineMs = Math.min(opts.deadlineMs ?? BROWSER_LIMITS.maxTaskSeconds * 1000, BROWSER_LIMITS.maxTaskSeconds * 1000);
    this.now = opts.now ?? Date.now;
    this.maxBlocks = opts.maxPolicyBlocks ?? 2;
  }

  run(owner: SessionOwner, goal: string, planner: ActionPlanner, signal?: AbortSignal): Promise<TaskOutcome> {
    return this.loop(owner, { goal, history: [], stepsUsed: 0, sessionId: undefined, pending: undefined }, planner, signal);
  }

  /** Continues a paused task after the shopper approved the proposal. `token` comes from the approval path, never from the planner. */
  resume(owner: SessionOwner, paused: PausedTask, token: string, planner: ActionPlanner, signal?: AbortSignal): Promise<TaskOutcome> {
    return this.loop(owner, { goal: paused.goal, history: [...paused.history], stepsUsed: paused.stepsUsed, sessionId: paused.sessionId, pending: { ...paused.step, confirmation: token } }, planner, signal);
  }

  private async loop(
    owner: SessionOwner,
    state: { goal: string; history: HistoryEntry[]; stepsUsed: number; sessionId: string | undefined; pending: PlannedStep | undefined },
    planner: ActionPlanner,
    signal?: AbortSignal,
  ): Promise<TaskOutcome> {
    const started = this.now();
    const history = state.history;
    let sessionId = state.sessionId;
    let stepsUsed = state.stepsUsed;
    let page: PageView | undefined;
    let elements: ElementView[] | undefined;
    let note: LoopContext["note"];
    let blocks = 0;
    let duplicates = 0;
    const executed = new Set<string>();
    let pending = state.pending;
    let paused: PausedTask | undefined;

    const finish = async (status: TaskStatus, reason?: string, extra: Partial<TaskOutcome> = {}): Promise<TaskOutcome> => {
      if (!paused && sessionId) await this.sessions.close(sessionId); // always clean up, except while waiting for the shopper
      return { status, ...(reason ? { reason } : {}), history, stepsUsed, claimsVerified: false, ...(paused ? { paused } : {}), ...(page ? { finalPage: page } : {}), ...extra };
    };

    for (;;) {
      if (signal?.aborted) return finish("cancelled");
      if (this.now() - started > this.deadlineMs) return finish("timeout", "deadline");
      if (stepsUsed >= this.maxSteps) return finish("step_limit");

      let step: PlannedStep;
      if (pending) {
        step = pending;
        pending = undefined;
      } else {
        const decision = await planner.next({ goal: state.goal, stepNumber: stepsUsed, history: [...history], ...(page ? { page } : {}), ...(elements ? { elements } : {}), ...(note ? { note } : {}) });
        note = undefined;
        if (decision.kind === "finish") {
          // Verify every claim against a FRESH read of the page. The planner's words are never accepted on their own.
          if (decision.claims.length === 0) return finish("failed", "no_verifiable_claim");
          if (!sessionId) return finish("failed", "no_session");
          const fresh = await this.service.call(owner, "browser.get_page_state", { sessionId });
          if (!fresh.ok) return finish("failed", "claim_check_failed");
          page = fresh.page;
          const cart = this.service.lastPage(sessionId)?.cartCount;
          const allMet = decision.claims.every((c) => expectationMet(c, page, cart));
          if (!allMet) return finish("failed", "claim_not_verified");
          return finish("completed", undefined, { claimsVerified: true });
        }
        step = decision.step;
      }

      // Policy validation, before anything runs. The planner can name a tool but cannot choose the session or smuggle other fields.
      if (!Object.hasOwn(Object.fromEntries(BROWSER_TOOL_NAMES.map((n) => [n, 1])), step.tool)) return finish("failed", "unknown_tool");
      const tool = step.tool as BrowserToolName;
      const args: Record<string, unknown> = { ...step.args };
      if (tool === "browser.open_page" || tool === "browser.search") {
        if (sessionId) args.sessionId = sessionId;
        else delete args.sessionId;
      } else if (sessionId) args.sessionId = sessionId;
      else return finish("failed", "no_session");
      if (step.confirmation) args.confirmation = step.confirmation;

      // A step that changes the page is never run twice with the same target, whatever the planner says.
      const key = `${tool}|${String(args.ref ?? "")}|${page ? new URL(page.url).pathname : ""}|${String(args.text ?? "")}`;
      if (!IDEMPOTENT_TOOLS.has(tool)) {
        if (executed.has(key)) {
          history.push({ tool, ok: false, verified: false, expectationMet: null, reason: "duplicate_non_idempotent" });
          note = "duplicate_blocked";
          if (++duplicates >= 2) return finish("failed", "repeated_non_idempotent");
          continue;
        }
        executed.add(key);
      }

      let result: BrowserToolResult = await this.service.call(owner, tool, args);
      stepsUsed++;

      // Safe retry: a read-only step that failed for a transient reason is retried ONCE, after looking at where the page is now.
      if (!result.ok && result.retryable && IDEMPOTENT_TOOLS.has(tool) && stepsUsed < this.maxSteps) {
        if (sessionId) {
          await this.service.call(owner, "browser.get_page_state", { sessionId });
          stepsUsed++;
        }
        result = await this.service.call(owner, tool, args);
        stepsUsed++;
        note = "retry_done";
      }

      if (result.ok) {
        sessionId = result.sessionId;
        if (result.page) page = result.page;
        if (result.elements) elements = result.elements;
        else if (tool !== "browser.find_elements") elements = undefined; // refs are only valid for the page they came from
        let met: boolean | null = null;
        if (step.expect) {
          const cart = this.service.lastPage(result.sessionId)?.cartCount;
          met = expectationMet(step.expect, result.page ?? page, cart);
          if (!met) note = "expectation_not_met";
        }
        history.push({ tool, ok: true, verified: result.verified, expectationMet: met });
        continue;
      }

      history.push({ tool, ok: false, verified: false, expectationMet: null, reason: result.reason });
      if (result.sessionId) sessionId = result.sessionId;
      if (result.reason === "confirmation_required" && result.proposal && sessionId) {
        history.pop(); // the pause is not a failure
        const waiting: PlannedStep = { tool: step.tool, args: step.args, ...(step.expect ? { expect: step.expect } : {}) };
        paused = { goal: state.goal, step: waiting, proposal: result.proposal, sessionId, history: [...history], stepsUsed };
        return finish("needs_confirmation", "confirmation_required");
      }
      if (BLOCKING.has(result.reason)) {
        note = "blocked";
        if (++blocks >= this.maxBlocks) return finish("blocked", result.reason);
        // a destroyed session (off-site landing) cannot continue
        if (result.reason === "blocked_redirect") sessionId = undefined;
        continue;
      }
      if (result.reason === "session_expired" || result.reason === "not_your_session" || result.reason === "step_limit" || result.reason === "too_many_sessions") return finish("failed", result.reason);
      note = "failed";
    }
  }
}
