import { randomUUID } from "node:crypto";
import { Card, ClientAction } from "../contract/schemas";
import type { ChatPipeline, PipelineEvent, PipelineInput, PipelineResult } from "../http/pipeline";
import { MODELS } from "../ollama/models";
import { detectLanguage } from "../router/language";
import { normalizeMatch } from "../router/normalize";
import { checkSafety, type SafetyReason } from "../router/safety";
import { routeMessage } from "../router/router";
import { extractEntities } from "../router/entities";
import { renderTemplate, suggestionsFor } from "../router/templates";
import type { PlannedCall, RouteDecision, TemplateKey, Vocabulary } from "../router/types";
import { emptySession, sessionKey, type SessionState, type TtlLruStore } from "../session/store";
import type { ToolRegistry } from "../tools/registry";
import { runToolCalls, type ToolOutcome } from "../tools/runner";
import { hasSinhala } from "../util/script";
import { verifyResponse, type VerifyFailure } from "../verify/verifier";
import type { EnglishPlanner, KnownProduct } from "./english-planner";
import type { ChatResponder } from "./chat-responder";
import type { SinhalaPolisher } from "./polisher";

export interface RoutingDeps {
  registry: ToolRegistry;
  vocab: () => Promise<Vocabulary>;
  sessions: TtlLruStore<SessionState>;
  /** Qwen tool selection for English messages. Without it English messages use the deterministic router too. */
  planner?: EnglishPlanner;
  /**
   * "qwen" (default, as specified): Qwen chooses tools for English messages. "router-first": the deterministic router answers when
   * it recognises the intent, and Qwen is only used when the router abstains. Added after the M1-B evaluation, where the router
   * chose the right tool more often than Qwen on the same 100 English prompts. Off by default; the owner decides.
   */
  englishMode?: "qwen" | "router-first";
  /**
   * Optional natural replies for small talk and general questions (Qwen, verified; see chat-responder.ts). Used only for Latin-script
   * messages the assistant has no tool for; anything the verifier does not accept falls back to the fixed text. Off by default.
   */
  chat?: ChatResponder;
  /** Optional SinhalaLLM rewording of fixed, fact-free templates. Off by default. */
  polisher?: SinhalaPolisher;
  /** M1-C: turns tool results into cards. Until then no cards are produced. */
  cardsFrom?: (outcomes: ToolOutcome[]) => Card[];
  shownProductIdsFrom?: (outcomes: ToolOutcome[]) => string[];
  /** Called with a short failure code (never content) when the response verifier rejects an answer. */
  onVerifierFailure?: (info: { requestId: string; code: VerifyFailure }) => void;
  /** Counts tool calls and failures (names and statuses only). */
  metrics?: { tool(tool: string, status: string): void; toolBatchMs(ms: number): void };
  now?: () => number;
}

const REFUSAL: Record<SafetyReason, TemplateKey> = {
  injection: "refuse_injection",
  price_manipulation: "refuse_price",
  exfiltration: "refuse_exfil",
  sensitive_input: "refuse_sensitive",
};

const newActionId = () => randomUUID().replace(/-/g, "").slice(0, 24);

/** Product ids that exist in the vocabulary, so a model can never reach a tool with an id it made up. */
function unknownIdIn(call: PlannedCall, known: Set<string>): boolean {
  const a = call.arguments as { productId?: unknown; productIds?: unknown };
  if (typeof a.productId === "string" && !known.has(a.productId)) return true;
  if (Array.isArray(a.productIds)) return a.productIds.some((id) => typeof id !== "string" || !known.has(id));
  return false;
}

/** A search filter naming a category slug or brand that the catalogue does not have. */
function unknownFilterIn(call: PlannedCall, categories: Set<string>, brands: Set<string>): boolean {
  if (call.name !== "search_products") return false;
  const a = call.arguments as { category?: unknown; brand?: unknown };
  if (typeof a.category === "string" && !categories.has(a.category)) return true;
  if (typeof a.brand === "string" && !brands.has(a.brand.toLowerCase())) return true;
  return false;
}


type Ok = Extract<ToolOutcome, { status: "ok" }>;
type Failed = Exclude<ToolOutcome, { status: "ok" }>;

/** Chooses the fixed reply text from what the tools returned. Facts are in the cards; this text never contains any. */
function templateForOutcomes(outcomes: ToolOutcome[], decision: RouteDecision): TemplateKey {
  const ok = outcomes.filter((o): o is Ok => o.status === "ok");
  const popularity = decision.reason === "popularity_unavailable";
  const failed = outcomes.filter((o): o is Failed => o.status !== "ok");
  if (ok.length === 0) {
    const code = failed.find((f) => f.status === "error")?.error.code;
    if (code === "VARIANT_REQUIRED" || code === "VARIANT_NOT_FOUND") return "clarify_variant";
    if (code === "OUT_OF_STOCK" || code === "QUANTITY_UNAVAILABLE" || code === "LIMIT") return "cart_unavailable";
    if (code === "NOT_IN_CART") return "cart_not_in_cart";
    if (code === "NOT_FOUND") return decision.intent === "order_status" ? "order_none" : "clarify_product";
    if (failed.every((f) => f.status === "invalid_args" || f.status === "unknown_tool")) return "clarify_what";
    return "tool_failed";
  }
  const r = ok[0]!.data as { kind?: string; total?: number; items?: unknown[]; orders?: unknown[]; deliveryCents?: number } | undefined;
  switch (r?.kind) {
    case "search":
      return r.total === 0 ? "no_results" : popularity ? "popular_unavailable" : "tools_ran";
    case "accessories":
      return (r.items?.length ?? 0) === 0 ? "no_accessories" : "tools_ran";
    case "proposal":
      return "cart_proposed";
    case "orders":
      return (r.orders?.length ?? 0) === 0 ? "order_none" : "tools_ran";
    case "cart":
      // A delivery-charge question is answered only when the backend verified the charge; otherwise say so.
      return decision.topic === "delivery_charge" && r.deliveryCents === undefined ? "store_info_other" : "tools_ran";
    default:
      return "tools_ran";
  }
}

export class RoutingPipeline implements ChatPipeline {
  private readonly now: () => number;
  constructor(private readonly deps: RoutingDeps) {
    this.now = deps.now ?? Date.now;
  }

  async run(input: PipelineInput, emit: (e: PipelineEvent) => void): Promise<PipelineResult> {
    const { request, identity } = input;
    const message = request.message;
    const lang = detectLanguage(message, { locale: request.locale });
    const tplLang: "en" | "si" = lang.script === "si" || lang.script === "mixed" ? "si" : "en";
    const actor = identity.kind === "customer" ? ({ kind: "customer", customerId: identity.customerId } as const) : ({ kind: "guest" } as const);
    const priority = identity.kind === "customer" ? "customer" : "guest";
    const key = sessionKey(identity, request.sessionId);
    const session = deps_get(this.deps.sessions, key);

    emit({ type: "status", phase: "routing" });

    const finish = (templateKey: TemplateKey, extra: { actions?: ClientAction[]; cards?: Card[]; model?: string | null; degraded?: boolean; queuedMs?: number; polishable?: boolean; outcomes?: ToolOutcome[]; shownIds?: string[]; modelReply?: string; catalogueNames?: string[] } = {}): PipelineResult => this.compose(input, lang, tplLang, templateKey, extra, emit, session, key);

    /** A clarification, written by the model when that is enabled and the message is in Latin script; otherwise the fixed text. */
    const clarifyOrChat = async (extra: { model?: string | null; queuedMs?: number } = {}): Promise<PipelineResult> => {
      if (!this.deps.chat || lang.script === "si") return finish("clarify_what", extra);
      emit({ type: "status", phase: "writing" });
      const text = await this.deps.chat.reply({ message, priority, deadlineAt: input.deadlineAt, signal: input.signal });
      if (text === null) return finish("clarify_what", extra);
      const v = await this.deps.vocab().catch(() => null);
      return finish("clarify_what", { ...extra, model: MODELS.qwen, modelReply: text, catalogueNames: v ? [...v.products.map((x) => x.name), ...v.brands] : [] });
    };

    // 1. Safety first, before any model or tool, in every language.
    const safety = checkSafety(message);
    if (safety.blocked) {
      session.language = lang.language;
      this.deps.sessions.set(key, session);
      return finish(REFUSAL[safety.reason]);
    }

    let vocab: Vocabulary;
    try {
      vocab = await this.deps.vocab();
    } catch {
      // The catalogue cannot be read (for example the ERP is down): say so with a fixed text instead of failing the request.
      return finish("tool_failed");
    }
    const ctx = { ...(request.context?.productId ? { contextProductId: request.context.productId } : {}), lastShownProductIds: session.lastShownProductIds, cart: request.cart };
    const matchText = normalizeMatch(message);
    const det = routeMessage({ matchText, rawText: message, vocab, context: ctx });

    // Guests are never given an order lookup by the assistant, in any language: hand them to the existing Track order page.
    if (actor.kind === "guest" && det.intent === "order_status") {
      session.lastIntent = det.intent;
      return finish("order_guest_handoff", { actions: [{ type: "navigate", actionId: newActionId(), href: "/track-order" }] });
    }

    let decision: RouteDecision = det;
    let calls: PlannedCall[] = det.calls;
    let model: string | null = null;
    let queuedMs = 0;

    // 2. English: Qwen picks tools, except for greetings and fixed hand-offs that need no model.
    const routerKnowsIt = (this.deps.englishMode ?? "router-first") === "router-first" && det.intent !== "unknown";
    if (lang.path === "english" && this.deps.planner && det.intent !== "smalltalk" && det.action !== "handoff" && !routerKnowsIt) {
      const known = new Map<string, KnownProduct>();
      const add = (id: string | undefined) => {
        const p = id ? vocab.products.find((x) => x.id === id) : undefined;
        if (p) known.set(p.id, { id: p.id, name: p.name });
      };
      for (const p of extractEntities(message, vocab).products) add(p.id);
      add(request.context?.productId);
      for (const id of session.lastShownProductIds.slice(0, 3)) add(id);
      for (const c of request.cart.slice(0, 3)) add(c.productId);

      emit({ type: "status", phase: "routing" });
      const plan = await this.deps.planner.plan({
        message,
        actor: actor.kind,
        priority,
        deadlineAt: input.deadlineAt,
        signal: input.signal,
        page: request.context?.page,
        candidates: [...known.values()].slice(0, 6),
        cartCount: request.cart.length,
      });
      model = MODELS.qwen;
      queuedMs = plan.queuedMs;
      if (plan.degraded) return finish("busy_degraded", { degraded: true });
      if (plan.noTool && !plan.invalid) return clarifyOrChat({ model, queuedMs });
      if (plan.invalid || plan.calls.length === 0) return finish("clarify_what", { model, queuedMs });
      calls = plan.calls.map((c) => ({ name: String(c.name), arguments: (c.arguments ?? {}) as Record<string, unknown> }));
      decision = { ...det, action: "tool", calls, intent: det.intent, reason: "qwen_plan", template: "tools_ran" };
    }

    // 3. Static answers, clarifications and hand-offs need no tool.
    if (decision.action === "static") return this.maybePolish(input, finish, decision.template ?? "clarify_what", lang.script);
    if (decision.action === "clarify") return (decision.template ?? "clarify_what") === "clarify_what" ? clarifyOrChat({ model, queuedMs }) : finish(decision.template ?? "clarify_what", { model, queuedMs });
    if (decision.action === "handoff") {
      const href = decision.navigate ?? "/checkout";
      session.lastIntent = decision.intent;
      return finish(decision.template ?? "clarify_what", { actions: [{ type: "navigate", actionId: newActionId(), href }], model, queuedMs });
    }

    // 4. Guests are never given an order lookup by the assistant: hand them to the existing Track order page.
    if (actor.kind === "guest" && calls.some((c) => c.name === "get_order_status")) {
      return finish("order_guest_handoff", { actions: [{ type: "navigate", actionId: newActionId(), href: "/track-order" }], model, queuedMs });
    }

    // 5. Server-side allow-lists: a product id, category or brand that is not in the catalogue never reaches a tool.
    //    (Qwen sometimes invents filters such as category "electronics" or brand "volta"; those searches would only mislead.)
    const known = new Set(vocab.products.map((p) => p.id));
    const categories = new Set(vocab.categories.map((c) => c.slug));
    const brands = new Set(vocab.brands.map((b) => b.toLowerCase()));
    const idOk = calls.filter((c) => !unknownIdIn(c, known));
    const safeCalls = idOk.filter((c) => !unknownFilterIn(c, categories, brands));
    if (safeCalls.length === 0) return finish(idOk.length === 0 ? "clarify_product" : "clarify_what", { model, queuedMs });

    emit({ type: "status", phase: "tool" });
    const toolStart = this.now();
    const outcomes = await runToolCalls(this.deps.registry, safeCalls, { actor, requestId: input.requestId, signal: input.signal, cart: request.cart });
    if (this.deps.metrics) {
      this.deps.metrics.toolBatchMs(this.now() - toolStart);
      for (const o of outcomes) this.deps.metrics.tool(o.tool, o.status);
    }

    const actions: ClientAction[] = [];
    for (const o of outcomes) {
      const data = o.status === "ok" && o.data && typeof o.data === "object" ? (o.data as { kind?: unknown; clientAction?: unknown }) : undefined;
      const proposed = data?.kind === "proposal" ? data.clientAction : undefined; // only a real proposal result can carry an action
      const parsed = proposed ? ClientAction.safeParse(proposed) : null;
      if (parsed?.success) {
        // Every cart change is a proposal the shopper must confirm: whatever a backend says, it is "ask".
        actions.push(parsed.data.type.startsWith("cart.") ? ({ ...parsed.data, confirm: "ask" } as ClientAction) : parsed.data);
      }
    }
    const cards = this.deps.cardsFrom?.(outcomes) ?? [];
    const shown = this.deps.shownProductIdsFrom?.(outcomes) ?? [];
    session.lastIntent = decision.intent;
    const e = decision.entities;
    if (e.brand) session.slots.brand = e.brand;
    if (e.categorySlug) session.slots.category = e.categorySlug;
    if (e.maxPriceLkr !== undefined) session.slots.budgetLkr = e.maxPriceLkr;

    return finish(templateForOutcomes(outcomes, decision), { actions, cards, model, queuedMs, outcomes, shownIds: shown });
  }

  private async maybePolish(input: PipelineInput, finish: (k: TemplateKey, x?: { polishable?: boolean }) => PipelineResult, key: TemplateKey, script: string): Promise<PipelineResult> {
    const base = finish(key);
    if (base.reply.text === renderTemplate("verification_failed", base.needsNativeReview ? "si" : "en").text) return base;
    if (!this.deps.polisher || script !== "si" || base.reply.source !== "template") return base;
    const tpl = renderTemplate(key, "si");
    if (!tpl.polishable) return base;
    const r = await this.deps.polisher.polish(tpl.text, { priority: input.identity.kind === "customer" ? "customer" : "guest", deadlineAt: input.deadlineAt, signal: input.signal });
    if (!r.polished) return base;
    const polished: PipelineResult = { ...base, reply: { text: r.text, source: "sinhala-llm" }, needsNativeReview: true, meta: { ...base.meta, model: MODELS.sinhala } };
    // A reworded text goes through the same verifier as every other answer; a rejection keeps the fixed template.
    const v = verifyResponse({ actor: input.identity.kind, outcomes: [], cards: polished.cards, actions: polished.actions, reply: polished.reply, tplLang: "si", language: polished.language, needsNativeReview: true });
    if (!v.ok) {
      this.deps.onVerifierFailure?.({ requestId: input.requestId, code: v.code });
      return base;
    }
    return polished;
  }

  private compose(
    input: PipelineInput,
    lang: ReturnType<typeof detectLanguage>,
    tplLang: "en" | "si",
    key: TemplateKey,
    extra: { actions?: ClientAction[]; cards?: Card[]; model?: string | null; degraded?: boolean; queuedMs?: number; outcomes?: ToolOutcome[]; shownIds?: string[]; modelReply?: string; catalogueNames?: string[] },
    emit: (e: PipelineEvent) => void,
    session: SessionState,
    sessionKeyValue: string,
  ): PipelineResult {
    let tpl = renderTemplate(key, tplLang);
    let templateKey = key;
    let cards = (extra.cards ?? []).slice(0, 8);
    let actions = (extra.actions ?? []).slice(0, 4);
    // Provisional Sinhala rule: anything that is not plain English, or contains Sinhala script, needs native review.
    let needsNativeReview = lang.language !== "en" || hasSinhala(tpl.text);

    // A model-written reply is used only if the verifier accepts it; otherwise the fixed template below is used, as if there were none.
    let replyText = tpl.text;
    let replySource: "template" | "qwen" = "template";
    if (extra.modelReply !== undefined) {
      const mv = verifyResponse({
        actor: input.identity.kind,
        outcomes: [],
        cards: [],
        actions: [],
        reply: { text: extra.modelReply, source: "qwen" },
        tplLang,
        language: lang.language,
        needsNativeReview,
        catalogueNames: extra.catalogueNames ?? [],
      });
      if (mv.ok) {
        replyText = extra.modelReply.trim();
        replySource = "qwen";
      } else this.deps.onVerifierFailure?.({ requestId: input.requestId, code: mv.code });
    }

    // Verification: nothing is emitted or remembered until the whole answer has been checked against this request's tool results.
    const verdict = verifyResponse({
      actor: input.identity.kind,
      outcomes: extra.outcomes ?? [],
      cards,
      actions,
      reply: { text: replyText, source: replySource },
      templateKey,
      tplLang,
      language: lang.language,
      needsNativeReview,
      suggestions: suggestionsFor(templateKey, tplLang),
      ...(replySource === "qwen" ? { catalogueNames: extra.catalogueNames ?? [] } : {}),
    });
    let shown = extra.shownIds ?? [];
    if (!verdict.ok) {
      this.deps.onVerifierFailure?.({ requestId: input.requestId, code: verdict.code });
      templateKey = "verification_failed";
      tpl = renderTemplate(templateKey, tplLang);
      cards = [];
      actions = [];
      shown = [];
      needsNativeReview = lang.language !== "en" || hasSinhala(tpl.text);
    }
    const suggestions = verdict.ok ? suggestionsFor(templateKey, tplLang) : [];
    for (const c of cards) emit({ type: "card", card: c });
    for (const a of actions) emit({ type: "action", action: a });
    if (shown.length) session.lastShownProductIds = [...new Set([...shown, ...session.lastShownProductIds])].slice(0, 5);
    session.language = lang.language;
    this.deps.sessions.set(sessionKeyValue, session);
    return {
      language: lang.language,
      reply: verdict.ok ? { text: replyText, source: replySource } : { text: tpl.text, source: "template" },
      needsNativeReview,
      cards,
      actions,
      suggestions,
      meta: { model: extra.model ?? null, degraded: extra.degraded ?? false, queuedMs: extra.queuedMs ?? 0 },
    };
  }
}

function deps_get(store: TtlLruStore<SessionState>, key: string): SessionState {
  return store.get(key) ?? emptySession();
}
