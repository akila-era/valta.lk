import { z } from "zod";

/**
 * Both ends of the assistant route are validated here, with strict schemas.
 *  - What the browser sends: a message, an optional language, a cart snapshot and the page type. NOTHING about identity or session.
 *  - What the Agent returns: the contract of apps/agent/src/contract/schemas.ts (version 1.1). A response that does not match is
 *    treated as a failure and never reaches the browser, so an unexpected shape, an off-site link or an unknown action is dropped.
 */
export const MAX_MESSAGE_CHARS = 800;
export const AGENT_CONTRACT_VERSION = "1.1";

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
});
export type BrowserRequest = z.infer<typeof BrowserRequest>;

const Money = z.strictObject({ amount: z.number().finite().nonnegative(), text: z.string().min(1).max(40) });

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

/** What the browser receives. The Agent's meta (model, queue time) is deliberately not forwarded. */
export const AgentChatResponse = z
  .strictObject({
    requestId: z.string().min(1).max(80),
    sessionId: z.string().min(1).max(80),
    language: z.enum(["si", "en", "mixed"]),
    reply: z.strictObject({ text: z.string().min(1).max(2000), source: z.enum(["template", "sinhala-llm", "qwen"]) }),
    needsNativeReview: z.boolean(),
    cards: z.array(AgentCard).max(8),
    actions: z.array(AgentAction).max(4),
    suggestions: z.array(z.string().min(1).max(80)).max(4),
    meta: z.strictObject({ model: z.string().nullable(), degraded: z.boolean(), queuedMs: z.number().nonnegative(), latencyMs: z.number().nonnegative(), contractVersion: z.literal(AGENT_CONTRACT_VERSION) }),
  })
  .superRefine((r, ctx) => {
    // The Agent promises this; a response that breaks the promise is not shown.
    if ((r.language !== "en" || /[඀-෿]/.test(r.reply.text) || r.reply.source === "sinhala-llm") && !r.needsNativeReview) {
      ctx.addIssue({ code: "custom", path: ["needsNativeReview"], message: "Sinhala output must carry needsNativeReview." });
    }
  });
export type AgentChatResponse = z.infer<typeof AgentChatResponse>;

export interface PublicChatResponse {
  language: "si" | "en" | "mixed";
  reply: { text: string };
  needsNativeReview: boolean;
  cards: AgentCard[];
  actions: AgentAction[];
  suggestions: string[];
}

export const toPublic = (r: AgentChatResponse): PublicChatResponse => ({ language: r.language, reply: { text: r.reply.text }, needsNativeReview: r.needsNativeReview, cards: r.cards, actions: r.actions, suggestions: r.suggestions });
