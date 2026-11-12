import { LEGACY_CONTRACT_VERSION, LEGACY_MAX_COMPARE_PRODUCTS, MAX_COMPARE_PRODUCTS, type Card, type ClientAction, type ContractVersion } from "../contract/schemas";
import type { CartLineView, OrderView, ProductView, ToolResult, VariantView } from "../backend/types";
import { effectiveCents } from "../backend/types";
import { containsSensitive } from "../router/safety";
import { renderTemplate } from "../router/templates";
import type { TemplateKey } from "../router/types";
import type { ToolOutcome } from "../tools/runner";
import { hasSinhala } from "../util/script";

/**
 * The response verifier (M1-D). It runs on every answer before anything is emitted, and it trusts nothing but the tool results the
 * server itself obtained for this request. Cards are checked field by field against those results; a card, action or sentence that
 * cannot be traced to them makes the whole answer fail. A failed answer is replaced by a fixed safe text: nothing is ever repaired
 * from a guess, and nothing about the rejected content is returned or logged except a short failure code.
 *
 * It deliberately re-derives expected values with its own small formatter instead of reusing the card builder's, so a bug in
 * the builder cannot also hide itself from the check.
 */
export type VerifyFailure =
  | "card_without_source"
  | "unknown_product"
  | "product_mismatch"
  | "variant_mismatch"
  | "stock_mismatch"
  | "accessory_unauthorized"
  | "comparison_mismatch"
  | "cart_mismatch"
  | "order_unauthorized"
  | "order_mismatch"
  | "action_unauthorized"
  | "link_not_approved"
  | "reply_unsupported"
  | "sensitive_leak"
  | "review_flag_missing"
  | "contract_version";

export type VerifyResult = { ok: true } | { ok: false; code: VerifyFailure };

export interface VerifyInput {
  actor: "guest" | "customer";
  outcomes: readonly ToolOutcome[];
  cards: readonly Card[];
  actions: readonly ClientAction[];
  reply: { text: string; source: string };
  /** The fixed template the reply must be. Absent only for a polished Sinhala template. */
  templateKey?: TemplateKey;
  tplLang: "en" | "si";
  language: "en" | "si" | "mixed";
  needsNativeReview: boolean;
  suggestions?: readonly string[];
}

const fail = (code: VerifyFailure): VerifyResult => ({ ok: false, code });
const OK: VerifyResult = { ok: true };

/** Independent money formatting: integer cents to "Rs. 1,234.50". */
function rs(cents: number): string {
  const whole = Math.floor(cents / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `Rs. ${whole}.${String(cents % 100).padStart(2, "0")}`;
}
const moneyOk = (m: { amount: number; text: string } | undefined, cents: number): boolean => !!m && m.text === rs(cents) && Math.round(m.amount * 100) === cents;

interface Sources {
  products: Map<string, ProductView>;
  stock: Extract<ToolResult, { kind: "stock" }>[];
  accessories: Extract<ToolResult, { kind: "accessories" }>[];
  compare: Extract<ToolResult, { kind: "compare" }>[];
  carts: Extract<ToolResult, { kind: "cart" }>[];
  orders: OrderView[];
  proposals: Extract<ToolResult, { kind: "proposal" }>["clientAction"][];
}

function collect(outcomes: readonly ToolOutcome[]): Sources {
  const s: Sources = { products: new Map(), stock: [], accessories: [], compare: [], carts: [], orders: [], proposals: [] };
  for (const o of outcomes) {
    if (o.status !== "ok") continue;
    const r = o.data as ToolResult | undefined;
    if (!r || typeof r !== "object" || !("kind" in r)) continue;
    switch (r.kind) {
      case "search":
        r.items.forEach((p) => s.products.set(p.id, p));
        break;
      case "details":
        s.products.set(r.product.id, r.product);
        break;
      case "compare":
        r.products.forEach((p) => s.products.set(p.id, p));
        s.compare.push(r);
        break;
      case "accessories":
        r.items.forEach((a) => s.products.set(a.product.id, a.product));
        s.accessories.push(r);
        break;
      case "stock":
        s.stock.push(r);
        break;
      case "cart":
        s.carts.push(r);
        break;
      case "orders":
        s.orders.push(...r.orders);
        break;
      case "proposal":
        s.proposals.push(r.clientAction);
        break;
    }
  }
  return s;
}

type ProductCard = Extract<Card, { type: "product" }>;

function variantOk(card: NonNullable<ProductCard["variants"]>[number], src: VariantView): boolean {
  return card.label === src.label.slice(0, 120) && card.available === src.available && moneyOk(card.price, effectiveCents(src));
}

function productCardOk(c: ProductCard, src: ProductView | undefined): VerifyFailure | null {
  if (!src) return "unknown_product";
  const sale = src.saleCents !== null && src.saleCents < src.priceCents;
  if (c.id !== src.id || c.slug !== src.slug || c.name !== src.name) return "product_mismatch";
  if ((c.brand ?? undefined) !== (src.brand ?? undefined)) return "product_mismatch";
  if (!moneyOk(c.price, effectiveCents(src))) return "product_mismatch";
  if (sale ? !moneyOk(c.listPrice, src.priceCents) : c.listPrice !== undefined) return "product_mismatch";
  if ((c.offerName ?? undefined) !== (src.offerName ?? undefined)) return "product_mismatch";
  if (c.available !== src.available) return "product_mismatch";
  if (c.url !== `/products/${src.slug}`) return "link_not_approved";
  if (c.imageUrl !== undefined && c.imageUrl !== src.imageUrl) return "product_mismatch";
  if (c.specs) for (const sp of c.specs) if (!src.specs.some((x) => x.name.slice(0, 60) === sp.name && x.value.slice(0, 200) === sp.value)) return "product_mismatch";
  if (c.variants) {
    for (const v of c.variants) {
      const sv = src.variants.find((x) => x.key === v.key);
      if (!sv || !variantOk(v, sv)) return "variant_mismatch";
    }
  }
  return null;
}

function rowValuesOk(label: string, values: (string | null)[], products: ProductView[]): boolean {
  if (values.length !== products.length) return false;
  const expect = (fn: (p: ProductView) => string | null) => products.every((p, i) => (values[i] ?? null) === (fn(p)?.slice(0, 200) ?? null));
  switch (label) {
    case "Brand":
      return expect((p) => p.brand ?? null);
    case "Category":
      return expect((p) => p.category?.name ?? null);
    case "Price":
      return expect((p) => rs(effectiveCents(p)));
    case "Availability":
      return expect((p) => (p.available ? "In stock" : "Out of stock"));
    default:
      // A specification row: every value is the product's own value for it, or null when the product has none. Never anything else.
      return expect((p) => p.specs.find((s) => s.name.slice(0, 80) === label)?.value ?? null);
  }
}

const APPROVED_STATIC_HREF = new Set(["/checkout", "/cart", "/track-order"]);

function textsOf(i: VerifyInput): string[] {
  const out: string[] = [i.reply.text, ...(i.suggestions ?? [])];
  const product = (p: ProductCard) => {
    out.push(p.name, p.brand ?? "", p.offerName ?? "", p.price.text, p.listPrice?.text ?? "", ...(p.specs ?? []).flatMap((s) => [s.name, s.value]), ...(p.variants ?? []).map((v) => v.label));
  };
  for (const c of i.cards) {
    if (c.type === "product") product(c);
    else if (c.type === "comparison") {
      c.products.forEach(product);
      for (const r of c.rows) out.push(r.label, ...r.values.map((v) => v ?? ""));
    } else if (c.type === "accessory") product(c.product);
    else if (c.type === "cart") out.push(...c.lines.map((l) => l.name));
    else if (c.type === "order") out.push(c.status, c.carrier ?? "", c.trackingNumber ?? "", ...c.lines.map((l) => l.name));
  }
  return out;
}

export function verifyResponse(i: VerifyInput): VerifyResult {
  const src = collect(i.outcomes);

  // 1. Cards: every one must trace to a tool result obtained in this request, with every shown fact equal to the source.
  for (const c of i.cards) {
    switch (c.type) {
      case "product": {
        const f = productCardOk(c, src.products.get(c.id));
        if (f) return fail(f);
        break;
      }
      case "comparison": {
        if (c.products.length < 2 || c.products.length > MAX_COMPARE_PRODUCTS) return fail("comparison_mismatch");
        const sources: ProductView[] = [];
        for (const p of c.products) {
          const s = src.products.get(p.id);
          const f = productCardOk(p, s);
          if (f) return fail(f);
          sources.push(s!);
        }
        if (!src.compare.some((r) => c.products.every((p) => r.products.some((x) => x.id === p.id)))) return fail("card_without_source");
        for (const r of c.rows) if (!rowValuesOk(r.label, r.values, sources)) return fail("comparison_mismatch");
        const prices = sources.map(effectiveCents);
        const spread = Math.max(...prices) - Math.min(...prices);
        if (spread > 0 ? !moneyOk(c.priceDelta, spread) : c.priceDelta !== undefined) return fail("comparison_mismatch");
        break;
      }
      case "stock": {
        const s = src.stock.find((x) => x.productId === c.productId);
        if (!s) return fail("card_without_source");
        if (c.available !== s.available || c.requestedQuantity !== s.requestedQuantity || c.canFulfil !== s.canFulfil || (c.variantKey ?? undefined) !== (s.variantKey ?? undefined)) return fail("stock_mismatch");
        break;
      }
      case "accessory": {
        const list = src.accessories.find((a) => a.sourceId === c.forProductId);
        const item = list?.items.find((a) => a.product.id === c.product.id && a.kind === c.kind);
        if (!item) return fail("accessory_unauthorized");
        const f = productCardOk(c.product, item.product);
        if (f) return fail(f);
        break;
      }
      case "cart": {
        const cart = src.carts[0];
        if (!cart) return fail("card_without_source");
        if (c.lines.length !== Math.min(cart.lines.length, 20) || !moneyOk(c.subtotal, cart.subtotalCents)) return fail("cart_mismatch");
        if (cart.deliveryCents === undefined ? c.deliveryCharge !== undefined : !moneyOk(c.deliveryCharge, cart.deliveryCents)) return fail("cart_mismatch");
        const lineOk = (l: (typeof c.lines)[number], s: CartLineView) =>
          l.productId === s.productId && l.variantKey === s.variantKey && l.name === s.name && l.quantity === s.quantity && l.available === s.available && moneyOk(l.unitPrice, s.unitCents) && moneyOk(l.lineTotal, s.lineCents);
        if (!c.lines.every((l, idx) => cart.lines[idx] && lineOk(l, cart.lines[idx]!))) return fail("cart_mismatch");
        break;
      }
      case "order": {
        if (i.actor !== "customer") return fail("order_unauthorized"); // a guest never receives order details, whatever the source said
        const o = src.orders.find((x) => x.ref === c.ref);
        if (!o) return fail("card_without_source");
        const okLines = c.lines.length === o.lines.length && c.lines.every((l, idx) => l.name === o.lines[idx]!.name.slice(0, 200) && l.quantity === o.lines[idx]!.quantity && moneyOk(l.unitPrice, o.lines[idx]!.unitCents));
        if (c.status !== o.status || c.payment !== (o.codCollected ? "COD collected" : "COD pending") || !moneyOk(c.total, o.totalCents) || c.cancellable !== o.cancellable || !okLines) return fail("order_mismatch");
        if ((c.carrier ?? undefined) !== (o.carrier ?? undefined) || (c.trackingNumber ?? undefined) !== (o.trackingNumber ?? undefined)) return fail("order_mismatch");
        break;
      }
    }
  }

  // 2. Actions: cart changes are proposals that match a tool proposal exactly and always ask; links go to approved places only.
  for (const a of i.actions) {
    if (a.type === "navigate") {
      const product = /^\/products\/([A-Za-z0-9._~-]{1,200})$/.exec(a.href);
      const known = product ? [...src.products.values()].some((p) => p.slug === product[1]) : false;
      if (!(APPROVED_STATIC_HREF.has(a.href) || known)) return fail("link_not_approved");
      continue;
    }
    if (a.confirm !== "ask") return fail("action_unauthorized");
    const p = src.proposals.find((x) => x.type === a.type && x.productId === a.productId && x.variantKey === a.variantKey && ("quantity" in x ? x.quantity : undefined) === ("quantity" in a ? a.quantity : undefined));
    if (!p) return fail("action_unauthorized");
  }

  // 3. The reply text is a fixed template (or a polished fact-free Sinhala template), never model-authored content.
  if (i.reply.source === "template") {
    if (!i.templateKey || i.reply.text !== renderTemplate(i.templateKey, i.tplLang).text) return fail("reply_unsupported");
  } else if (i.reply.source === "sinhala-llm") {
    if (!hasSinhala(i.reply.text) || /\d|https?:|www\.|\bRs\b|LKR|%|@/i.test(i.reply.text) || i.reply.text.length > 600) return fail("reply_unsupported");
  } else {
    return fail("reply_unsupported"); // Qwen never writes shopper-facing text in M1
  }

  // 4. Nothing sensitive may leave in any text, including catalogue text.
  if (textsOf(i).some((t) => t && containsSensitive(t))) return fail("sensitive_leak");

  // 5. Sinhala, Singlish or mixed output always needs native review.
  const sinhala = i.language !== "en" || textsOf(i).some((t) => hasSinhala(t)) || i.reply.source === "sinhala-llm";
  if (sinhala && !i.needsNativeReview) return fail("review_flag_missing");

  return OK;
}

/** The comparison size a client of this contract version may receive. */
export const maxCompareFor = (v: ContractVersion): number => (v === LEGACY_CONTRACT_VERSION ? LEGACY_MAX_COMPARE_PRODUCTS : MAX_COMPARE_PRODUCTS);

/** Final check on the shaped response: nothing a client of that version cannot understand is sent. */
export function verifyVersionShape(cards: readonly Card[], version: ContractVersion): VerifyResult {
  for (const c of cards) if (c.type === "comparison" && c.products.length > maxCompareFor(version)) return fail("contract_version");
  return OK;
}
