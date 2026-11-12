export type AccessoryKind = "BACK_COVER" | "SCREEN_PROTECTOR" | "LENS_PROTECTOR" | "CHARGER" | "CABLE" | "OTHER";

/** What the backend returns to the tools. Everything is derived from ERP and website data; nothing is generated. */
export interface VariantView {
  key: string;
  label: string;
  storage?: string;
  color?: string;
  priceCents: number;
  saleCents: number | null;
  available: boolean;
  /** At most what the ERP reports as purchasable (it caps at 20). Never shown to the shopper as a stock level. */
  maxQuantity: number;
}

export interface ProductView {
  id: string;
  slug: string;
  name: string;
  brand?: string;
  model?: string;
  category?: { slug: string; name: string };
  subCategory?: { slug: string; name: string };
  imageUrl?: string;
  priceCents: number;
  saleCents: number | null;
  available: boolean;
  maxQuantity: number;
  variants: VariantView[];
  offerName?: string;
  specs: { name: string; value: string }[];
  /** Plain text, stripped and capped. Untrusted content: never shown to a model as instructions. */
  description?: string;
  publishedAt?: string;
  updatedAt: string;
}

export const effectiveCents = (p: { priceCents: number; saleCents: number | null }): number => (p.saleCents !== null && p.saleCents < p.priceCents ? p.saleCents : p.priceCents);

export interface CartLineView {
  productId: string;
  variantKey: string;
  name: string;
  quantity: number;
  unitCents: number;
  lineCents: number;
  available: boolean;
}

export interface OrderView {
  ref: string;
  status: string;
  codCollected: boolean;
  lines: { name: string; quantity: number; unitCents: number }[];
  totalCents: number;
  carrier?: string;
  trackingNumber?: string;
  cancellable: boolean;
}

export type ProposedAction =
  | { type: "cart.add"; actionId: string; productId: string; variantKey: string; quantity: number; confirm: "ask" }
  | { type: "cart.setQuantity"; actionId: string; productId: string; variantKey: string; quantity: number; confirm: "ask" }
  | { type: "cart.remove"; actionId: string; productId: string; variantKey: string; confirm: "ask" };

export type ToolResult =
  | { kind: "search"; total: number; items: ProductView[] }
  | { kind: "details"; product: ProductView }
  | { kind: "compare"; products: ProductView[] }
  | { kind: "stock"; productId: string; variantKey?: string; available: boolean; requestedQuantity?: number; canFulfil?: boolean }
  | { kind: "accessories"; sourceId: string; items: { kind: AccessoryKind; product: ProductView }[] }
  | { kind: "cart"; lines: CartLineView[]; subtotalCents: number; deliveryCents?: number; dropped: number }
  | { kind: "proposal"; clientAction: ProposedAction }
  | { kind: "orders"; orders: OrderView[] };
