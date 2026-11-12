import { MAX_COMPARE_PRODUCTS, type Card } from "../contract/schemas";
import type { ToolOutcome } from "../tools/runner";
import { effectiveCents, type ProductView, type ToolResult } from "./types";
import { money } from "./wire";

/**
 * Turns tool results into cards. This is where every price, stock state, specification and order detail shown to the shopper is
 * built, and it reads ONLY from backend results: no model output, no template text and no guess is involved. Money is formatted by
 * the server from integer cents.
 */
type ProductCard = Extract<Card, { type: "product" }>;

export function productCard(p: ProductView, opts: { specs?: boolean } = {}): ProductCard {
  const sale = p.saleCents !== null && p.saleCents < p.priceCents;
  return {
    type: "product",
    id: p.id,
    slug: p.slug,
    name: p.name,
    ...(p.brand ? { brand: p.brand } : {}),
    ...(p.imageUrl ? { imageUrl: p.imageUrl } : {}),
    price: money(effectiveCents(p)),
    ...(sale ? { listPrice: money(p.priceCents) } : {}),
    ...(p.offerName ? { offerName: p.offerName } : {}),
    available: p.available,
    ...(p.variants.length ? { variants: p.variants.slice(0, 24).map((v) => ({ key: v.key, label: v.label.slice(0, 120), available: v.available, price: money(effectiveCents(v)) })) } : {}),
    url: `/products/${p.slug}`,
    ...(opts.specs && p.specs.length ? { specs: p.specs.slice(0, 24).map((s) => ({ name: s.name.slice(0, 60), value: s.value.slice(0, 200) })) } : {}),
  };
}

const availabilityText = (p: ProductView) => (p.available ? "In stock" : "Out of stock");

/** Comparison rows. "differs" is computed here, in code, from the values themselves. */
export function comparisonRows(products: ProductView[]): { label: string; values: (string | null)[]; differs: boolean }[] {
  const row = (label: string, values: (string | null)[]) => {
    const distinct = new Set(values.filter((v): v is string => v !== null));
    return { label: label.slice(0, 80), values: values.map((v) => (v === null ? null : v.slice(0, 200))), differs: distinct.size > 1 || (distinct.size === 1 && values.some((v) => v === null)) };
  };
  const rows = [
    row("Brand", products.map((p) => p.brand ?? null)),
    row("Category", products.map((p) => p.category?.name ?? null)),
    row("Price", products.map((p) => money(effectiveCents(p)).text)),
    row("Availability", products.map(availabilityText)),
  ];
  const names: string[] = [];
  for (const p of products) for (const s of p.specs) if (!names.includes(s.name) && s.name !== "Brand") names.push(s.name);
  for (const name of names.slice(0, 20)) rows.push(row(name, products.map((p) => p.specs.find((s) => s.name === name)?.value ?? null)));
  return rows;
}

export interface BuiltCards {
  cards: Card[];
  /** Product ids shown to the shopper, newest first. Used to resolve "this one" in the next message. */
  shownIds: string[];
}

/** Hard cap on cards in one reply (the contract allows 8). */
const MAX_CARDS = 8;

export function buildCards(outcomes: ToolOutcome[]): BuiltCards {
  const cards: Card[] = [];
  const shown: string[] = [];
  for (const o of outcomes) {
    if (o.status !== "ok") continue;
    const r = o.data as ToolResult | undefined;
    if (!r || typeof r !== "object" || !("kind" in r)) continue;
    switch (r.kind) {
      case "search":
        for (const p of r.items.slice(0, 5)) {
          cards.push(productCard(p));
          shown.push(p.id);
        }
        break;
      case "details":
        cards.push(productCard(r.product, { specs: true }));
        shown.push(r.product.id);
        break;
      case "compare": {
        const products = r.products.slice(0, MAX_COMPARE_PRODUCTS);
        const prices = products.map(effectiveCents);
        const spread = Math.max(...prices) - Math.min(...prices);
        cards.push({
          type: "comparison",
          products: products.map((p) => productCard(p)),
          rows: comparisonRows(products),
          ...(spread > 0 ? { priceDelta: money(spread) } : {}),
        });
        shown.push(...products.map((p) => p.id));
        break;
      }
      case "stock":
        cards.push({
          type: "stock",
          productId: r.productId,
          ...(r.variantKey ? { variantKey: r.variantKey } : {}),
          available: r.available,
          ...(r.requestedQuantity !== undefined ? { requestedQuantity: r.requestedQuantity } : {}),
          ...(r.canFulfil !== undefined ? { canFulfil: r.canFulfil } : {}),
        });
        shown.push(r.productId);
        break;
      case "accessories":
        for (const a of r.items.slice(0, 5)) {
          cards.push({ type: "accessory", forProductId: r.sourceId, kind: a.kind, product: productCard(a.product) });
          shown.push(a.product.id);
        }
        break;
      case "cart":
        cards.push({
          type: "cart",
          lines: r.lines.slice(0, 20).map((l) => ({ productId: l.productId, variantKey: l.variantKey, name: l.name, quantity: l.quantity, unitPrice: money(l.unitCents), lineTotal: money(l.lineCents), available: l.available })),
          subtotal: money(r.subtotalCents),
          ...(r.deliveryCents !== undefined ? { deliveryCharge: money(r.deliveryCents) } : {}),
          note: "Final total is confirmed at checkout",
        });
        break;
      case "orders":
        for (const ord of r.orders.slice(0, 3)) {
          cards.push({
            type: "order",
            ref: ord.ref,
            status: ord.status,
            payment: ord.codCollected ? "COD collected" : "COD pending",
            lines: ord.lines.slice(0, 20).map((l) => ({ name: l.name.slice(0, 200), quantity: l.quantity, unitPrice: money(l.unitCents) })),
            total: money(ord.totalCents),
            ...(ord.carrier ? { carrier: ord.carrier } : {}),
            ...(ord.trackingNumber ? { trackingNumber: ord.trackingNumber } : {}),
            cancellable: ord.cancellable,
          });
        }
        break;
      case "proposal":
        break; // the proposal travels as an action, not a card
    }
  }
  return { cards: cards.slice(0, MAX_CARDS), shownIds: [...new Set(shown)].slice(0, 5) };
}
