import { randomUUID } from "node:crypto";
import { ToolError, type ToolContext } from "../tools/registry";
import type { SearchProductsArgs, ToolBackend } from "../tools/definitions";
import { Catalogue, type Audience } from "./catalogue";
import type { SiteData } from "./site";
import { ErpUnavailableError, type ErpTransport } from "./transport";
import { effectiveCents, type CartLineView, type OrderView, type ProductView, type ProposedAction, type ToolResult } from "./types";
import { toCents } from "./wire";

/** The most of one cart line, and the most lines in a cart (the same limits the storefront enforces). */
export const MAX_LINE_QTY = 10;
export const MAX_CART_LINES = 20;

const audienceOf = (ctx: ToolContext): Audience => (ctx.actor.kind === "customer" ? "customer" : "guest");

/**
 * Tool backend over the ERP wire contract (a mock in M1). Every fact it returns comes from the ERP or the website data it is
 * given. Cart tools only VALIDATE and return a proposed browser action; nothing is written anywhere, and there is no code that
 * creates an order, takes payment or applies a discount.
 */
export class MockToolBackend implements ToolBackend {
  constructor(
    private readonly deps: { catalogue: Catalogue; transport: ErpTransport; site: SiteData },
  ) {}

  /** Turns an ERP outage into a safe tool error. Any other error is a bug and is hidden by the tool runner. */
  private async erp<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (e) {
      if (e instanceof ErpUnavailableError) throw new ToolError("SERVICE_UNAVAILABLE", "The store is temporarily unavailable.");
      throw e;
    }
  }

  private async product(id: string, ctx: ToolContext): Promise<ProductView> {
    const p = await this.erp(() => this.deps.catalogue.live(id, audienceOf(ctx), ctx.signal));
    if (!p) throw new ToolError("NOT_FOUND", "That product was not found.");
    return p;
  }

  async search_products(args: SearchProductsArgs, ctx: ToolContext): Promise<ToolResult> {
    const r = await this.erp(() => this.deps.catalogue.search(args, audienceOf(ctx), ctx.signal));
    return { kind: "search", total: r.total, items: r.items };
  }

  async get_product_details(args: { productId: string }, ctx: ToolContext): Promise<ToolResult> {
    return { kind: "details", product: await this.product(args.productId, ctx) };
  }

  async compare_products(args: { productIds: string[] }, ctx: ToolContext): Promise<ToolResult> {
    const products = await Promise.all(args.productIds.map((id) => this.product(id, ctx)));
    return { kind: "compare", products };
  }

  async check_stock(args: { productId: string; variantKey?: string | undefined; quantity?: number | undefined }, ctx: ToolContext): Promise<ToolResult> {
    const p = await this.product(args.productId, ctx);
    let available = p.available;
    let max = p.maxQuantity;
    if (args.variantKey) {
      const v = p.variants.find((x) => x.key === args.variantKey);
      if (!v) throw new ToolError("VARIANT_NOT_FOUND", "That option does not exist for this product.");
      available = v.available;
      max = v.maxQuantity;
    }
    return {
      kind: "stock",
      productId: p.id,
      ...(args.variantKey ? { variantKey: args.variantKey } : {}),
      available,
      ...(args.quantity !== undefined ? { requestedQuantity: args.quantity, canFulfil: available && max >= args.quantity } : {}),
    };
  }

  async get_accessories(args: { productId: string; variantKey?: string | undefined }, ctx: ToolContext): Promise<ToolResult> {
    const source = await this.product(args.productId, ctx);
    const links = this.deps.site.links.filter((l) => l.sourceItemId === source.id && (l.sourceVariantKey === "" || l.sourceVariantKey === (args.variantKey ?? "")));
    const items: { kind: ToolResultAccessoryKind; product: ProductView }[] = [];
    const seen = new Set<string>();
    for (const link of links) {
      if (seen.has(link.accessoryItemId)) continue;
      const acc = await this.erp(() => this.deps.catalogue.live(link.accessoryItemId, audienceOf(ctx), ctx.signal));
      // Only products staff linked explicitly, and only ones that can be bought now.
      if (acc && acc.available) {
        seen.add(acc.id);
        items.push({ kind: link.kind, product: acc });
      }
    }
    return { kind: "accessories", sourceId: source.id, items: items.slice(0, 5) };
  }

  async get_cart(_args: Record<string, never>, ctx: ToolContext): Promise<ToolResult> {
    const snapshot = (ctx.cart ?? []).slice(0, MAX_CART_LINES);
    const lines: CartLineView[] = [];
    let dropped = 0;
    for (const line of snapshot) {
      const p = await this.erp(() => this.deps.catalogue.live(line.productId, audienceOf(ctx), ctx.signal));
      if (!p) {
        dropped++;
        continue;
      }
      const v = p.variants.find((x) => x.key === line.variantKey);
      const unit = v ? effectiveCents(v) : effectiveCents(p);
      const available = v ? v.available && v.maxQuantity >= line.quantity : p.available && p.maxQuantity >= line.quantity;
      lines.push({ productId: p.id, variantKey: line.variantKey, name: p.name, quantity: line.quantity, unitCents: unit, lineCents: unit * line.quantity, available });
    }
    // The charge is stated only when a live settings read succeeds and the store can take orders. Otherwise it is left out, never guessed.
    let deliveryCents: number | undefined;
    try {
      const s = await this.deps.transport.getSettings(ctx.signal);
      if (s.ordersEnabled && s.currency === "LKR") deliveryCents = toCents(s.deliveryCharge);
    } catch (e) {
      if (!(e instanceof ErpUnavailableError)) throw e;
    }
    return {
      kind: "cart",
      lines,
      subtotalCents: lines.filter((l) => l.available).reduce((s, l) => s + l.lineCents, 0),
      ...(deliveryCents !== undefined ? { deliveryCents } : {}),
      dropped,
    };
  }

  /** Every proposal asks for explicit confirmation ("ask"); there is no automatic application. */
  private action(a: DistributiveOmit<ProposedAction, "actionId" | "confirm">): ProposedAction {
    return { ...a, actionId: `act_${randomUUID().replace(/-/g, "").slice(0, 20)}`, confirm: "ask" } as ProposedAction;
  }

  /** The variant a line refers to: required when the product has more than one, implied when it has exactly one. */
  private resolveVariant(p: ProductView, variantKey: string): { key: string; available: boolean; max: number } {
    if (p.variants.length === 0) return { key: "", available: p.available, max: p.maxQuantity };
    if (variantKey === "") {
      if (p.variants.length > 1) throw new ToolError("VARIANT_REQUIRED", "Please choose an option for this product.");
      const only = p.variants[0]!;
      return { key: only.key, available: only.available, max: only.maxQuantity };
    }
    const v = p.variants.find((x) => x.key === variantKey);
    if (!v) throw new ToolError("VARIANT_NOT_FOUND", "That option does not exist for this product.");
    return { key: v.key, available: v.available, max: v.maxQuantity };
  }

  async add_to_cart(args: { productId: string; variantKey: string; quantity: number }, ctx: ToolContext): Promise<ToolResult> {
    const cart = ctx.cart ?? [];
    const p = await this.product(args.productId, ctx);
    const v = this.resolveVariant(p, args.variantKey);
    if (!v.available) throw new ToolError("OUT_OF_STOCK", "That item is out of stock.");
    const existing = cart.find((c) => c.productId === p.id && c.variantKey === v.key)?.quantity ?? 0;
    const total = existing + args.quantity;
    if (total > MAX_LINE_QTY) throw new ToolError("LIMIT", "That is more than the per-item limit.");
    if (total > v.max) throw new ToolError("QUANTITY_UNAVAILABLE", "That quantity is not available.");
    if (existing === 0 && cart.length >= MAX_CART_LINES) throw new ToolError("LIMIT", "The cart is full.");
    // Adding to an existing line is expressed as setting its new quantity, so the browser never double-applies.
    return {
      kind: "proposal",
      clientAction: existing > 0 ? this.action({ type: "cart.setQuantity", productId: p.id, variantKey: v.key, quantity: total }) : this.action({ type: "cart.add", productId: p.id, variantKey: v.key, quantity: args.quantity }),
    };
  }

  async update_cart_quantity(args: { productId: string; variantKey: string; quantity: number }, ctx: ToolContext): Promise<ToolResult> {
    const line = (ctx.cart ?? []).find((c) => c.productId === args.productId && c.variantKey === args.variantKey);
    if (!line) throw new ToolError("NOT_IN_CART", "That item is not in the cart.");
    const p = await this.product(args.productId, ctx);
    const v = this.resolveVariant(p, args.variantKey);
    if (!v.available) throw new ToolError("OUT_OF_STOCK", "That item is out of stock.");
    if (args.quantity > MAX_LINE_QTY) throw new ToolError("LIMIT", "That is more than the per-item limit.");
    if (args.quantity > v.max) throw new ToolError("QUANTITY_UNAVAILABLE", "That quantity is not available.");
    return { kind: "proposal", clientAction: this.action({ type: "cart.setQuantity", productId: p.id, variantKey: v.key, quantity: args.quantity }) };
  }

  async remove_from_cart(args: { productId: string; variantKey: string }, ctx: ToolContext): Promise<ToolResult> {
    const line = (ctx.cart ?? []).find((c) => c.productId === args.productId && c.variantKey === args.variantKey);
    if (!line) throw new ToolError("NOT_IN_CART", "That item is not in the cart.");
    return { kind: "proposal", clientAction: this.action({ type: "cart.remove", productId: line.productId, variantKey: line.variantKey }) };
  }

  /**
   * Signed-in customers only, and only orders linked to THEIR account. A reference that is not theirs gets the same generic answer
   * as one that does not exist. The result never contains an address, phone number or any other customer detail.
   */
  async get_order_status(args: { ref?: string | undefined }, ctx: ToolContext): Promise<ToolResult> {
    if (ctx.actor.kind !== "customer" || !ctx.actor.customerId) throw new ToolError("FORBIDDEN", "Order information is only available to signed-in customers.");
    const owned = this.deps.site.customerOrders.get(ctx.actor.customerId) ?? [];
    let refs: string[];
    if (args.ref) {
      if (!owned.includes(args.ref)) throw new ToolError("NOT_FOUND", "I couldn't find that order on your account.");
      refs = [args.ref];
    } else {
      refs = owned.slice(0, 5);
    }
    const names = new Map((await this.erp(() => this.deps.catalogue.listing("customer", ctx.signal))).map((p) => [p.id, p.name]));
    const orders: OrderView[] = [];
    for (const ref of refs) {
      const o = await this.erp(() => this.deps.transport.getOrder(ref, ctx.signal));
      if (!o) continue;
      orders.push({
        ref: o.externalRef,
        status: o.status,
        codCollected: o.paymentStatus === "COD_COLLECTED",
        lines: o.lines.map((l) => ({ name: names.get(l.itemId) ?? "Item", quantity: l.quantity, unitCents: toCents(l.unitPrice) })),
        totalCents: toCents(o.total),
        ...(o.carrierName ? { carrier: o.carrierName } : {}),
        ...(o.trackingNumber ? { trackingNumber: o.trackingNumber } : {}),
        cancellable: o.status === "PLACED" || o.status === "CONFIRMED",
      });
    }
    if (args.ref && orders.length === 0) throw new ToolError("NOT_FOUND", "I couldn't find that order on your account.");
    return { kind: "orders", orders };
  }
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

type ToolResultAccessoryKind = Extract<ToolResult, { kind: "accessories" }>["items"][number]["kind"];
