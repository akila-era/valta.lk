import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { getDb } from "../db";
import { checkAvailability, type LineRequest } from "../erp/availability";
import { getSnapshot } from "../erp/catalogue";
import { ErpError } from "../erp/errors";
import { createOrder } from "../erp/orders";
import { enrichOrder, type PublicOrder } from "../erp/order-tracking";
import { getCheckoutAvailability } from "../erp/settings";
import type { AvailabilityLine, CreateOrderRequest, ErpProduct } from "../erp/types";
import type { PlaceOrderInput } from "../validation/checkout";
import { addMoney, multiplyMoney, toCents } from "../utils/money";
import { localPublicOrder } from "../orders/public";
import { discardOrder, persistOrder, syncOrder, type DisplayLine } from "../orders/web-orders";
import { getOrder } from "../erp/order-tracking";
import { breakdownJson, quotePricedLines, recordAdvertisedRedemptions } from "../promotions/quote";
import type { PricedLine } from "../promotions/evaluate";

export interface RefreshedLine {
  productId: string;
  variantKey: string;
  unitPrice: number;
  available: boolean;
  maxQuantity: number | null;
}

export class CheckoutConflict extends Error {
  constructor(
    public readonly code: "PRICE_CHANGED" | "INSUFFICIENT_STOCK",
    public readonly refreshed: RefreshedLine[],
    public readonly newTotal?: number,
  ) {
    super(code);
  }
}

export interface PlaceOrderContext {
  customerId?: string | null;
  /** Random token handed to the browser that places the order (only its hash is stored). */
  accessToken: string;
}

/** `created`: the ERP confirmed the order. `accepted`: saved on the website, the ERP is retried automatically. */
export interface PlaceOrderResult {
  state: "created" | "accepted";
  order: PublicOrder;
}

const inflight = new Map<string, Promise<PlaceOrderResult>>();

const lineMatch = (a: AvailabilityLine, l: LineRequest) => a.itemId === l.productId && (a.variantKey ?? "") === l.variantKey;

function toRefreshed(lines: LineRequest[], avail: AvailabilityLine[]): RefreshedLine[] {
  return lines.map((l) => {
    const a = avail.find((x) => lineMatch(x, l));
    return { productId: l.productId, variantKey: l.variantKey, unitPrice: a?.unitPrice ?? 0, available: a?.available ?? false, maxQuantity: a?.maxQuantity ?? null };
  });
}

/**
 * Places a COD order. Prices, delivery charge and total are computed from ERP data; anything the
 * browser sent about money is used only to detect that the customer saw a stale total.
 * Calling this again with the same externalRef is safe: the ERP idempotency key prevents duplicates.
 */
export function placeOrder(input: PlaceOrderInput, ctx: PlaceOrderContext = { accessToken: "" }): Promise<PlaceOrderResult> {
  const existing = inflight.get(input.externalRef);
  if (existing) return existing; // duplicate submit while the first is still running
  const p = doPlaceOrder(input, ctx).finally(() => inflight.delete(input.externalRef));
  inflight.set(input.externalRef, p);
  return p;
}

async function doPlaceOrder(input: PlaceOrderInput, ctx: PlaceOrderContext): Promise<PlaceOrderResult> {
  const gate = await getCheckoutAvailability({ fresh: true });
  if (!gate.enabled || !gate.settings) {
    throw new ErpError(gate.reason === "unreachable" ? "UNREACHABLE" : "ORDERS_NOT_ENABLED", 503, "Checkout unavailable");
  }
  const settings = gate.settings;

  // Merge duplicate lines defensively.
  const merged = new Map<string, LineRequest>();
  for (const l of input.lines) {
    const k = `${l.productId}::${l.variantKey}`;
    const cur = merged.get(k);
    merged.set(k, cur ? { ...cur, quantity: cur.quantity + l.quantity } : { productId: l.productId, variantKey: l.variantKey, quantity: l.quantity });
  }
  const lines = [...merged.values()];

  const avail = await checkAvailability(lines);
  const priced = lines.map((l) => ({ l, a: avail.find((x) => lineMatch(x, l)) }));
  if (priced.some(({ a }) => !a)) throw new ErpError("BAD_RESPONSE", 502, "Availability response incomplete");
  if (priced.some(({ a }) => !a!.available)) throw new CheckoutConflict("INSUFFICIENT_STOCK", toRefreshed(lines, avail));

  const orderLines = priced.map(({ l, a }) => ({ itemId: l.productId, variantKey: l.variantKey, quantity: l.quantity, unitPrice: a!.unitPrice }));
  const subtotal = addMoney(0, ...orderLines.map((l) => multiplyMoney(l.unitPrice, l.quantity)));
  const total = addMoney(subtotal, settings.deliveryCharge);

  if (toCents(total) !== toCents(input.expectedTotal)) {
    throw new CheckoutConflict("PRICE_CHANGED", toRefreshed(lines, avail), total);
  }

  // No reservationRef: the ERP creates and owns the stock hold atomically with the order, so there is nothing to
  // clean up if the order fails and no separate hold that can expire between steps.
  const request: CreateOrderRequest = {
    externalRef: input.externalRef,
    currency: settings.currency,
    paymentMethod: "COD",
    lines: orderLines,
    deliveryCharge: settings.deliveryCharge,
    total,
    customer: { name: input.customer.name, phone: input.customer.phone, ...(input.customer.email ? { email: input.customer.email } : {}) },
    delivery: {
      addressLine1: input.delivery.address,
      city: input.delivery.city,
      district: input.delivery.district,
      ...(input.delivery.postalCode ? { postalCode: input.delivery.postalCode } : {}),
      ...(input.delivery.notes ? { notes: input.delivery.notes } : {}),
    },
  };

  const conflict = async (e: unknown): Promise<never> => {
    if (e instanceof ErpError && ["PRICE_CHANGED", "TOTAL_MISMATCH", "CURRENCY_MISMATCH", "INSUFFICIENT_STOCK", "ITEM_NOT_AVAILABLE", "ITEM_NOT_FULFILLABLE"].includes(e.kind)) {
      const fresh = await checkAvailability(lines).catch(() => avail);
      throw new CheckoutConflict(e.kind === "INSUFFICIENT_STOCK" ? "INSUFFICIENT_STOCK" : "PRICE_CHANGED", toRefreshed(lines, fresh));
    }
    throw e;
  };

  const db = getDb();
  if (!db) {
    // No website database: send straight to the ERP (idempotent). A failure is reported to the customer, who can retry.
    try {
      return { state: "created", order: await enrichOrder(await createOrder(request)) };
    } catch (e) {
      return conflict(e);
    }
  }

  // Website database available: save the order FIRST so a valid order survives an ERP outage, then send it.
  const names = await getSnapshot().then((s) => s.products).catch(() => new Map<string, ErpProduct>());
  const items: DisplayLine[] = orderLines.map((l) => {
    const p = names.get(l.itemId);
    return { itemId: l.itemId, variantKey: l.variantKey, name: p?.name ?? "Item", variantLabel: l.variantKey ? p?.variants.find((v: { key: string; label: string }) => v.key === l.variantKey)?.label : undefined, quantity: l.quantity, unitPrice: l.unitPrice, image: p?.images[0] };
  });
  const pricedLines: PricedLine[] = orderLines.map((l) => {
    const p = names.get(l.itemId);
    const variant = l.variantKey ? p?.variants.find((v) => v.key === l.variantKey) : undefined;
    const listPrice = variant?.price ?? p?.price ?? l.unitPrice;
    return {
      productId: l.itemId,
      variantKey: l.variantKey,
      quantity: l.quantity,
      listPrice,
      erpPrice: l.unitPrice,
      categoryName: p?.category?.name ?? null,
    };
  });
  const quote = await quotePricedLines(pricedLines, { customerId: ctx.customerId, delivery: settings.deliveryCharge });
  const { order: row, created } = await persistOrder(db, {
    request,
    items,
    subtotal,
    customerId: ctx.customerId,
    accessToken: ctx.accessToken,
    priceBreakdown: breakdownJson(quote) as Prisma.InputJsonValue,
  });
  if (created) await recordAdvertisedRedemptions(db, row.externalRef, ctx.customerId ?? null, quote).catch(() => undefined);

  if (row.syncStatus === "SYNCED") {
    // Same reference submitted again after the ERP already has it (e.g. the browser lost the first response).
    const erp = await getOrder(row.externalRef).catch(() => null);
    return { state: "created", order: erp ? await enrichOrder(erp) : localPublicOrder(row) };
  }

  const outcome = await syncOrder(db, row.externalRef, { force: true });
  if (outcome.kind === "synced") {
    const erp = outcome.order ?? (await getOrder(row.externalRef).catch(() => null));
    return { state: "created", order: erp ? await enrichOrder(erp) : localPublicOrder(row) };
  }
  if (outcome.kind === "failed") {
    // The ERP refused this exact request during checkout: nothing was accepted, so keep no record and tell the customer.
    if (created) await discardOrder(db, row.externalRef);
    const rejected = new ErpError(outcome.code as never, 409, outcome.message);
    return conflict(rejected);
  }
  // pending / busy: the order is safely stored and will be retried; the customer is told it was received.
  return { state: "accepted", order: localPublicOrder((await db.webOrder.findUnique({ where: { externalRef: row.externalRef } })) ?? row) };
}
