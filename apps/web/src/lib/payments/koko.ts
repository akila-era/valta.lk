import "server-only";
import { createSign, createVerify } from "node:crypto";

/**
 * Koko (Buy Now Pay Later) client: configuration, RSA signing/verification and the orderView lookup.
 * Server-only (uses node:crypto). Secrets come from KOKO_* env vars and never reach the browser.
 */

export interface KokoConfig {
  baseUrl: string;
  merchantId: string;
  apiKey: string;
  pluginName: string;
  pluginVersion: string;
  privateKey: string;
  publicKey: string;
  appUrl: string;
}

/** Accepts both real newlines and the escaped "\n" form that .env files usually contain. */
export const normalizePem = (v: string) => v.trim().replace(/^"|"$/g, "").replace(/\\n/g, "\n");

/** Configuration from environment variables (the admin-saved one is in koko-config.ts), or null when any required variable is missing. Never throws and never echoes values. */
export function getKokoConfig(env: NodeJS.ProcessEnv = process.env): KokoConfig | null {
  const get = (k: string) => env[k]?.trim() ?? "";
  const cfg = {
    baseUrl: get("KOKO_BASE_URL").replace(/\/+$/, ""),
    merchantId: get("KOKO_MERCHANT_ID"),
    apiKey: get("KOKO_API_KEY"),
    pluginName: get("KOKO_PLUGIN_NAME"),
    pluginVersion: get("KOKO_PLUGIN_VERSION"),
    privateKey: normalizePem(get("KOKO_MERCHANT_PRIVATE_KEY")),
    publicKey: normalizePem(get("KOKO_PUBLIC_KEY")),
    appUrl: (get("APP_URL") || get("SITE_URL")).replace(/\/+$/, ""),
  };
  return Object.values(cfg).every(Boolean) ? cfg : null;
}

/* ------------------------------------------------------------------ crypto */

/** RSA PKCS#1 v1.5 + SHA-256, base64. The string is signed exactly as given (no trimming, no re-encoding). */
export function signData(dataString: string, privateKey: string): string {
  return createSign("RSA-SHA256").update(dataString, "utf8").sign(privateKey, "base64");
}

/** True only for a valid signature. Malformed keys or signatures return false instead of throwing. */
export function verifyData(dataString: string, signature: string, publicKey: string): boolean {
  try {
    // A "+" in a form-encoded body can arrive as a space; base64 never contains spaces, so restoring it is safe.
    return createVerify("RSA-SHA256").update(dataString, "utf8").verify(publicKey, signature.replace(/ /g, "+"), "base64");
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ data strings (order matters, NOT alphabetical) */

export interface KokoCreateFields {
  _mId: string;
  api_key: string;
  _returnUrl: string;
  _cancelUrl: string;
  _responseUrl: string;
  _amount: string;
  _currency: string;
  _reference: string;
  _orderId: string;
  _pluginName: string;
  _pluginVersion: string;
  _description: string;
  _firstName: string;
  _lastName: string;
  _email: string;
}

export function buildCreateDataString(f: KokoCreateFields): string {
  return (
    f._mId + f._amount + f._currency + f._pluginName + f._pluginVersion + f._returnUrl + f._cancelUrl +
    f._orderId + f._reference + f._firstName + f._lastName + f._email + f._description + f.api_key + f._responseUrl
  );
}

export const buildOrderViewDataString = (f: { _mId: string; _pluginName: string; _pluginVersion: string; _orderId: string; api_key: string }) =>
  f._mId + f._pluginName + f._pluginVersion + f._orderId + f.api_key;

/** What Koko signs on callbacks and orderView answers. A missing desc counts as "". */
export const buildCallbackDataString = (c: { orderId: string; trnId: string; status: string; desc?: string | null }) =>
  c.orderId + c.trnId + c.status + (c.desc ?? "");

export function verifyKokoCallback(c: { orderId: string; trnId: string; status: string; desc?: string | null; signature: string }, publicKey: string): boolean {
  return verifyData(buildCallbackDataString(c), c.signature, publicKey);
}

/** "12500.00": format once and reuse the exact string for both the form field and the signed data. */
export function formatKokoAmount(amount: number | string | { toString(): string }): string {
  const n = Number(amount.toString());
  if (!Number.isFinite(n) || n <= 0) throw new Error("Invalid Koko amount");
  return (Math.round(n * 100) / 100).toFixed(2);
}

export function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { first: parts[0] ?? "Customer", last: "-" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

/* ------------------------------------------------------------------ create-order form */

export interface KokoOrderInput {
  kokoOrderId: string;
  amount: string; // already formatted by formatKokoAmount
  currency: string;
  customerName: string;
  email: string;
  mobile?: string;
  description: string;
}

export interface KokoForm {
  action: string;
  fields: Record<string, string>;
}

/** Builds the fields the browser must POST to Koko's orderCreate page, including the signature. */
export function buildKokoForm(cfg: KokoConfig, o: KokoOrderInput): KokoForm {
  const { first, last } = splitName(o.customerName);
  const base: KokoCreateFields = {
    _mId: cfg.merchantId,
    api_key: cfg.apiKey,
    _returnUrl: `${cfg.appUrl}/api/payments/koko/return`,
    _cancelUrl: `${cfg.appUrl}/api/payments/koko/cancel`,
    _responseUrl: `${cfg.appUrl}/api/payments/koko/webhook`,
    _amount: o.amount,
    _currency: o.currency,
    _reference: o.kokoOrderId,
    _orderId: o.kokoOrderId,
    _pluginName: cfg.pluginName,
    _pluginVersion: cfg.pluginVersion,
    _description: o.description,
    _firstName: first,
    _lastName: last,
    _email: o.email,
  };
  const dataString = buildCreateDataString(base);
  return {
    action: `${cfg.baseUrl}/api/merchants/orderCreate`,
    fields: { ...base, ...(o.mobile ? { _mobileNo: o.mobile } : {}), dataString, signature: signData(dataString, cfg.privateKey) },
  };
}

/* ------------------------------------------------------------------ orderView */

export type KokoRemoteStatus = "PENDING" | "SUCCESS" | "FAILED";

export interface KokoStatusResult {
  orderId: string;
  trnId: string;
  status: KokoRemoteStatus;
  desc: string;
  raw: Record<string, string>;
}

function parseBody(text: string, contentType: string): Record<string, string> | null {
  const trimmed = text.trim();
  if (contentType.includes("json") || trimmed.startsWith("{")) {
    try {
      const v: unknown = JSON.parse(trimmed);
      if (!v || typeof v !== "object" || Array.isArray(v)) return null;
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, x == null ? "" : String(x)]));
    } catch {
      return null;
    }
  }
  const params = new URLSearchParams(trimmed);
  return params.has("orderId") || params.has("status") ? Object.fromEntries(params.entries()) : null;
}

/**
 * Asks Koko for the state of one payment attempt. Returns null when the answer is unusable (network error, unexpected
 * shape, or a signature that does not verify); callers must then leave the attempt as it is.
 */
export async function getKokoOrderStatus(kokoOrderId: string, cfg: KokoConfig | null, fetchImpl: typeof fetch = fetch): Promise<KokoStatusResult | null> {
  if (!cfg) return null;
  const fields = { _mId: cfg.merchantId, api_key: cfg.apiKey, _orderId: kokoOrderId, _pluginName: cfg.pluginName, _pluginVersion: cfg.pluginVersion };
  const body = new URLSearchParams({ ...fields, signature: signData(buildOrderViewDataString(fields), cfg.privateKey) });
  let text = "";
  let contentType = "";
  try {
    const res = await fetchImpl(`${cfg.baseUrl}/api/merchants/orderView`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: body.toString(),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    text = await res.text();
    contentType = res.headers.get("content-type") ?? "";
    if (!res.ok) {
      console.error("[koko] orderView HTTP", res.status, text.slice(0, 500));
      return null;
    }
  } catch (e) {
    console.error("[koko] orderView request failed", e instanceof Error ? e.message : "unknown");
    return null;
  }
  const parsed = parseBody(text, contentType);
  const status = parsed?.status?.toUpperCase();
  if (!parsed || !parsed.orderId || !status || !["PENDING", "SUCCESS", "FAILED", "FAILURE"].includes(status)) {
    console.error("[koko] orderView unexpected response", contentType, text.slice(0, 500));
    return null;
  }
  if (!verifyKokoCallback({ orderId: parsed.orderId, trnId: parsed.trnId ?? "", status: parsed.status, desc: parsed.desc, signature: parsed.signature ?? "" }, cfg.publicKey)) {
    console.error("[koko] orderView signature did not verify for", kokoOrderId);
    return null;
  }
  if (parsed.orderId !== kokoOrderId) return null;
  return { orderId: parsed.orderId, trnId: parsed.trnId ?? "", status: status === "FAILURE" ? "FAILED" : (status as KokoRemoteStatus), desc: parsed.desc ?? "", raw: parsed };
}
