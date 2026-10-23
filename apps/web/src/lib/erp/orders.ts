import "server-only";
import { toDecimalString } from "../utils/money";
import { erpRequest } from "./client";
import { endpoints } from "./endpoints";
import { erpOrderSchema, type CreateOrderRequest, type ErpOrder } from "./types";

/**
 * Creates a COD order. The ERP rejects unknown fields, so this sends exactly the documented ones.
 * `externalRef` is also the Idempotency-Key, so a retried request can never create a second order.
 */
export async function createOrder(req: CreateOrderRequest): Promise<ErpOrder> {
  const body = {
    externalRef: req.externalRef,
    ...(req.reservationRef ? { reservationRef: req.reservationRef } : {}),
    currency: req.currency,
    paymentMethod: req.paymentMethod,
    lines: req.lines.map((l) => ({
      itemId: l.itemId,
      ...(l.variantKey ? { variantKey: l.variantKey } : {}),
      quantity: l.quantity,
      unitPrice: toDecimalString(l.unitPrice),
    })),
    deliveryCharge: toDecimalString(req.deliveryCharge),
    total: toDecimalString(req.total),
    customer: {
      name: req.customer.name,
      phone: req.customer.phone,
      ...(req.customer.email ? { email: req.customer.email } : {}),
    },
    delivery: {
      addressLine1: req.delivery.addressLine1,
      city: req.delivery.city,
      district: req.delivery.district,
      ...(req.delivery.postalCode ? { postalCode: req.delivery.postalCode } : {}),
      ...(req.delivery.notes ? { notes: req.delivery.notes } : {}),
    },
  };
  return erpRequest(endpoints.orders(), erpOrderSchema, {
    method: "POST",
    body,
    idempotencyKey: req.externalRef,
    timeoutMs: 15000,
  });
}
