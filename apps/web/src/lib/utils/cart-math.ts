import { addMoney, multiplyMoney } from "./money";

export const MAX_LINE_QTY = 10;

export interface CartLine {
  productId: string;
  variantKey: string; // "" when the product has no variants
  slug: string;
  name: string;
  /** Product/variant SKU for display only. */
  sku?: string;
  variantLabel?: string;
  image?: string;
  /** Last price seen in the browser. Display only — the server never trusts it. */
  unitPrice: number;
  quantity: number;
}

export const lineKey = (l: Pick<CartLine, "productId" | "variantKey">) => `${l.productId}::${l.variantKey}`;

export function clampQty(qty: number): number {
  if (!Number.isFinite(qty)) return 1;
  return Math.min(MAX_LINE_QTY, Math.max(1, Math.floor(qty)));
}

export function addLine(lines: CartLine[], incoming: CartLine): CartLine[] {
  const key = lineKey(incoming);
  const existing = lines.find((l) => lineKey(l) === key);
  if (!existing) return [...lines, { ...incoming, quantity: clampQty(incoming.quantity) }];
  return lines.map((l) =>
    lineKey(l) === key
      ? { ...l, unitPrice: incoming.unitPrice, quantity: clampQty(l.quantity + incoming.quantity) }
      : l,
  );
}

export function setQuantity(lines: CartLine[], key: string, qty: number): CartLine[] {
  if (qty <= 0) return removeLine(lines, key);
  return lines.map((l) => (lineKey(l) === key ? { ...l, quantity: clampQty(qty) } : l));
}

export function removeLine(lines: CartLine[], key: string): CartLine[] {
  return lines.filter((l) => lineKey(l) !== key);
}

export function subtotal(lines: Pick<CartLine, "unitPrice" | "quantity">[]): number {
  return addMoney(0, ...lines.map((l) => multiplyMoney(l.unitPrice, l.quantity)));
}

export function itemCount(lines: Pick<CartLine, "quantity">[]): number {
  return lines.reduce((n, l) => n + l.quantity, 0);
}
