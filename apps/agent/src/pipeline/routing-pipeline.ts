import { randomUUID } from "node:crypto";
import type { ProductView } from "../backend/types";
import { Card, ClientAction } from "../contract/schemas";
import type { ChatPipeline, PipelineEvent, PipelineInput, PipelineResult } from "../http/pipeline";
import { MODELS } from "../ollama/models";
import { detectLanguage } from "../router/language";
import { normalizeMatch } from "../router/normalize";
import { checkSafety, type SafetyReason } from "../router/safety";
import { routeMessage } from "../router/router";
import { conversationIntent, isNeutralMessage, type ConversationIntent } from "../router/conversation";
import { extractEntities } from "../router/entities";
import { renderTemplate, suggestionsFor, REPLY_PART_SEPARATOR } from "../router/templates";
import type { PlannedCall, RouteDecision, TemplateKey, Vocabulary } from "../router/types";
import { answerPending, CANDIDATE_LIMIT, fitFor, looksLikeAccessory, profileSearchArgs, reasonAboutSearch, searchIndex, updateProfileFromSearch, type ReasonedSearch } from "../reasoning/engine";
import { extractUsages } from "../reasoning/usage";
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
  /** Called once per message with the conversation intent the router decided (no message text), for tests and observability. */
  onDecision?: (info: { intent: ConversationIntent; routerIntent: string; reason: string; template: string | null; language: string }) => void;
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
    case "details":
      return decision.reason === "opinion" ? "opinion_facts" : "tools_ran";
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
    const detected = detectLanguage(message, { locale: request.locale });
    const actor = identity.kind === "customer" ? ({ kind: "customer", customerId: identity.customerId } as const) : ({ kind: "guest" } as const);
    const priority = identity.kind === "customer" ? "customer" : "guest";
    const key = sessionKey(identity, request.sessionId);
    const session = deps_get(this.deps.sessions, key);
    // Language of the reply. An explicit choice in the page (English or Sinhala) always wins. In Auto mode the reply follows the
    // message (Singlish gets the same Sinhala-style reply as Sinhala script, not a switch to English); a neutral message such as
    // "ok" or "200000" keeps the language the conversation was already in.
    const neutral = isNeutralMessage(message);
    const keepSession = request.locale !== "en" && request.locale !== "si" && neutral && (session.language === "si" || session.language === "mixed");
    const lang = keepSession ? ({ script: session.language === "si" ? "si" : "si-latin", language: session.language!, path: "sinhala", reason: "conversation language" } as typeof detected) : detected;
    const tplLang: "en" | "si" =
      request.locale === "en" ? "en" : request.locale === "si" ? "si" : lang.script === "si" || lang.script === "mixed" || lang.script === "si-latin" ? "si" : "en";

    emit({ type: "status", phase: "routing" });

    const finish = (templateKey: TemplateKey, extra: { actions?: ClientAction[]; cards?: Card[]; model?: string | null; degraded?: boolean; queuedMs?: number; polishable?: boolean; outcomes?: ToolOutcome[]; shownIds?: string[]; modelReply?: string; catalogueNames?: string[]; followUp?: TemplateKey; fitContext?: { profile: import("../reasoning/profile").Profile; candidateIds: string[] } } = {}): PipelineResult => this.compose(input, lang, tplLang, templateKey, extra, emit, session, key);

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
    const reasoning = session.reasoning;
    const profile = reasoning.profile;
    const ctx = {
      ...(request.context?.productId ? { contextProductId: request.context.productId } : {}),
      lastShownProductIds: session.lastShownProductIds,
      lastResultIds: reasoning.lastResultIds,
      discussedIds: reasoning.discussed,
      cart: request.cart,
      ...(session.lastIntent ? { lastIntent: session.lastIntent } : {}),
      slots: {
        ...(profile.brand ? { brand: profile.brand } : {}),
        ...(profile.category ? { category: profile.category } : {}),
        ...(profile.query ? { query: profile.query } : {}),
        ...(profile.budgetMaxLkr !== undefined ? { budgetMaxLkr: profile.budgetMaxLkr } : {}),
      },
    };
    const matchText = normalizeMatch(message);
    let det = routeMessage({ matchText, rawText: message, vocab, context: ctx });
    // The shopper's short reply to the question just asked (a usage, a brand, the device an accessory is for) becomes the search it means.
    const pendingAnswer = answerPending(reasoning, message, det.entities, session.lastIntent === "search_products", det.reason);
    reasoning.pending = undefined;
    if (pendingAnswer) det = { ...det, intent: pendingAnswer.call.name === "get_accessories" ? "get_accessories" : "search_products", action: "tool", calls: [pendingAnswer.call], reason: pendingAnswer.reason, confidence: { score: 4, margin: 4 } };
    const usages = pendingAnswer ? pendingAnswer.usages : extractUsages(message);
    this.deps.onDecision?.({ intent: conversationIntent(det, message), routerIntent: det.intent, reason: det.reason, template: det.template ?? null, language: lang.language });

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
    if (decision.template === "clarify_accessory_for") reasoning.pending = "device";
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

    // A search is a statement of what the shopper wants: fold it (and any usage they mention) into their profile, then fetch enough
    // candidates (up to 8) to rank them for this shopper.
    for (const c of safeCalls) if (c.name === "search_products") updateProfileFromSearch(reasoning, c.arguments, usages);
    const toRun = safeCalls.map((c) => (c.name === "search_products" && c.arguments.limit === undefined ? { ...c, arguments: { ...c.arguments, limit: CANDIDATE_LIMIT } } : c));

    emit({ type: "status", phase: "tool" });
    const toolStart = this.now();
    let outcomes = await runToolCalls(this.deps.registry, toRun, { actor, requestId: input.requestId, signal: input.signal, cart: request.cart });
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
    // Reasoning over a search: no exact match -> close alternatives; otherwise rank for this shopper, say why, and maybe ask ONE question.
    let reasoned: ReasonedSearch | null = null;
    const si = searchIndex(outcomes);
    if (si >= 0) {
      const first = outcomes[si] as { data: { total: number } };
      let alternatives = false;
      // The catalogue's categories are the shop's own and may not match how shoppers speak (iPhones filed under "apple"): when a category
      // finds nothing, look for the kind of product by name before saying there are none.
      const word = decision.entities.conceptWord;
      if (first.data.total === 0 && profile.category && !profile.query && word) {
        // Only when the CATEGORY itself holds nothing in stock (a budget or brand that excluded everything is a different case, handled below).
        const emptyCheck = await runToolCalls(this.deps.registry, [{ name: "search_products", arguments: { category: profile.category, inStockOnly: true, limit: 1 } }], { actor, requestId: input.requestId, signal: input.signal, cart: request.cart });
        const ei = searchIndex(emptyCheck);
        const categoryEmpty = ei >= 0 && (emptyCheck[ei] as { data: { total: number } }).data.total === 0;
        if (categoryEmpty) {
          const byName = toRun.find((c) => c.name === "search_products");
          const retry = await runToolCalls(this.deps.registry, [{ name: "search_products", arguments: { ...(byName?.arguments ?? {}), category: undefined, query: word } }], { actor, requestId: input.requestId, signal: input.signal, cart: request.cart });
          const ri = searchIndex(retry);
          if (ri >= 0) {
            const found = retry[ri] as { tool: string; status: "ok"; data: { kind: "search"; total: number; items: ProductView[] } };
            const real = found.data.items.filter((p) => !looksLikeAccessory(p));
            if (real.length > 0) {
              outcomes = [...outcomes.slice(0, si), { ...found, data: { ...found.data, total: real.length, items: real } }, ...outcomes.slice(si + 1)];
              delete profile.category;
              profile.query = word;
            }
          }
        }
      }
      if ((outcomes[si] as { data: { total: number } }).data.total === 0 && profile.category && (profile.brand || profile.query || profile.budgetMaxLkr !== undefined)) {
        // Close alternatives, widest last: the same category without the brand or word that found nothing (budget kept first, then dropped:
        // the card says when it is over budget), then the same kind of product by name when the category holds nothing in stock.
        const budgetVariants = profile.budgetMaxLkr !== undefined ? [true, false] : [false];
        const attempts: Record<string, unknown>[] = [];
        for (const keep of budgetVariants) attempts.push(profileSearchArgs({ category: profile.category, usage: [], ...(keep ? { budgetMaxLkr: profile.budgetMaxLkr } : {}) }));
        if (word) for (const keep of budgetVariants) attempts.push(profileSearchArgs({ query: word, usage: [], ...(keep ? { budgetMaxLkr: profile.budgetMaxLkr } : {}) }));
        for (const altArgs of attempts) {
          const alt = await runToolCalls(this.deps.registry, [{ name: "search_products", arguments: altArgs }], { actor, requestId: input.requestId, signal: input.signal, cart: request.cart });
          const ai = searchIndex(alt);
          if (ai < 0) continue;
          const hit = alt[ai] as { tool: string; status: "ok"; data: { kind: "search"; total: number; items: ProductView[] } };
          // A by-name attempt must not turn up accessories (a phone case is not an alternative to a phone).
          const items = altArgs.category === undefined ? hit.data.items.filter((p) => !looksLikeAccessory(p)) : hit.data.items;
          if (items.length > 0) {
            outcomes = [...outcomes.slice(0, si), { ...hit, data: { ...hit.data, total: items.length, items } }, ...outcomes.slice(si + 1)];
            alternatives = true;
            break;
          }
        }
      }
      const explicitSort = toRun.some((c) => c.name === "search_products" && typeof c.arguments.sort === "string");
      reasoned = reasonAboutSearch(outcomes, reasoning, { hasProductContext: Boolean(request.context?.productId), alternatives, explicitSort });
      if (reasoned) outcomes = reasoned.outcomes;
    }

    const cardSource = reasoned ? reasoned.cardOutcomes : outcomes;
    let cards = this.deps.cardsFrom?.(cardSource) ?? [];
    let fitCandidates: string[] = reasoned?.candidateIds ?? [];
    const personalNow = profile.usage.length > 0 || profile.budgetMaxLkr !== undefined || profile.budgetMinLkr !== undefined || Boolean(profile.brand);
    if (reasoned) {
      // Fit codes explain a match against what the shopper SAID; a bare browse has nothing to explain, so it carries none.
      if (personalNow || reasoned.usedAlternatives) {
        const fits = reasoned.fits;
        cards = cards.map((c) => (c.type === "product" && fits.has(c.id) ? { ...c, fit: fits.get(c.id)! } : c));
      } else fitCandidates = [];
    } else {
      // One product under discussion (details, "is it worth it?"): say how it sits against what the shopper told us.
      const detail = outcomes.find((o) => o.status === "ok" && (o.data as { kind?: string } | undefined)?.kind === "details");
      const view = detail && detail.status === "ok" ? (detail.data as { product?: Parameters<typeof fitFor>[0] }).product : undefined;
      const f = view ? fitFor(view, profile) : null;
      if (view && f) {
        cards = cards.map((c) => (c.type === "product" && c.id === view.id ? { ...c, fit: f } : c));
        fitCandidates = [view.id];
      }
    }
    const shown = this.deps.shownProductIdsFrom?.(cardSource) ?? [];
    session.lastIntent = decision.intent;
    const e = decision.entities;
    // What the search was about is replaced, not accumulated, so a new topic never inherits the previous one.
    const search = safeCalls.find((c) => c.name === "search_products");
    if (search) {
      const a = search.arguments as { brand?: unknown; category?: unknown; query?: unknown; maxPriceLkr?: unknown };
      session.slots = {
        ...(typeof a.brand === "string" ? { brand: a.brand } : {}),
        ...(typeof a.category === "string" ? { category: a.category } : {}),
        ...(typeof a.query === "string" ? { query: a.query } : {}),
        ...(typeof a.maxPriceLkr === "number" ? { budgetLkr: a.maxPriceLkr } : {}),
      };
    } else {
      if (e.brand) session.slots.brand = e.brand;
      if (e.categorySlug) session.slots.category = e.categorySlug;
      if (e.maxPriceLkr !== undefined) session.slots.budgetLkr = e.maxPriceLkr;
    }

    // Which fixed reply goes with the cards, and the one follow-up question (if any).
    let replyKey = templateForOutcomes(outcomes, decision);
    const personal = profile.usage.length > 0 || profile.budgetMaxLkr !== undefined || profile.budgetMinLkr !== undefined || Boolean(profile.brand);
    if (reasoned && replyKey === "tools_ran") {
      if (reasoned.usedAlternatives) replyKey = "no_match_alternatives";
      else if (decision.reason === "brand_advice") replyKey = "brand_advice";
      else if (reasoned.metricsWithoutData > 0) replyKey = "recommend_limited_data";
      else if (personal) replyKey = "recommend_intro";
    }
    let followUp: TemplateKey | undefined;
    if (reasoned?.question) {
      const q = reasoned.question;
      followUp = q === "budget" ? "ask_budget" : q === "usage" ? (reasoned.kind === "laptop" ? "ask_usage_laptop" : "ask_usage_phone") : q === "brand" ? "ask_brand" : "ask_device";
      reasoning.asked.push(q);
      reasoning.pending = q;
      reasoning.questionsInARow += 1;
    } else reasoning.questionsInARow = 0;

    // What was shown and chosen, for "the second one", "the one I mentioned before" and "is it worth it?".
    reasoning.discussed = [...new Set([...shown, ...reasoning.discussed])].slice(0, 8);
    if (si >= 0 && shown.length > 0) reasoning.lastResultIds = shown;
    for (const a of actions) if (a.type === "cart.add") reasoning.selected = [...new Set([a.productId, ...reasoning.selected])].slice(0, 8);

    return finish(replyKey, { actions, cards, model, queuedMs, outcomes, shownIds: shown, ...(followUp ? { followUp } : {}), ...(fitCandidates.length ? { fitContext: { profile: structuredClone(profile), candidateIds: fitCandidates } } : {}) });
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
    extra: { actions?: ClientAction[]; cards?: Card[]; model?: string | null; degraded?: boolean; queuedMs?: number; outcomes?: ToolOutcome[]; shownIds?: string[]; modelReply?: string; catalogueNames?: string[]; followUp?: TemplateKey; fitContext?: { profile: import("../reasoning/profile").Profile; candidateIds: string[] } },
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
    const followUp = extra.followUp;
    let replyText = followUp ? tpl.text + REPLY_PART_SEPARATOR + renderTemplate(followUp, tplLang).text : tpl.text;
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
      ...(followUp ? { templateKeys: [templateKey, followUp] } : {}),
      ...(extra.fitContext ? { fitContext: extra.fitContext } : {}),
      suggestions: suggestionsFor(followUp ?? templateKey, tplLang, { afterSearch: !followUp && session.lastIntent === "search_products" }),
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
    const suggestions = verdict.ok ? suggestionsFor(followUp ?? templateKey, tplLang, { afterSearch: !followUp && session.lastIntent === "search_products" }) : [];
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
