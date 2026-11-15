import { z } from "zod";
import { effectiveCents, type ProductView, type ToolResult } from "../../backend/types";
import { FetchRefused, checkSearchQuery, detectInjection, extractPlainText, extractReadableText, hostMatches, hostOf, neutraliseExcerpt, searchCacheKey, SearchProviderError, type SearchResult } from "../../search";
import { runToolCalls } from "../runner";
import { calculate, CalcError } from "./calculator";
import type { ToolEvidence } from "./evidence";
import { defineLlmTool, type LlmTool, type LlmToolContext, type ToolRun } from "./types";

/**
 * The tools a model is offered in the LLM-first lane. Descriptions are short and concrete because the target models are small. Shop tools are THIN adapters over the
 * existing registry (`tools/definitions.ts`): validation, actor checks, timeouts and the backend stay where they are; the adapters only narrow the arguments the
 * model may use and turn results into `ToolEvidence`. Every result that contains text from outside the server's own logic is marked `untrusted` so the executor fences it.
 */
const noControl = /^[^\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]*$/;
const ProductId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, "product id");
const lkr = (cents: number): number => Math.round(cents) / 100;

const fail = (code: string, message: string): ToolRun => ({ ok: false, code, message });

export const DEFAULT_DOC_DOMAINS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  android: ["developer.android.com", "source.android.com", "support.google.com"],
  ios: ["support.apple.com", "developer.apple.com"],
  macos: ["support.apple.com", "developer.apple.com"],
  windows: ["learn.microsoft.com", "support.microsoft.com"],
  chrome: ["developer.chrome.com", "support.google.com"],
  samsung: ["www.samsung.com", "developer.samsung.com", "doc.samsung.com"],
  python: ["docs.python.org", "peps.python.org"],
  javascript: ["developer.mozilla.org", "nodejs.org"],
  linux: ["kernel.org", "docs.kernel.org", "man7.org"],
});

// ---------- shop adapters ----------

export function productFacts(p: ProductView): Record<string, unknown> {
  const onSale = p.saleCents !== null && p.saleCents < p.priceCents;
  return {
    id: p.id,
    name: p.name.slice(0, 120),
    ...(p.brand ? { brand: p.brand.slice(0, 60) } : {}),
    ...(p.category ? { category: p.category.name.slice(0, 60) } : {}),
    priceLkr: lkr(p.priceCents),
    saleLkr: onSale ? lkr(p.saleCents as number) : null,
    effectiveLkr: lkr(effectiveCents(p)),
    available: p.available,
    specs: p.specs.slice(0, 10).map((s) => ({ name: s.name.slice(0, 40), value: s.value.slice(0, 60) })),
  };
}

const productEvidence = (tool: string, p: ProductView): ToolEvidence => ({ tool, kind: "product", facts: productFacts(p), productIds: [p.id], title: p.name.slice(0, 120) });

async function callShopTool(ctx: LlmToolContext, name: string, args: Record<string, unknown>): Promise<{ ok: true; result: ToolResult } | { ok: false; run: ToolRun }> {
  const [outcome] = await runToolCalls(ctx.deps.registry, [{ name, arguments: args }], { actor: ctx.actor, requestId: ctx.requestId, signal: ctx.signal, ...(ctx.cart ? { cart: ctx.cart } : {}) });
  if (!outcome || outcome.status !== "ok") return { ok: false, run: fail(outcome && "error" in outcome ? outcome.error.code : "TOOL_FAILED", outcome && "error" in outcome ? outcome.error.message : "The tool failed.") };
  return { ok: true, result: outcome.data as ToolResult };
}

const SearchProductsArgs = z.strictObject({
  query: z.string().trim().max(100).regex(noControl).optional().describe("Product or brand words"),
  category: z.string().trim().max(100).regex(/^[a-z0-9-]+$/).optional().describe("Category slug, lower case"),
  brand: z.string().trim().max(80).regex(noControl).optional(),
  minPriceLkr: z.number().int().min(0).max(100_000_000).optional(),
  maxPriceLkr: z.number().int().min(0).max(100_000_000).optional(),
  inStockOnly: z.boolean().default(true),
  sort: z.enum(["newest", "price-asc", "price-desc", "name"]).optional(),
  limit: z.number().int().min(1).max(8).default(5),
});

const volta_search_products = defineLlmTool({
  name: "volta_search_products",
  description: "Search the VOLTA.LK shop catalogue by product words, brand, category or budget (LKR). The only source of the shop's products, prices and stock.",
  auth: "read",
  args: SearchProductsArgs,
  async execute(a, ctx) {
    const r = await callShopTool(ctx, "search_products", a);
    if (!r.ok) return r.run;
    if (r.result.kind !== "search") return fail("UNEXPECTED_RESULT", "The shop search returned an unexpected result.");
    const items = r.result.items.slice(0, a.limit);
    return {
      ok: true,
      untrusted: true,
      data: { total: r.result.total, shown: items.length, products: items.map(productFacts) },
      evidence: items.map((p) => productEvidence("volta_search_products", p)),
    };
  },
});

const volta_product_details = defineLlmTool({
  name: "volta_product_details",
  description: "Get one VOLTA.LK product by its id: name, price, sale price, availability, variants and specifications. Specifications not listed are unknown: say so.",
  auth: "read",
  args: z.strictObject({ productId: ProductId }),
  async execute(a, ctx) {
    const r = await callShopTool(ctx, "get_product_details", a);
    if (!r.ok) return r.run;
    if (r.result.kind !== "details") return fail("UNEXPECTED_RESULT", "The shop returned an unexpected result.");
    const p = r.result.product;
    const evidence: ToolEvidence[] = [productEvidence("volta_product_details", p)];
    const variants = p.variants.slice(0, 12).map((v) => ({ key: v.key.slice(0, 60), label: v.label.slice(0, 80), priceLkr: lkr(v.priceCents), saleLkr: v.saleCents !== null && v.saleCents < v.priceCents ? lkr(v.saleCents) : null, available: v.available }));
    if (variants.length > 1) for (const v of variants) evidence.push({ tool: "volta_product_details", kind: "price", facts: { productId: p.id, variantKey: v.key, priceLkr: v.priceLkr, saleLkr: v.saleLkr, available: v.available }, productIds: [p.id], title: p.name.slice(0, 120) });
    return { ok: true, untrusted: true, data: { ...productFacts(p), variants, descriptionWithheld: true }, evidence };
  },
});

const volta_stock_and_price = defineLlmTool({
  name: "volta_stock_and_price",
  description: "Check the current price and whether a VOLTA.LK product (or one variant, optionally a quantity) is in stock. Gives yes/no availability, never a stock count.",
  auth: "read",
  args: z.strictObject({ productId: ProductId, variantKey: z.string().max(200).optional(), quantity: z.number().int().min(1).max(10).optional() }),
  async execute(a, ctx) {
    const details = await callShopTool(ctx, "get_product_details", { productId: a.productId });
    if (!details.ok) return details.run;
    if (details.result.kind !== "details") return fail("UNEXPECTED_RESULT", "The shop returned an unexpected result.");
    const stock = await callShopTool(ctx, "check_stock", a);
    if (!stock.ok) return stock.run;
    if (stock.result.kind !== "stock") return fail("UNEXPECTED_RESULT", "The shop returned an unexpected result.");
    const p = details.result.product;
    const s = stock.result;
    const facts = productFacts(p);
    return {
      ok: true,
      untrusted: true,
      data: { productId: p.id, name: facts.name, priceLkr: facts.priceLkr, saleLkr: facts.saleLkr, effectiveLkr: facts.effectiveLkr, available: s.available, ...(s.variantKey !== undefined ? { variantKey: s.variantKey } : {}), ...(s.requestedQuantity !== undefined ? { requestedQuantity: s.requestedQuantity, canFulfil: s.canFulfil ?? null } : {}) },
      evidence: [
        { tool: "volta_stock_and_price", kind: "price", facts: { productId: p.id, priceLkr: facts.priceLkr, saleLkr: facts.saleLkr, effectiveLkr: facts.effectiveLkr }, productIds: [p.id], title: p.name.slice(0, 120) },
        { tool: "volta_stock_and_price", kind: "stock", facts: { productId: p.id, available: s.available, ...(s.variantKey !== undefined ? { variantKey: s.variantKey } : {}), ...(s.requestedQuantity !== undefined ? { requestedQuantity: s.requestedQuantity, canFulfil: s.canFulfil ?? null } : {}) }, productIds: [p.id], title: p.name.slice(0, 120) },
      ],
    };
  },
});

// ---------- the shop's own public website (read-only) ----------

const SITE_PAGE_SLUGS = ["about", "contact", "faqs", "shipping-policy", "returns-policy", "warranty-policy", "privacy-policy", "terms", "wholesale", "track-order"] as const;

const volta_store_info = defineLlmTool({
  name: "volta_store_info",
  description: "VOLTA.LK store details published on the website: phone, WhatsApp, email, address, opening hours, delivery time, pickup, payment methods and instalment options. The only source for these facts.",
  auth: "read",
  needs: "siteInfo",
  args: z.strictObject({}),
  async execute(_a, ctx) {
    try {
      const i = await ctx.deps.siteInfo!.info(ctx.signal);
      const facts = {
        ...(i.name ? { store: i.name } : {}),
        ...(i.phone ? { phone: i.phone } : {}),
        ...(i.phone2 ? { phone2: i.phone2 } : {}),
        ...(i.whatsapp ? { whatsapp: i.whatsapp } : {}),
        ...(i.email ? { email: i.email } : {}),
        ...(i.address ? { address: i.address } : {}),
        ...(i.hours.length ? { hours: i.hours } : {}),
        ...(i.deliveryTime ? { deliveryTime: i.deliveryTime } : {}),
        ...(i.pickupInfo ? { pickup: i.pickupInfo } : {}),
        ...(i.paymentMethods.length ? { paymentMethods: i.paymentMethods } : {}),
        bankTransferOffered: i.bankTransferOffered,
        instalments: i.instalments ? `${i.instalments.providers.join(" / ")} in ${i.instalments.parts} parts` : "not offered",
        pagesYouCanRead: i.pages,
      };
      return { ok: true, untrusted: true, data: facts, evidence: [{ tool: "volta_store_info", kind: "site_info", facts: { text: JSON.stringify(facts) }, title: "VOLTA.LK store details" }] };
    } catch {
      return fail("SITE_UNAVAILABLE", "The website information is not reachable right now. Say so and point the shopper to the Contact page.");
    }
  },
});

const volta_site_page = defineLlmTool({
  name: "volta_site_page",
  description: "Read one public VOLTA.LK website page as text: about, contact, faqs, shipping-policy, returns-policy, warranty-policy, privacy-policy, terms, wholesale or track-order (how tracking works). Use it for policy, delivery, warranty, return and how-to questions.",
  auth: "read",
  needs: "siteInfo",
  args: z.strictObject({ page: z.enum(SITE_PAGE_SLUGS) }),
  maxResultChars: 6_500,
  async execute(a, ctx) {
    try {
      const p = await ctx.deps.siteInfo!.page(a.page, ctx.signal);
      if (!p) return fail("PAGE_NOT_FOUND", "That page does not exist on the website.");
      return { ok: true, untrusted: true, data: { page: p.slug, path: p.path, text: p.text }, evidence: [{ tool: "volta_site_page", kind: "site_info", facts: { text: p.text }, title: p.slug }] };
    } catch {
      return fail("SITE_UNAVAILABLE", "That page could not be read right now. Say so and point the shopper to the page itself.");
    }
  },
});

// ---------- calculator ----------

const calculator = defineLlmTool({
  name: "calculator",
  description: "Exact arithmetic. Operators + - * / ^ and brackets; n% means n/100; functions abs round min max sqrt. Write '15% of 2400' as 15% * 2400. Use it for every calculation instead of working in your head.",
  auth: "read",
  args: z.strictObject({ expression: z.string().min(1).max(200).describe("Arithmetic expression, for example 15% * 2400") }),
  timeoutMs: 500,
  async execute(a) {
    try {
      const r = calculate(a.expression);
      return {
        ok: true,
        data: { expression: a.expression.slice(0, 200), normalised: r.normalised, result: r.result, exact: r.exact },
        evidence: [{ tool: "calculator", kind: "calculation", facts: { expression: a.expression.slice(0, 200), normalised: r.normalised, result: r.result, exact: r.exact } }],
      };
    } catch (e) {
      if (e instanceof CalcError) return fail(`CALC_${e.code}`, e.message);
      return fail("CALC_FAILED", "The calculation failed.");
    }
  },
});

// ---------- web research ----------

const SNIPPET_MAX = 400;
const MAX_RESULTS = 6;

const REFUSAL_TEXT = {
  empty: "The question had nothing left to search for.",
  not_searchable: "This does not need a web search.",
  use_store_tools: "The shop's prices and stock come from the shop's own tools, not from a web search.",
} as const;

async function runSearch(ctx: LlmToolContext, tool: string, rawQuery: string, freshness: "day" | "week" | "month" | "any", domains?: readonly string[]): Promise<ToolRun> {
  const search = ctx.deps.search;
  if (!search || search.providerEnabled === false) return fail("SEARCH_DISABLED", "Web search is not available right now. Do not say that a search was done.");
  const check = checkSearchQuery(rawQuery);
  if (!check.ok) return fail("QUERY_REFUSED", REFUSAL_TEXT[check.refusal ?? "empty"]);
  const key = searchCacheKey(check.query, freshness, domains);
  let results = search.cache.get(key);
  if (!results) {
    const q = search.quota.tryConsume("search", ctx.sessionKey);
    if (!q.ok) return fail("SEARCH_QUOTA", "Web search is not available right now (limit reached or switched off). Do not say that a search was done.");
    try {
      results = await search.provider.search(check.query, { limit: MAX_RESULTS * 2, freshness, ...(domains ? { domains } : {}), signal: ctx.signal });
    } catch (e) {
      if (e instanceof SearchProviderError) return fail(`SEARCH_${e.code}`, "The web search failed. Do not say that a search was done.");
      return fail("SEARCH_FAILED", "The web search failed. Do not say that a search was done.");
    }
    search.cache.set(key, results);
  }
  const usable: SearchResult[] = [];
  for (const r of results) {
    let url: URL;
    try {
      url = new URL(r.url);
    } catch {
      continue;
    }
    if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username !== "" || url.password !== "") continue;
    if (domains && !hostMatches(r.url, domains)) continue; // a provider that ignores the domain filter cannot widen the set
    usable.push(r);
    if (usable.length >= MAX_RESULTS) break;
  }
  const now = new Date(ctx.now()).toISOString();
  const shown = usable.map((r) => {
    const id = `r${ctx.turn.nextResultNumber++}`;
    const title = detectInjection(r.title).flagged ? "[removed]" : r.title.slice(0, 160);
    const snippetScan = neutraliseExcerpt(r.snippet.slice(0, SNIPPET_MAX));
    ctx.turn.results.set(id, { url: r.url, title });
    return { id, title, domain: hostOf(r.url), snippet: snippetScan.text, ...(r.publishedAt ? { publishedAt: r.publishedAt.slice(0, 40) } : {}), url: r.url };
  });
  const evidence: ToolEvidence[] = shown.map((s) => ({ tool, kind: "search_source", facts: { id: s.id, domain: s.domain, snippet: s.snippet, ...(s.publishedAt ? { publishedAt: s.publishedAt } : {}) }, sourceUrl: s.url, title: s.title, fetchedAt: now }));
  return { ok: true, untrusted: true, data: { query: check.query, redactedPersonalText: check.redacted, resultCount: shown.length, results: shown.map(({ url: _u, ...rest }) => rest) }, evidence };
}

const FreshnessSchema = z.enum(["day", "week", "month", "any"]).default("any");

const web_search = defineLlmTool({
  name: "web_search",
  description: "Search the public web for current or uncertain facts (not for the shop's own prices or stock). Returns result ids with titles and short snippets; use fetch_page to read one. Cite what you use.",
  auth: "search",
  args: z.strictObject({ query: z.string().trim().min(2).max(200).describe("What to look up, written as a search query"), freshness: FreshnessSchema.optional() }),
  timeoutMs: 6_000,
  maxResultChars: 3_500,
  execute: (a, ctx) => runSearch(ctx, "web_search", a.query, a.freshness ?? "any"),
});

const lookup_documentation = defineLlmTool({
  name: "lookup_documentation",
  description: "Search OFFICIAL documentation only (for example Android, iOS, Windows, Samsung, Python). Use for official specifications, update notes and how-to questions. Cite what you use.",
  auth: "search",
  args: z.strictObject({ query: z.string().trim().min(2).max(200), product: z.string().trim().toLowerCase().max(30).regex(/^[a-z]+$/).describe("android, ios, macos, windows, chrome, samsung, python, javascript or linux") }),
  timeoutMs: 6_000,
  maxResultChars: 3_500,
  async execute(a, ctx) {
    const domains = (ctx.deps.docDomains ?? DEFAULT_DOC_DOMAINS)[a.product];
    if (!domains) return fail("UNKNOWN_PRODUCT", "There is no official documentation source configured for that product. Use web_search instead.");
    return runSearch(ctx, "lookup_documentation", a.query, "any", domains);
  },
});

const fetch_page = defineLlmTool({
  name: "fetch_page",
  description: "Read one page from a web_search or lookup_documentation result of THIS turn, by its result id (for example r1). You cannot open any other address.",
  auth: "external",
  args: z.strictObject({ resultId: z.string().trim().regex(/^r\d{1,3}$/, "result id like r1") }),
  timeoutMs: 9_000,
  maxResultChars: 6_200,
  async execute(a, ctx) {
    const search = ctx.deps.search;
    if (!search || search.providerEnabled === false) return fail("SEARCH_DISABLED", "Reading web pages is not available right now. Do not say that a page was read.");
    const entry = ctx.turn.results.get(a.resultId);
    if (!entry) return fail("UNKNOWN_RESULT", "That result id does not exist in this turn. Search first and use an id it returned.");
    if (ctx.turn.fetchedPages >= 3) return fail("PAGE_LIMIT", "At most three pages can be read in one turn.");
    const q = search.quota.tryConsume("fetch", ctx.sessionKey);
    if (!q.ok) return fail("FETCH_QUOTA", "Reading web pages is not available right now (limit reached or switched off). Do not say that a page was read.");
    ctx.turn.fetchedPages++;
    let page;
    try {
      page = await search.fetcher.fetch(entry.url, { signal: ctx.signal });
    } catch (e) {
      if (e instanceof FetchRefused) return fail(`FETCH_${e.reason.toUpperCase()}`, "That page could not be retrieved safely. Do not claim to have read it.");
      return fail("FETCH_FAILED", "That page could not be retrieved. Do not claim to have read it.");
    }
    const extracted = page.contentType === "text/plain" ? extractPlainText(page.body, { maxChars: 6_000 }) : extractReadableText(page.body, { maxChars: 6_000 });
    const scan = neutraliseExcerpt(extracted.text);
    const title = (extracted.title || entry.title).slice(0, 200);
    const fetchedAt = new Date(ctx.now()).toISOString();
    const text = scan.text;
    return {
      ok: true,
      untrusted: true,
      data: { id: a.resultId, title, domain: hostOf(page.url), text, truncated: extracted.truncated || page.truncated, instructionLikeTextRemoved: scan.removed, hiddenElementsDropped: extracted.droppedHidden },
      evidence: [{ tool: "fetch_page", kind: "page_excerpt", facts: { id: a.resultId, domain: hostOf(page.url), text, truncated: extracted.truncated || page.truncated, instructionSignals: scan.signals, instructionLikeTextRemoved: scan.removed }, sourceUrl: page.url, title, fetchedAt }],
    };
  },
});

// ---------- conversation memory (read only) ----------

const MAX_FACT_STRING = 200;
const MAX_FACT_ITEMS = 10;
function boundFacts(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return value.slice(0, MAX_FACT_STRING);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (depth >= 3) return undefined;
  if (Array.isArray(value)) return value.slice(0, MAX_FACT_ITEMS).map((v) => boundFacts(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, 20)) {
      const b = boundFacts(v, depth + 1);
      if (b !== undefined) out[k.slice(0, 40)] = b;
    }
    return out;
  }
  return undefined;
}

const recall_conversation = defineLlmTool({
  name: "recall_conversation",
  description: "Read what the assistant already knows about THIS conversation: the shopper's requirements, excluded brands, corrections, instructions and the products already discussed. Read only.",
  auth: "read",
  args: z.strictObject({}),
  timeoutMs: 200,
  async execute(_a, ctx) {
    return { ok: true, data: { facts: boundFacts(ctx.session) ?? {} }, evidence: [] };
  },
});

// ---------- cart proposals (OFF unless the lane enables them by name) ----------

const CartChangeArgs = z.strictObject({
  action: z.enum(["add", "update", "remove"]),
  productId: ProductId,
  variantKey: z.string().max(200).optional(),
  quantity: z.number().int().min(1).max(10).optional(),
});

/**
 * Authorisation class "proposal". The server has NO cart: it lives in the shopper's browser. This tool therefore changes nothing. It asks the existing shop tools
 * (which validate stock, limits and the browser's cart snapshot) to PREPARE a change and returns it as a proposal the browser applies only after the shopper
 * confirms. The model is told, in the result itself, that nothing was added: a reply that says "I added it" is refused by verifier v2 (`unperformed_action`).
 * Gap: no server-side cart route exists; checkout/payment are never reachable from here.
 */
const propose_cart_change = defineLlmTool({
  name: "propose_cart_change",
  description: "Prepare a cart change (add, update the quantity of, or remove a product) for the shopper to CONFIRM in their browser. It does not change the cart: never say it was added.",
  auth: "proposal",
  args: CartChangeArgs,
  async execute(a, ctx) {
    const variantKey = a.variantKey ?? "";
    let toolName: string;
    let args: Record<string, unknown>;
    if (a.action === "add") {
      toolName = "add_to_cart";
      args = { productId: a.productId, variantKey, quantity: a.quantity ?? 1 };
    } else if (a.action === "update") {
      if (a.quantity === undefined) return fail("QUANTITY_REQUIRED", "Say the new quantity for an update.");
      toolName = "update_cart_quantity";
      args = { productId: a.productId, variantKey, quantity: a.quantity };
    } else {
      toolName = "remove_from_cart";
      args = { productId: a.productId, variantKey };
    }
    const r = await callShopTool(ctx, toolName, args);
    if (!r.ok) return r.run;
    if (r.result.kind !== "proposal") return fail("UNEXPECTED_RESULT", "The shop returned an unexpected result.");
    const act = r.result.clientAction;
    return {
      ok: true,
      untrusted: true,
      proposal: act,
      data: {
        status: "proposal_pending_confirmation",
        appliedToCart: false,
        requiresShopperConfirmation: true,
        proposed: { type: act.type, productId: a.productId, ...(variantKey !== "" ? { variantKey } : {}), ...("quantity" in act ? { quantity: act.quantity } : {}) },
        say: "Tell the shopper this is ready for them to confirm. Do not say it has been added, changed or removed.",
      },
      evidence: [],
    };
  },
});

// ---------- order data: registered, never runnable ----------

const ORDER_GAP = "Order data is not available: there is no approved backend route and no approved privacy design for sending order details to a hosted model. Say you cannot look up orders here and point the shopper to their account page or to track-order.";

/** Authorisation class "disabled". Gap: no JSON route for order history or status; tracking works by a guessable-length order reference; customer PII would reach the model. */
const get_order_status = defineLlmTool({
  name: "get_order_status",
  description: "Look up the status of one of the signed-in shopper's own orders. NOT AVAILABLE yet.",
  auth: "disabled",
  args: z.strictObject({ orderRef: z.string().trim().min(4).max(40).regex(/^[A-Za-z0-9-]+$/).optional() }),
  timeoutMs: 100,
  async execute() {
    return fail("NOT_ENABLED", ORDER_GAP);
  },
});

const get_order_history = defineLlmTool({
  name: "get_order_history",
  description: "List the signed-in shopper's recent orders. NOT AVAILABLE yet.",
  auth: "disabled",
  args: z.strictObject({ limit: z.number().int().min(1).max(10).optional() }),
  timeoutMs: 100,
  async execute() {
    return fail("NOT_ENABLED", ORDER_GAP);
  },
});

// ---------- code execution: registered, never runnable ----------

const run_code = defineLlmTool({
  name: "run_code",
  description: "Run a small program. NOT AVAILABLE: there is no approved sandbox.",
  auth: "disabled",
  args: z.strictObject({ language: z.enum(["python", "javascript"]), code: z.string().max(2_000), stdin: z.string().max(500).optional() }),
  timeoutMs: 100,
  async execute() {
    return fail("NOT_ENABLED", "Code execution is not enabled. Use the calculator for arithmetic.");
  },
});

export interface CreateLlmToolsOptions {
  /** Leave out tools entirely (for example a lane without research). */
  exclude?: readonly string[];
}

export function createLlmTools(opts: CreateLlmToolsOptions = {}): LlmTool[] {
  const all = [volta_search_products, volta_product_details, volta_stock_and_price, volta_store_info, volta_site_page, calculator, web_search, fetch_page, lookup_documentation, recall_conversation, propose_cart_change, get_order_status, get_order_history, run_code] as unknown as LlmTool[];
  const skip = new Set(opts.exclude ?? []);
  return all.filter((t) => !skip.has(t.name));
}

export const LLM_TOOL_NAMES = ["volta_search_products", "volta_product_details", "volta_stock_and_price", "volta_store_info", "volta_site_page", "calculator", "web_search", "fetch_page", "lookup_documentation", "recall_conversation", "propose_cart_change", "get_order_status", "get_order_history", "run_code"] as const;
