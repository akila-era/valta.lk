import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Payzy (instalment payments) "Custom Web" integration: configuration, HMAC signing and the create-checkout call.
 * Server-only. The secret key must never reach the browser, so signing happens here and never in frontend JS.
 */

export class PayzyConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PayzyConfigError";
  }
}

export interface PayzyConfig {
  baseUrl: string;
  shopId: string;
  secretKey: string;
  testMode: string;
  appUrl: string;
  /** Use the sample frontend's "x_version1.0" (no "=") in the REQUEST sign string. Only if the sandbox rejects the correct form. */
  legacyVersionSigning: boolean;
}

/**
 * The key is a bcrypt-looking string ($2b$12$..., 60 chars). Next.js expands $VAR in .env files, so an unescaped key
 * silently turns into a short fragment. Fail loudly instead of signing with a wrong key.
 */
export function assertPayzyKey(key: string): void {
  if (key.length !== 60 || !key.startsWith("$2b$")) {
    throw new PayzyConfigError(
      `PAYZY_SECRET_KEY is malformed (length ${key.length}, expected 60 starting with "$2b$"). Every "$" in .env files and hosting settings must be written as "\\$" because Next.js expands $VAR.`,
    );
  }
}

/** Reads and validates the Payzy environment. Throws PayzyConfigError (never echoing the key) when anything is missing or wrong. */
export function getPayzyConfig(env: NodeJS.ProcessEnv = process.env): PayzyConfig {
  const get = (k: string) => env[k]?.trim() ?? "";
  const missing = ["PAYZY_BASE_URL", "PAYZY_SHOP_ID", "PAYZY_SECRET_KEY", "PAYZY_TEST_MODE"].filter((k) => !get(k));
  const appUrl = (get("APP_URL") || get("SITE_URL")).replace(/\/+$/, "");
  if (!appUrl) missing.push("APP_URL");
  if (missing.length) throw new PayzyConfigError(`Payzy is not configured: missing ${missing.join(", ")}.`);
  const secretKey = get("PAYZY_SECRET_KEY");
  assertPayzyKey(secretKey);
  return {
    baseUrl: get("PAYZY_BASE_URL").replace(/\/+$/, ""),
    shopId: get("PAYZY_SHOP_ID"),
    secretKey,
    testMode: get("PAYZY_TEST_MODE"),
    appUrl,
    legacyVersionSigning: ["on", "true", "1"].includes(get("PAYZY_LEGACY_VERSION_SIGNING").toLowerCase()),
  };
}

/** Config, or null when Payzy is not set up. Logs the reason once per process (without values) so a bad key is noticed. */
let warned = false;
export function tryGetPayzyConfig(env: NodeJS.ProcessEnv = process.env): PayzyConfig | null {
  try {
    return getPayzyConfig(env);
  } catch (e) {
    const anyPayzyVar = Object.keys(env).some((k) => k.startsWith("PAYZY_") && env[k]);
    if (anyPayzyVar && !warned) {
      warned = true;
      console.error("[payzy]", e instanceof Error ? e.message : "configuration error");
    }
    return null;
  }
}

/* ------------------------------------------------------------------ signing */

/** Exact order Payzy signs, including the trailing "signed_field_names" entry. */
export const REQUEST_FIELD_NAMES = [
  "x_test_mode", "x_shopid", "x_amount", "x_order_id", "x_response_url",
  "x_first_name", "x_last_name", "x_company", "x_address", "x_country", "x_state", "x_city", "x_zip", "x_phone", "x_email",
  "x_ship_to_first_name", "x_ship_to_last_name", "x_ship_to_company", "x_ship_to_address", "x_ship_to_country", "x_ship_to_state", "x_ship_to_city", "x_ship_to_zip",
  "x_freight", "x_platform", "x_version", "signed_field_names",
] as const;

export const RESPONSE_FIELD_NAMES = ["response_code", ...REQUEST_FIELD_NAMES] as const;

const REQUEST_LIST = REQUEST_FIELD_NAMES.join(",");
const RESPONSE_LIST = RESPONSE_FIELD_NAMES.join(",");

type Fields = Record<string, string>;

function joinPairs(names: readonly string[], list: string, fields: Fields, legacyVersion: boolean): string {
  return names
    .map((n) => {
      if (n === "signed_field_names") return `signed_field_names=${list}`;
      const v = fields[n] ?? "";
      // The sample frontend has a typo (x_version1.0). The correct form is only used in the request, never the response.
      if (legacyVersion && n === "x_version") return `x_version${v}`;
      return `${n}=${v}`;
    })
    .join(",");
}

/** Comma-joined name=value pairs in signed_field_names order. No spaces, no URL-encoding, raw values. */
export function buildRequestSignString(fields: Fields, opts: { legacyVersionSigning?: boolean } = {}): string {
  return joinPairs(REQUEST_FIELD_NAMES, REQUEST_LIST, fields, Boolean(opts.legacyVersionSigning));
}

/** Same list with response_code first. `fields` are the stored request fields. */
export function buildResponseSignString(fields: Fields, responseCode: string): string {
  return joinPairs(RESPONSE_FIELD_NAMES, RESPONSE_LIST, { ...fields, response_code: responseCode }, false);
}

/** base64( HMAC_SHA256( key = secret as raw UTF-8, message = signString ) ) */
export function hmacBase64(signString: string, secretKey: string): string {
  return createHmac("sha256", secretKey).update(signString, "utf8").digest("base64");
}

/** Constant-time comparison. A "+" in base64 arrives as a space after URL decoding, so spaces are restored first. */
export function signaturesMatch(expected: string, received: string): boolean {
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(received.replace(/ /g, "+"), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** True only when the signature on a Payzy return matches the stored request fields and the received code. */
export function verifyPayzyResponse(requestFields: Fields, responseCode: string, signature: string, secretKey: string): boolean {
  if (!signature) return false;
  return signaturesMatch(hmacBase64(buildResponseSignString(requestFields, responseCode), secretKey), signature);
}

/* ------------------------------------------------------------------ amount + request fields */

/** Whole amounts as "10", otherwise two decimals ("12500.50"). Format once and reuse the string for sign string and payload. */
export function formatPayzyAmount(amount: number | string | { toString(): string }): string {
  const n = Number(amount.toString());
  if (!Number.isFinite(n) || n <= 0) throw new Error("Invalid Payzy amount");
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

export interface PayzyAddress {
  firstName: string;
  lastName: string;
  company: string;
  address: string;
  country: string;
  state: string;
  city: string;
  zip: string;
}

export interface PayzyOrderInput {
  payzyOrderId: string;
  /** Already formatted with formatPayzyAmount. */
  amount: string;
  billing: PayzyAddress & { phone: string; email: string };
  shipping: PayzyAddress;
  /** Shipping cost as a string, e.g. "0" or "500". */
  freight: string;
}

/** All values are strings. Empty strings are allowed for optional values, identical in the sign string and the payload. */
export function buildRequestFields(cfg: PayzyConfig, o: PayzyOrderInput): Fields {
  const base: Fields = {
    x_test_mode: cfg.testMode,
    x_shopid: cfg.shopId,
    x_amount: o.amount,
    x_order_id: o.payzyOrderId,
    x_response_url: `${cfg.appUrl}/api/payments/payzy/return`,
    x_first_name: o.billing.firstName,
    x_last_name: o.billing.lastName,
    x_company: o.billing.company,
    x_address: o.billing.address,
    x_country: o.billing.country,
    x_state: o.billing.state,
    x_city: o.billing.city,
    x_zip: o.billing.zip,
    x_phone: o.billing.phone,
    x_email: o.billing.email,
    x_ship_to_first_name: o.shipping.firstName,
    x_ship_to_last_name: o.shipping.lastName,
    x_ship_to_company: o.shipping.company,
    x_ship_to_address: o.shipping.address,
    x_ship_to_country: o.shipping.country,
    x_ship_to_state: o.shipping.state,
    x_ship_to_city: o.shipping.city,
    x_ship_to_zip: o.shipping.zip,
    x_freight: o.freight,
    x_platform: "custom",
    x_version: "1.0",
    signed_field_names: REQUEST_LIST,
  };
  return base;
}

/** The JSON body for custom-checkout: all fields plus the signature. */
export function signRequest(cfg: PayzyConfig, fields: Fields): Fields {
  return { ...fields, signature: hmacBase64(buildRequestSignString(fields, { legacyVersionSigning: cfg.legacyVersionSigning }), cfg.secretKey) };
}

export function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { first: parts[0] ?? "Customer", last: "-" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

/* ------------------------------------------------------------------ create checkout */

export class PayzyCheckoutError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "PayzyCheckoutError";
  }
}

/**
 * Server-to-server POST to Payzy. Returns the hosted payment page URL, or throws PayzyCheckoutError.
 * The response body is logged on failure (it never contains our key; the request is not logged).
 */
export async function createPayzyCheckout(cfg: PayzyConfig, signedBody: Fields, fetchImpl: typeof fetch = fetch): Promise<string> {
  let res: Response;
  try {
    res = await fetchImpl(`${cfg.baseUrl}/checkout/custom-checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(signedBody),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch (e) {
    console.error("[payzy] custom-checkout request failed", e instanceof Error ? e.message : "unknown");
    throw new PayzyCheckoutError("Payzy could not be reached.");
  }
  const text = await res.text().catch(() => "");
  let data: unknown = null;
  try {
    data = JSON.parse(text);
  } catch {
    /* non-JSON body */
  }
  const url = pickUrl(data);
  if (!res.ok || !url) {
    console.error("[payzy] custom-checkout rejected", res.status, text.slice(0, 500));
    throw new PayzyCheckoutError("Payzy did not accept the checkout request.", res.status);
  }
  return url;
}

function pickUrl(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const d = data as { url?: unknown; data?: { url?: unknown } };
  const u = typeof d.url === "string" ? d.url : typeof d.data?.url === "string" ? d.data.url : "";
  try {
    return u && /^https?:$/.test(new URL(u).protocol) ? u : null;
  } catch {
    return null;
  }
}
