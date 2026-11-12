import type { AccessoryCardData, AssistantCard, CartAction, ComparisonCardData, Money, ProductCardData, StockCardData } from "@/components/assistant/types";
import { DEMO_LINKS, DEMO_PRODUCTS, type DemoProduct } from "./data";

/**
 * The local mock controller behind the assistant demo. Pure functions over the built-in demo data: no fetch, no storage, no
 * server. Every card is built from a DemoProduct, and every cart change is a proposal that only the reducer's `confirm` applies.
 */
export const MAX_QTY = 10;
export const MIN_COMPARE = 2;
export const MAX_COMPARE = 4;

export function formatRs(rupees: number): string {
  const cents = Math.round(rupees * 100);
  const whole = Math.floor(cents / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `Rs. ${whole}.${String(cents % 100).padStart(2, "0")}`;
}
const money = (rupees: number): Money => ({ amount: rupees, text: formatRs(rupees) });
const effective = (p: DemoProduct) => p.salePrice ?? p.price;
const byId = (id: string) => DEMO_PRODUCTS.find((p) => p.id === id);

export class DemoInputError extends Error {}

function productCard(p: DemoProduct, withSpecs = false): ProductCardData {
  const specs = [...p.specs, ...(p.warrantyMonths ? [{ name: "Warranty", value: `${p.warrantyMonths} months` }] : [])];
  return {
    type: "product",
    id: p.id,
    name: p.name,
    brand: p.brand,
    price: money(effective(p)),
    ...(p.salePrice ? { listPrice: money(p.price), offerName: "Demo offer" } : {}),
    available: p.inStock,
    url: "#demo",
    ...(withSpecs && specs.length ? { specs } : {}),
  };
}

export interface SearchInput {
  category?: string;
  maxPriceLkr?: number;
  inStockOnly?: boolean;
  sort?: "price-asc" | "price-desc";
}

export function search(input: SearchInput): AssistantCard[] {
  if (input.maxPriceLkr !== undefined && (!Number.isFinite(input.maxPriceLkr) || input.maxPriceLkr < 0)) throw new DemoInputError("Budget must be zero or more.");
  let items = DEMO_PRODUCTS.filter((p) => (!input.category || p.category === input.category) && (input.maxPriceLkr === undefined || effective(p) <= input.maxPriceLkr) && (!input.inStockOnly || p.inStock));
  if (input.sort) items = [...items].sort((a, b) => (input.sort === "price-asc" ? effective(a) - effective(b) : effective(b) - effective(a)));
  return items.slice(0, 5).map((p) => productCard(p));
}

function need(id: string): DemoProduct {
  const p = byId(id);
  if (!p) throw new DemoInputError("Unknown product.");
  return p;
}

export const details = (id: string): AssistantCard[] => [productCard(need(id), true)];

export function stock(id: string): AssistantCard[] {
  const p = need(id);
  const card: StockCardData = { type: "stock", productId: p.id, available: p.inStock };
  return [card];
}

export function accessories(id: string): AssistantCard[] {
  need(id);
  return DEMO_LINKS.filter((l) => l.forId === id)
    .map((l) => ({ link: l, p: byId(l.accessoryId) }))
    .filter((x): x is { link: (typeof DEMO_LINKS)[number]; p: DemoProduct } => !!x.p && x.p.inStock)
    .map((x): AccessoryCardData => ({ type: "accessory", forProductId: id, kind: x.link.kind, product: productCard(x.p) }));
}

/** 2 to 4 distinct products. A specification a product does not have is null (shown as unavailable), never invented. */
export function compare(ids: string[]): AssistantCard[] {
  const unique = [...new Set(ids)];
  if (unique.length !== ids.length) throw new DemoInputError("Pick different products to compare.");
  if (ids.length < MIN_COMPARE || ids.length > MAX_COMPARE) throw new DemoInputError(`Compare ${MIN_COMPARE} to ${MAX_COMPARE} products.`);
  const products = ids.map(need);
  const row = (label: string, values: (string | null)[]) => {
    const distinct = new Set(values.filter((v): v is string => v !== null));
    return { label, values, differs: distinct.size > 1 || (distinct.size === 1 && values.some((v) => v === null)) };
  };
  const specNames: string[] = [];
  for (const p of products) for (const s of p.specs) if (!specNames.includes(s.name)) specNames.push(s.name);
  const prices = products.map(effective);
  const spread = Math.max(...prices) - Math.min(...prices);
  const card: ComparisonCardData = {
    type: "comparison",
    products: products.map((p) => productCard(p)),
    rows: [
      row("Brand", products.map((p) => p.brand)),
      row("Category", products.map((p) => p.category)),
      row("Price", products.map((p) => formatRs(effective(p)))),
      row("Availability", products.map((p) => (p.inStock ? "In stock" : "Out of stock"))),
      ...specNames.map((n) => row(n, products.map((p) => p.specs.find((s) => s.name === n)?.value ?? null))),
      row("Warranty", products.map((p) => (p.warrantyMonths ? `${p.warrantyMonths} months` : null))),
    ],
    ...(spread > 0 ? { priceDelta: money(spread) } : {}),
  };
  return [card];
}

// ---------- cart proposals: nothing changes until the shopper confirms ----------

export interface DemoCartLine {
  productId: string;
  quantity: number;
}
export interface DemoState {
  cart: DemoCartLine[];
  /** The one proposal waiting for Confirm or Cancel. */
  pending: CartAction | null;
  /** Proposals already confirmed or cancelled, so none can be applied twice. */
  settled: string[];
}
export const initialState = (): DemoState => ({ cart: [], pending: null, settled: [] });

export type DemoEvent = { type: "propose"; action: CartAction } | { type: "confirm"; actionId: string } | { type: "cancel"; actionId: string };

let counter = 0;
const nextActionId = () => `demo_${Date.now().toString(36)}_${(counter++).toString(36)}`.padEnd(12, "0");

/** Builds a proposal. It validates the product and the quantity, and always asks for confirmation. It never touches the cart. */
export function proposeCart(kind: CartAction["type"], productId: string, quantity = 1, cart: DemoCartLine[] = []): CartAction {
  const p = need(productId);
  if (kind === "cart.remove") {
    if (!cart.some((l) => l.productId === p.id)) throw new DemoInputError("That product is not in the demo cart.");
    return { type: "cart.remove", actionId: nextActionId(), productId: p.id, variantKey: "", confirm: "ask" };
  }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QTY) throw new DemoInputError(`Quantity must be a whole number from 1 to ${MAX_QTY}.`);
  if (!p.inStock) throw new DemoInputError("That product is out of stock (demo).");
  if (kind === "cart.add") {
    const total = (cart.find((l) => l.productId === p.id)?.quantity ?? 0) + quantity;
    if (total > MAX_QTY) throw new DemoInputError(`A line can hold at most ${MAX_QTY}.`);
  } else if (!cart.some((l) => l.productId === p.id)) throw new DemoInputError("That product is not in the demo cart.");
  return { type: kind, actionId: nextActionId(), productId: p.id, variantKey: "", quantity, confirm: "ask" } as CartAction;
}

function apply(cart: DemoCartLine[], a: CartAction): DemoCartLine[] {
  if (a.type === "cart.remove") return cart.filter((l) => l.productId !== a.productId);
  const existing = cart.find((l) => l.productId === a.productId);
  if (a.type === "cart.add") return existing ? cart.map((l) => (l === existing ? { ...l, quantity: Math.min(MAX_QTY, l.quantity + a.quantity) } : l)) : [...cart, { productId: a.productId, quantity: a.quantity }];
  return cart.map((l) => (l.productId === a.productId ? { ...l, quantity: a.quantity } : l));
}

export function reduce(state: DemoState, event: DemoEvent): DemoState {
  switch (event.type) {
    case "propose":
      // A proposal is stored, never applied. Anything not asking for confirmation is refused.
      return event.action.confirm === "ask" ? { ...state, pending: event.action } : state;
    case "confirm": {
      const a = state.pending;
      if (!a || a.actionId !== event.actionId || state.settled.includes(a.actionId)) return state;
      return { cart: apply(state.cart, a), pending: null, settled: [...state.settled, a.actionId] };
    }
    case "cancel": {
      const a = state.pending;
      if (!a || a.actionId !== event.actionId) return state;
      return { ...state, pending: null, settled: [...state.settled, a.actionId] };
    }
  }
}

export function cartSummary(cart: DemoCartLine[]): { lines: { name: string; quantity: number; total: Money }[]; subtotal: Money } {
  const lines = cart.map((l) => ({ name: need(l.productId).name, quantity: l.quantity, total: money(effective(need(l.productId)) * l.quantity) }));
  return { lines, subtotal: money(lines.reduce((s, l) => s + l.total.amount, 0)) };
}

export const productName = (id: string) => byId(id)?.name ?? "Unknown product";
