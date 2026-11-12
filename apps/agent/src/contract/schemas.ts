import { z } from "zod";
import { ERROR_CODES } from "../errors";
import { hasSinhala } from "../util/script";

/**
 * Bump when a schema changes. Sent in every response so the website side can refuse a mismatch.
 * 1.1 (M1-C): a comparison card may hold 2 to 4 products (1.0 allowed 2 to 3).
 * A client that does not send `contractVersion` is treated as 1.0 and never receives a comparison of more than 3 products;
 * a client that sends 1.1 gets up to 4; any other value is rejected as a validation error.
 */
export const CONTRACT_VERSION = "1.1";
export const LEGACY_CONTRACT_VERSION = "1";
export const SUPPORTED_CONTRACT_VERSIONS = [LEGACY_CONTRACT_VERSION, CONTRACT_VERSION] as const;
export const ContractVersion = z.enum(SUPPORTED_CONTRACT_VERSIONS);
export type ContractVersion = z.infer<typeof ContractVersion>;
export const MAX_COMPARE_PRODUCTS = 4;
export const LEGACY_MAX_COMPARE_PRODUCTS = 3;
export const MAX_MESSAGE_CHARS = 800;

export const LANGUAGES = ["si", "en", "mixed"] as const;
export const Language = z.enum(LANGUAGES);
export type Language = z.infer<typeof Language>;

const ProductId = z.string().min(1).max(100);
const NO_CONTROL_CHARS = /^[^\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]*$/;

export const SessionId = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/, "Invalid session id.");

export const CartLineIn = z.strictObject({
  productId: ProductId,
  variantKey: z.string().max(200).default(""),
  quantity: z.number().int().min(1).max(10),
});

export function makeChatRequestSchema(maxMessageChars: number = MAX_MESSAGE_CHARS) {
  return z.strictObject({
    sessionId: SessionId,
    message: z
      .string()
      .trim()
      .min(1, "Message is required.")
      .max(maxMessageChars, "Message is too long.")
      .regex(NO_CONTROL_CHARS, "Message contains unsupported characters."),
    locale: z.enum(["auto", "si", "en"]).default("auto"),
    /** Browser cart snapshot. Untrusted; always revalidated against backend data. */
    cart: z.array(CartLineIn).max(20).default([]),
    /** What the shopper is looking at. An untrusted hint, never an authority. */
    context: z
      .strictObject({
        page: z.enum(["home", "listing", "product", "cart", "checkout", "track", "other"]).optional(),
        productId: ProductId.optional(),
      })
      .optional(),
    /** The contract version the client understands. Absent means 1.0. */
    contractVersion: ContractVersion.optional(),
    /** CAPTCHA-ready hook. Verified by the website side only; unused while AI_CHALLENGE_MODE=off. */
    challengeToken: z.string().max(2048).optional(),
  });
}
export const ChatRequest = makeChatRequestSchema();
export type ChatRequest = z.infer<typeof ChatRequest>;

// ---------- cards: every fact the shopper sees travels here, built from backend results only ----------

export const Money = z.strictObject({ amount: z.number().finite().nonnegative(), text: z.string().min(1).max(40) });
export type Money = z.infer<typeof Money>;

const ProductVariant = z.strictObject({
  key: z.string().max(200),
  label: z.string().max(120),
  available: z.boolean(),
  price: Money,
});

export const ProductCard = z.strictObject({
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
  variants: z.array(ProductVariant).max(24).optional(),
  url: z.string().regex(/^\/products\/[A-Za-z0-9._~-]{1,200}$/),
  /** Specifications the backend actually provides (name and value). Never generated. Present on details responses. */
  specs: z.array(z.strictObject({ name: z.string().min(1).max(60), value: z.string().min(1).max(200) })).max(24).optional(),
});
export type ProductCard = z.infer<typeof ProductCard>;

const ComparisonCard = z.strictObject({
  type: z.literal("comparison"),
  products: z.array(ProductCard).min(2).max(MAX_COMPARE_PRODUCTS),
  rows: z
    .array(z.strictObject({ label: z.string().max(80), values: z.array(z.string().max(200).nullable()).min(2).max(MAX_COMPARE_PRODUCTS), differs: z.boolean() }))
    .max(40),
  priceDelta: Money.optional(),
});

const StockCard = z.strictObject({
  type: z.literal("stock"),
  productId: ProductId,
  variantKey: z.string().max(200).optional(),
  available: z.boolean(),
  requestedQuantity: z.number().int().min(1).max(10).optional(),
  canFulfil: z.boolean().optional(),
});

const AccessoryCard = z.strictObject({
  type: z.literal("accessory"),
  forProductId: ProductId,
  kind: z.enum(["BACK_COVER", "SCREEN_PROTECTOR", "LENS_PROTECTOR", "CHARGER", "CABLE", "OTHER"]),
  product: ProductCard,
});

const CartCard = z.strictObject({
  type: z.literal("cart"),
  lines: z
    .array(
      z.strictObject({
        productId: ProductId,
        variantKey: z.string().max(200),
        name: z.string().max(200),
        quantity: z.number().int().min(1).max(10),
        unitPrice: Money,
        lineTotal: Money,
        available: z.boolean(),
      }),
    )
    .max(20),
  subtotal: Money,
  deliveryCharge: Money.optional(),
  note: z.literal("Final total is confirmed at checkout"),
});

export const ORDER_REF = /^VLK-\d{6}-[A-HJKMNP-TV-Z2-9]{10}$/;
const OrderCard = z.strictObject({
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
});

export const Card = z.discriminatedUnion("type", [ProductCard, ComparisonCard, StockCard, AccessoryCard, CartCard, OrderCard]);
export type Card = z.infer<typeof Card>;

// ---------- client actions: proposals only; the browser applies them (no server cart, no order creation) ----------

const ActionId = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);
const Confirm = z.enum(["none", "ask"]);
const NAVIGATE_HREF = /^(\/checkout|\/cart|\/products\/[A-Za-z0-9._~-]{1,200}|\/track-order(\?ref=VLK-\d{6}-[A-HJKMNP-TV-Z2-9]{10})?)$/;

export const ClientAction = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("cart.add"), actionId: ActionId, productId: ProductId, variantKey: z.string().max(200), quantity: z.number().int().min(1).max(10), confirm: Confirm }),
  z.strictObject({ type: z.literal("cart.setQuantity"), actionId: ActionId, productId: ProductId, variantKey: z.string().max(200), quantity: z.number().int().min(1).max(10), confirm: Confirm }),
  z.strictObject({ type: z.literal("cart.remove"), actionId: ActionId, productId: ProductId, variantKey: z.string().max(200), confirm: Confirm }),
  z.strictObject({ type: z.literal("navigate"), actionId: ActionId, href: z.string().regex(NAVIGATE_HREF) }),
]);
export type ClientAction = z.infer<typeof ClientAction>;

// ---------- response ----------

export const ReplySource = z.enum(["template", "sinhala-llm", "qwen"]);
export type ReplySource = z.infer<typeof ReplySource>;

export const Meta = z.strictObject({
  model: z.string().nullable(),
  degraded: z.boolean(),
  queuedMs: z.number().nonnegative(),
  latencyMs: z.number().nonnegative(),
  /** The version the response is shaped for: the one the client asked for (1.0 when it did not say). */
  contractVersion: ContractVersion,
});

export const ChatResponse = z
  .strictObject({
    requestId: z.string().min(1).max(80),
    sessionId: SessionId,
    language: Language,
    reply: z.strictObject({ text: z.string().min(1).max(2000), source: ReplySource }),
    /**
     * M1 rule: every Sinhala, Singlish or mixed output is provisional and must say so.
     * Nothing may be presented as production-ready Sinhala until native-speaker review (blocker B5) is complete.
     */
    needsNativeReview: z.boolean(),
    cards: z.array(Card).max(8).default([]),
    actions: z.array(ClientAction).max(4).default([]),
    suggestions: z.array(z.string().min(1).max(80)).max(4).default([]),
    meta: Meta,
  })
  .superRefine((r, ctx) => {
    const sinhala = r.language !== "en" || hasSinhala(r.reply.text) || r.suggestions.some(hasSinhala) || r.reply.source === "sinhala-llm";
    if (sinhala && !r.needsNativeReview) {
      ctx.addIssue({ code: "custom", path: ["needsNativeReview"], message: "Sinhala output must carry needsNativeReview." });
    }
  });
export type ChatResponse = z.infer<typeof ChatResponse>;

// ---------- errors, health, streaming ----------

export const ErrorEnvelope = z.strictObject({
  error: z.strictObject({
    code: z.enum(ERROR_CODES),
    message: z.string().max(300),
    requestId: z.string().max(80).optional(),
    retryAfterSec: z.number().int().nonnegative().optional(),
    fields: z.record(z.string(), z.string()).optional(),
  }),
});
export type ErrorEnvelope = z.infer<typeof ErrorEnvelope>;

export const HealthResponse = z.strictObject({
  ok: z.boolean(),
  ready: z.boolean(),
  enabled: z.boolean(),
  appVersion: z.string(),
  contractVersion: z.literal(CONTRACT_VERSION),
  ollama: z.strictObject({ reachable: z.boolean(), version: z.string().optional(), loadedModel: z.string().nullable() }),
  queue: z.strictObject({ depth: z.number().int().nonnegative(), running: z.boolean() }),
  memory: z.strictObject({ availableMb: z.number().nullable(), swapUsedMb: z.number().nullable() }),
  uptimeSec: z.number().nonnegative(),
});
export type HealthResponse = z.infer<typeof HealthResponse>;

export const STREAM_PHASES = ["queued", "routing", "tool", "writing"] as const;

export const StreamEvent = z.discriminatedUnion("event", [
  z.strictObject({ event: z.literal("status"), data: z.strictObject({ phase: z.enum(STREAM_PHASES), position: z.number().int().nonnegative().optional() }) }),
  z.strictObject({ event: z.literal("card"), data: Card }),
  z.strictObject({ event: z.literal("action"), data: ClientAction }),
  z.strictObject({ event: z.literal("token"), data: z.strictObject({ text: z.string().max(400) }) }),
  z.strictObject({ event: z.literal("text"), data: z.strictObject({ text: z.string().min(1).max(2000), source: ReplySource, needsNativeReview: z.boolean() }) }),
  z.strictObject({ event: z.literal("done"), data: z.strictObject({ meta: Meta }) }),
  z.strictObject({ event: z.literal("error"), data: ErrorEnvelope }),
]);
export type StreamEvent = z.infer<typeof StreamEvent>;

/** JSON Schemas for documentation and for the website side's contract tests. */
export function exportJsonSchemas(): Record<string, unknown> {
  return {
    contractVersion: CONTRACT_VERSION,
    ChatRequest: z.toJSONSchema(ChatRequest, { io: "input" }),
    ChatResponse: z.toJSONSchema(ChatResponse, { io: "output" }),
    Card: z.toJSONSchema(Card, { io: "output" }),
    ClientAction: z.toJSONSchema(ClientAction, { io: "output" }),
    ErrorEnvelope: z.toJSONSchema(ErrorEnvelope, { io: "output" }),
    HealthResponse: z.toJSONSchema(HealthResponse, { io: "output" }),
  };
}
