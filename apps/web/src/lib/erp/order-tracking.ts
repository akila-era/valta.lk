import "server-only";
import { z } from "zod";
import { getSnapshot } from "./catalogue";
import { erpRequest } from "./client";
import { endpoints } from "./endpoints";
import { erpOrderSchema, TERMINAL_STATUSES, type ErpOrder, type ErpProduct, type OrderStatus } from "./types";

/** `opts` lets background jobs use a shorter timeout and a single attempt; pages keep the defaults. */
export async function getOrder(ref: string, opts: { timeoutMs?: number; maxAttempts?: number } = {}): Promise<ErpOrder> {
  return erpRequest(endpoints.order(ref), erpOrderSchema, { maxAttempts: opts.maxAttempts ?? 2, ...(opts.timeoutMs ? { timeoutMs: opts.timeoutMs } : {}) });
}

export async function cancelOrder(ref: string): Promise<void> {
  await erpRequest(endpoints.cancelOrder(ref), z.unknown(), {
    method: "POST",
    idempotencyKey: `cancel-${ref}`,
    body: { reason: "Cancelled by customer on VALTA.LK" },
  });
}

/** Cancellation is only offered before dispatch; the ERP makes the final decision. */
export const canCancel = (status: OrderStatus) => status === "PLACED" || status === "CONFIRMED";
export const isTerminal = (status: OrderStatus) => TERMINAL_STATUSES.includes(status);

/** Public, privacy-filtered view of an order (no internal IDs, customer data, or tenant info). */
export interface PublicOrder {
  ref: string;
  /** "RECEIVED" = saved on the website but not yet confirmed by the ERP (it is retried automatically). */
  status: OrderStatus | "RECEIVED";
  /** pending = waiting to reach the ERP; synced = the ERP has it. */
  syncState?: "pending" | "synced";
  currency: string;
  paymentMethod: string;
  codCollected: boolean;
  lines: { name: string; variantLabel?: string; quantity: number; unitPrice: number }[];
  deliveryCharge: number;
  total: number;
  createdAt?: string;
  trackingNumber?: string;
  carrier?: string;
  cancellable: boolean;
}

/** Order lines carry only item ids, so names come from the cached catalogue (best effort). */
async function loadProducts(): Promise<Map<string, ErpProduct>> {
  try {
    return (await getSnapshot()).products;
  } catch {
    return new Map();
  }
}

export function toPublicOrder(o: ErpOrder, products: Map<string, ErpProduct> = new Map()): PublicOrder {
  return {
    ref: o.externalRef,
    status: o.status,
    currency: o.currency,
    paymentMethod: o.paymentMethod,
    codCollected: o.paymentStatus === "COD_COLLECTED",
    lines: o.lines.map((l) => {
      const p = products.get(l.itemId);
      return {
        name: p?.name ?? "Item",
        variantLabel: l.variantKey ? (p?.variants.find((v) => v.key === l.variantKey)?.label ?? undefined) : undefined,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
      };
    }),
    deliveryCharge: o.deliveryCharge,
    total: o.total,
    createdAt: o.placedAt,
    trackingNumber: o.trackingNumber ?? undefined,
    carrier: o.carrierName ?? undefined,
    cancellable: canCancel(o.status),
  };
}

export async function getPublicOrder(ref: string): Promise<PublicOrder> {
  const order = await getOrder(ref);
  return toPublicOrder(order, await loadProducts());
}

export async function enrichOrder(order: ErpOrder): Promise<PublicOrder> {
  return toPublicOrder(order, await loadProducts());
}
