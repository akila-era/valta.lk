import { z } from "zod";

/**
 * Both ends of the assistant route are validated here, with strict schemas.
 *  - What the browser sends: a message, an optional language, a cart snapshot and the page type. NOTHING about identity or session.
 *  - What the Agent returns: the contract of apps/agent/src/contract/schemas.ts (version 1.1). A response that does not match is
 *    treated as a failure and never reaches the browser, so an unexpected shape, an off-site link or an unknown action is dropped.
 */
export const MAX_MESSAGE_CHARS = 800;
export const AGENT_CONTRACT_VERSION = "1.2";
/**
 * Contract 1.3 (optional `browser` panel, `context.path`). The website still SPEAKS 1.2 (the constant above): nothing here changes what the live site sends. The 1.3
 * schemas exist so the feature can be switched on later (AI_ASSISTANT_BROWSER=1 plus raising the version on purpose) without touching the 1.2 behaviour.
 */
export const AGENT_CONTRACT_VERSION_BROWSER = "1.3";

/** The path (and query) of the page the shopper is on: same shape the Agent accepts for `context.path` (one leading slash, bounded, no scheme or host). */
export const PAGE_PATH = /^\/(?![\/\\])[A-Za-z0-9._~!$&'()*+,;=:@%\/?\-]*$/;

const NO_CONTROL = /^[^\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]*$/;
const ProductId = z.string().min(1).max(100);

export const BrowserRequest = z.strictObject({
  message: z.string().trim().min(1, "Please type a message.").max(MAX_MESSAGE_CHARS, "That message is too long.").regex(NO_CONTROL, "That message has unsupported characters."),
  locale: z.enum(["auto", "si", "en"]).default("auto"),
  cart: z
    .array(z.strictObject({ productId: ProductId, variantKey: z.string().max(200).default(""), quantity: z.number().int().min(1).max(10) }))
    .max(20)
    .default([]),
  page: z.enum(["home", "listing", "product", "cart", "checkout", "track", "other"]).optional(),
  /** Only sent by a widget that has the browser feature on; the chat route may forward it as `context.path` once the version is 1.3. */
  path: z.string().max(200).regex(PAGE_PATH).optional(),
});
export type BrowserRequest = z.infer<typeof BrowserRequest>;

const Money = z.strictObject({ amount: z.number().finite().nonnegative(), text: z.string().min(1).max(40) });

/** Contract 1.2: codes saying why a product suits what the shopper asked for. Codes only; the wording is ours (see labels.ts). */
export const FIT_REASONS = ["within_budget", "brand_match", "best_camera", "best_battery", "most_memory", "lowest_price", "good_value", "on_sale", "has_warranty", "in_stock"] as const;
export const FIT_TRADEOFFS = ["over_budget", "out_of_stock", "no_camera_data", "no_battery_data", "no_memory_data", "different_brand"] as const;
const Fit = z.strictObject({ reasons: z.array(z.enum(FIT_REASONS)).max(3), tradeoffs: z.array(z.enum(FIT_TRADEOFFS)).max(2) });

const ProductCard = z.strictObject({
  type: z.literal("product"),
  id: ProductId,
  slug: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
  brand: z.string().max(80).optional(),
  imageUrl: z.string().max(500).optional(),
  price: Money,
  listPrice: Money.optional(),
  offerName: z.string().max(120).optional(),
  available: z.boolean(),
  variants: z.array(z.strictObject({ key: z.string().max(200), label: z.string().max(120), available: z.boolean(), price: Money })).max(24).optional(),
  url: z.string().regex(/^\/products\/[A-Za-z0-9._~-]{1,200}$/),
  specs: z.array(z.strictObject({ name: z.string().min(1).max(60), value: z.string().min(1).max(200) })).max(24).optional(),
  fit: Fit.optional(),
});

const ORDER_REF = /^VLK-\d{6}-[A-HJKMNP-TV-Z2-9]{10}$/;

export const AgentCard = z.discriminatedUnion("type", [
  ProductCard,
  z.strictObject({
    type: z.literal("comparison"),
    products: z.array(ProductCard).min(2).max(4),
    rows: z.array(z.strictObject({ label: z.string().max(80), values: z.array(z.string().max(200).nullable()).min(2).max(4), differs: z.boolean() })).max(40),
    priceDelta: Money.optional(),
  }),
  z.strictObject({ type: z.literal("stock"), productId: ProductId, variantKey: z.string().max(200).optional(), available: z.boolean(), requestedQuantity: z.number().int().min(1).max(10).optional(), canFulfil: z.boolean().optional() }),
  z.strictObject({ type: z.literal("accessory"), forProductId: ProductId, kind: z.enum(["BACK_COVER", "SCREEN_PROTECTOR", "LENS_PROTECTOR", "CHARGER", "CABLE", "OTHER"]), product: ProductCard }),
  z.strictObject({
    type: z.literal("cart"),
    lines: z
      .array(z.strictObject({ productId: ProductId, variantKey: z.string().max(200), name: z.string().max(200), quantity: z.number().int().min(1).max(10), unitPrice: Money, lineTotal: Money, available: z.boolean() }))
      .max(20),
    subtotal: Money,
    deliveryCharge: Money.optional(),
    note: z.literal("Final total is confirmed at checkout"),
  }),
  z.strictObject({
    type: z.literal("order"),
    ref: z.string().regex(ORDER_REF),
    status: z.string().max(40),
    payment: z.enum(["COD pending", "COD collected"]),
    lines: z.array(z.strictObject({ name: z.string().max(200), quantity: z.number().int().min(1), unitPrice: Money })).max(20),
    total: Money,
    carrier: z.string().max(80).optional(),
    trackingNumber: z.string().max(80).optional(),
    cancellable: z.boolean(),
    stale: z.boolean().optional(),
  }),
]);
export type AgentCard = z.infer<typeof AgentCard>;

const ActionId = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);
const NAVIGATE_HREF = /^(\/checkout|\/cart|\/products\/[A-Za-z0-9._~-]{1,200}|\/track-order(\?ref=VLK-\d{6}-[A-HJKMNP-TV-Z2-9]{10})?)$/;

export const AgentAction = z.discriminatedUnion("type", [
  // The browser applies a cart change only after the shopper confirms it, so anything that does not ask is rejected here.
  z.strictObject({ type: z.literal("cart.add"), actionId: ActionId, productId: ProductId, variantKey: z.string().max(200), quantity: z.number().int().min(1).max(10), confirm: z.literal("ask") }),
  z.strictObject({ type: z.literal("cart.setQuantity"), actionId: ActionId, productId: ProductId, variantKey: z.string().max(200), quantity: z.number().int().min(1).max(10), confirm: z.literal("ask") }),
  z.strictObject({ type: z.literal("cart.remove"), actionId: ActionId, productId: ProductId, variantKey: z.string().max(200), confirm: z.literal("ask") }),
  z.strictObject({ type: z.literal("navigate"), actionId: ActionId, href: z.string().regex(NAVIGATE_HREF) }),
]);
export type AgentAction = z.infer<typeof AgentAction>;

const SinhalaRule = (r: { language: string; reply: { text: string; source: string }; needsNativeReview: boolean }, ctx: z.RefinementCtx) => {
  // The Agent promises this; a response that breaks the promise is not shown.
  if ((r.language !== "en" || /[඀-෿]/.test(r.reply.text) || r.reply.source === "sinhala-llm") && !r.needsNativeReview) {
    ctx.addIssue({ code: "custom", path: ["needsNativeReview"], message: "Sinhala output must carry needsNativeReview." });
  }
};

const NO_CTRL_TEXT = /^[^\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]*$/;

/**
 * Contract 1.3: progress of a page task and, when something needs the shopper's approval, ONE proposal. Everything in it came from the page or from the Agent's
 * own fixed templates: it is shown as plain text, never as HTML, never as a verified price or stock (`source` is always "page").
 */
export const BROWSER_STEPS = ["open", "read", "find", "act", "verify", "close"] as const;
export const BrowserProgress = z.strictObject({ step: z.enum(BROWSER_STEPS), status: z.enum(["done", "failed", "skipped"]), label: z.string().min(1).max(80).regex(NO_CTRL_TEXT) });
export const BrowserProposal = z.strictObject({
  proposalId: z.string().regex(/^bp_[A-Za-z0-9_-]{16,40}$/),
  description: z.string().min(1).max(200).regex(NO_CTRL_TEXT),
  page: z.string().min(1).max(200).regex(PAGE_PATH),
  actionClass: z.enum(["reversible", "sensitive"]),
  expiresInSec: z.number().int().positive().max(600),
});
export const BrowserPanel = z.strictObject({ progress: z.array(BrowserProgress).max(8), confirmation: BrowserProposal.optional(), source: z.literal("page") });
export type BrowserPanel = z.infer<typeof BrowserPanel>;
export type BrowserStep = (typeof BROWSER_STEPS)[number];

const chatCommon = {
  requestId: z.string().min(1).max(80),
  sessionId: z.string().min(1).max(80),
  language: z.enum(["si", "en", "mixed"]),
  reply: z.strictObject({ text: z.string().min(1).max(2000), source: z.enum(["template", "sinhala-llm", "qwen"]) }),
  needsNativeReview: z.boolean(),
  cards: z.array(AgentCard).max(8),
  actions: z.array(AgentAction).max(4),
  suggestions: z.array(z.string().min(1).max(80)).max(4),
};
const metaOf = <V extends string>(v: V) => z.strictObject({ model: z.string().nullable(), degraded: z.boolean(), queuedMs: z.number().nonnegative(), latencyMs: z.number().nonnegative(), contractVersion: z.literal(v) });

/** What the browser receives. The Agent's meta (model, queue time) is deliberately not forwarded. */
export const AgentChatResponse = z.strictObject({ ...chatCommon, meta: metaOf(AGENT_CONTRACT_VERSION) }).superRefine(SinhalaRule);
export type AgentChatResponse = z.infer<typeof AgentChatResponse>;

/** Contract 1.3 response: the same, plus the optional `browser` panel. Used only when the feature is on and the version has been raised on purpose. */
export const AgentChatResponse13 = z.strictObject({ ...chatCommon, browser: BrowserPanel.optional(), meta: metaOf(AGENT_CONTRACT_VERSION_BROWSER) }).superRefine(SinhalaRule);
export type AgentChatResponse13 = z.infer<typeof AgentChatResponse13>;

/** The browser's request to approve or cancel ONE proposal. The conversation id is derived on the server from the cookie; the browser never sends one. */
export const BrowserDecisionBody = z.strictObject({ proposalId: BrowserProposal.shape.proposalId });
export type BrowserDecisionBody = z.infer<typeof BrowserDecisionBody>;

/** What the Agent answers to /v1/browser/confirm and /cancel (mirror of apps/agent BrowserDecisionResponse). */
export const AgentDecisionResponse = z.strictObject({
  requestId: z.string().min(1).max(80),
  sessionId: z.string().min(1).max(80),
  outcome: z.enum(["done", "failed", "cancelled", "expired"]),
  reply: z.strictObject({ text: z.string().min(1).max(2000), source: z.literal("template") }),
  needsNativeReview: z.boolean(),
  browser: BrowserPanel,
});
export type AgentDecisionResponse = z.infer<typeof AgentDecisionResponse>;

/** What the browser receives after a decision. */
export interface PublicDecision {
  outcome: "done" | "failed" | "cancelled" | "expired";
  reply: { text: string };
  needsNativeReview: boolean;
  browser: BrowserPanel;
}

export interface PublicChatResponse {
  language: "si" | "en" | "mixed";
  reply: { text: string };
  needsNativeReview: boolean;
  cards: AgentCard[];
  actions: AgentAction[];
  suggestions: string[];
  /** Contract 1.3 only; absent for every 1.2 answer. */
  browser?: BrowserPanel;
}

/**
 * Card images may only come from this site or from the hosts listed in ERP_IMAGE_HOSTS, over https. Anything else (an http address,
 * the mock catalogue's made-up host, an unknown CDN) is dropped, so the card shows its placeholder instead of a blocked or broken
 * image, and the shopper's browser is never told to fetch from a host nobody approved.
 */
export function safeImageUrl(url: string, env: Readonly<Record<string, string | undefined>> = process.env): string | undefined {
  if (/^\/(?!\/)/.test(url) && !url.includes("\\")) return url; // a path on this site
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return undefined;
  }
  if (u.protocol !== "https:" || u.username || u.password) return undefined;
  const allowed = new Set((env.ERP_IMAGE_HOSTS ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean));
  try {
    if (env.SITE_URL) allowed.add(new URL(env.SITE_URL).hostname.toLowerCase());
  } catch {
    /* ignore an unparseable SITE_URL */
  }
  return allowed.has(u.hostname.toLowerCase()) ? u.toString() : undefined;
}

/** Returns a copy with every `imageUrl` that fails the image policy removed (cards nest products in comparisons and accessories). */
function stripUnsafeImages<T>(value: T, env: Readonly<Record<string, string | undefined>>): T {
  if (Array.isArray(value)) return value.map((v) => stripUnsafeImages(v, env)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === "imageUrl") {
        const ok = typeof v === "string" ? safeImageUrl(v, env) : undefined;
        if (ok) out[k] = ok;
      } else out[k] = stripUnsafeImages(v, env);
    }
    return out as T;
  }
  return value;
}

export const toPublic = (r: AgentChatResponse | AgentChatResponse13, env: Readonly<Record<string, string | undefined>> = process.env): PublicChatResponse => ({
  language: r.language,
  reply: { text: r.reply.text },
  needsNativeReview: r.needsNativeReview,
  cards: stripUnsafeImages(r.cards, env),
  actions: r.actions,
  suggestions: r.suggestions,
  ...("browser" in r && r.browser ? { browser: r.browser } : {}),
});
