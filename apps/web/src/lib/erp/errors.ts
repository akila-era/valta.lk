import type { ErpErrorCode } from "./types";

export type ErpFailureKind =
  | ErpErrorCode
  | "UNAUTHORIZED" // 401 (uniform for any credential problem)
  | "NOT_FOUND"
  | "NOT_CONFIGURED"
  | "UNREACHABLE"
  | "TIMEOUT"
  | "BAD_RESPONSE"
  | "UNKNOWN";

export class ErpError extends Error {
  constructor(
    public readonly kind: ErpFailureKind,
    public readonly status: number,
    message: string,
    public readonly retryAfterSec?: number,
  ) {
    super(message);
    this.name = "ErpError";
  }
}

export interface MappedError {
  status: number;
  code: string;
  message: string;
}

/** Maps ERP failures to safe, customer-facing API responses. Never leaks upstream bodies or credentials. */
export function mapErpError(err: unknown): MappedError {
  if (!(err instanceof ErpError)) return { status: 500, code: "INTERNAL", message: "Something went wrong. Please try again." };
  switch (err.kind) {
    case "PRICE_CHANGED":
    case "TOTAL_MISMATCH":
    case "CURRENCY_MISMATCH":
      return { status: 409, code: "PRICE_CHANGED", message: "Some prices changed. We have refreshed your cart, so please review it and try again." };
    case "INSUFFICIENT_STOCK":
    case "ITEM_NOT_AVAILABLE":
    case "ITEM_NOT_FULFILLABLE":
      return { status: 409, code: "INSUFFICIENT_STOCK", message: "Some items are no longer available in the requested quantity." };
    case "MULTI_BRANCH_ORDER_UNSUPPORTED":
      return { status: 409, code: "CANNOT_COMBINE", message: "These items cannot be ordered together. Please order them separately." };
    case "RESERVATION_NOT_FOUND":
    case "RESERVATION_IN_USE":
    case "RESERVATION_EXPIRED":
    case "RESERVATION_MISMATCH":
      return { status: 409, code: "RESERVATION_FAILED", message: "Your stock hold is no longer valid. Please try placing your order again." };
    case "REFERENCE_REUSED":
    case "IDEMPOTENCY_KEY_REUSED":
      return { status: 409, code: "REFERENCE_REUSED", message: "This order reference was already used with different details. Please refresh the page and try again." };
    case "IDEMPOTENCY_IN_PROGRESS":
      return { status: 409, code: "IN_PROGRESS", message: "Your order is still being processed. Please wait a moment, then check the order status or try again." };
    case "VALIDATION_ERROR":
      return { status: 422, code: "VALIDATION_FAILED", message: "We could not accept some of your details. Please check them and try again." };
    case "RATE_LIMITED":
      return { status: 429, code: "RATE_LIMITED", message: "Too many requests. Please wait a moment and try again." };
    case "NOT_FOUND":
      return { status: 404, code: "NOT_FOUND", message: "We could not find that order." };
    case "ORDER_NOT_CANCELLABLE":
      return { status: 409, code: "CANNOT_CANCEL", message: "This order can no longer be cancelled online. Please contact us." };
    case "ECOMMERCE_NOT_ENTITLED":
    case "CATALOGUE_NOT_ENABLED":
    case "RESERVATIONS_NOT_ENABLED":
    case "ORDERS_NOT_ENABLED":
    case "PAYMENT_METHOD_NOT_ENABLED":
    case "FULFILMENT_NOT_CONFIGURED":
    case "INVALID_CREDENTIALS":
    case "UNAUTHORIZED":
    case "NOT_CONFIGURED":
      return { status: 503, code: "STORE_UNAVAILABLE", message: "Online ordering is temporarily unavailable. Please try again later." };
    default:
      return { status: 503, code: "ERP_UNAVAILABLE", message: "We could not reach our system. Please try again shortly." };
  }
}
