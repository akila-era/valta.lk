/**
 * Card and action shapes of the Agent API contract (apps/agent/src/contract/schemas.ts), as the browser receives them.
 * Presentational only: the components in this folder render what the backend sent and never compute or invent a fact.
 */
export interface Money {
  /** Rupees, as in the Agent contract. */
  amount: number;
  text: string;
}
export interface ProductCardData {
  type: "product";
  id: string;
  name: string;
  brand?: string;
  imageUrl?: string;
  price: Money;
  listPrice?: Money;
  offerName?: string;
  available: boolean;
  url: string;
  specs?: { name: string; value: string }[];
  variants?: { key: string; label: string; available: boolean; price: Money }[];
  /** Why this product suits what the shopper said (codes; see labels.ts for the wording). */
  fit?: { reasons: string[]; tradeoffs: string[] };
}
export interface ComparisonCardData {
  type: "comparison";
  products: ProductCardData[];
  rows: { label: string; values: (string | null)[]; differs: boolean }[];
  priceDelta?: Money;
}
export interface AccessoryCardData {
  type: "accessory";
  forProductId: string;
  kind: string;
  product: ProductCardData;
}
export interface StockCardData {
  type: "stock";
  productId: string;
  available: boolean;
  requestedQuantity?: number;
  canFulfil?: boolean;
}
export type AssistantCard = ProductCardData | ComparisonCardData | AccessoryCardData | StockCardData | { type: "cart" | "order"; [k: string]: unknown };

export type CartAction =
  | { type: "cart.add"; actionId: string; productId: string; variantKey: string; quantity: number; confirm: "none" | "ask" }
  | { type: "cart.setQuantity"; actionId: string; productId: string; variantKey: string; quantity: number; confirm: "none" | "ask" }
  | { type: "cart.remove"; actionId: string; productId: string; variantKey: string; confirm: "none" | "ask" };

export type AssistantLang = "en" | "si";
