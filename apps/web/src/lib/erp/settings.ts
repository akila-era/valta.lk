import "server-only";
import { z } from "zod";
import { erpRequest } from "./client";
import { endpoints } from "./endpoints";
import { ErpError } from "./errors";
import { erpSettingsSchema, type ErpSettings } from "./types";

export async function ping(): Promise<boolean> {
  try {
    await erpRequest(endpoints.ping(), z.unknown(), { maxAttempts: 1, timeoutMs: 4000 });
    return true;
  } catch {
    return false;
  }
}

export async function getSettings(opts: { fresh?: boolean } = {}): Promise<ErpSettings> {
  return erpRequest(endpoints.settings(), erpSettingsSchema, { revalidate: opts.fresh ? undefined : 30 });
}

export interface CheckoutAvailability {
  enabled: boolean;
  reason?:
    | "not_configured"
    | "unreachable"
    | "store_inactive"
    | "orders_disabled"
    | "cod_disabled"
    | "currency_unsupported"
    | "invalid_delivery_charge";
  settings?: ErpSettings;
}

/**
 * Whether checkout may be offered right now, derived strictly from live ERP settings.
 * Credential problems (401) and paused integrations (403) both mean the store cannot take orders.
 */
export async function getCheckoutAvailability(opts: { fresh?: boolean } = {}): Promise<CheckoutAvailability> {
  let s: ErpSettings;
  try {
    s = await getSettings(opts);
  } catch (e) {
    if (e instanceof ErpError) {
      if (e.kind === "NOT_CONFIGURED" || e.kind === "UNAUTHORIZED") return { enabled: false, reason: "not_configured" };
      if (e.status === 403) return { enabled: false, reason: "store_inactive" };
    }
    return { enabled: false, reason: "unreachable" };
  }
  if (!s.ordersEnabled) return { enabled: false, reason: "orders_disabled", settings: s };
  if (!s.paymentMethods.COD) return { enabled: false, reason: "cod_disabled", settings: s };
  if (s.currency !== "LKR") return { enabled: false, reason: "currency_unsupported", settings: s };
  if (!Number.isFinite(s.deliveryCharge) || s.deliveryCharge < 0) return { enabled: false, reason: "invalid_delivery_charge", settings: s };
  return { enabled: true, settings: s };
}
