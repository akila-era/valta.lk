import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { getDb } from "../db";
import { getErpEnv, type ErpEnv } from "../env";

/**
 * Which ERP this website talks to: the connection saved in the admin (encrypted in the website database) wins over
 * the HX_API_BASE / HX_STORE_CREDENTIAL environment variables. The credential is never returned to a browser.
 */
const TTL_MS = 10_000;
const g = globalThis as unknown as { __erpConn?: { at: number; env: ErpEnv | null } };

export const encryptionConfigured = () => (process.env.SETTINGS_ENCRYPTION_KEY ?? "").length >= 32;
const key = () => createHash("sha256").update(process.env.SETTINGS_ENCRYPTION_KEY ?? "").digest();

export function encryptSecret(plain: string): string {
  if (!encryptionConfigured()) throw new Error("SETTINGS_ENCRYPTION_KEY is not set");
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
}

export function decryptSecret(blob: string): string | null {
  try {
    const [iv, tag, enc] = blob.split(".").map((p) => Buffer.from(p, "base64"));
    const d = createDecipheriv("aes-256-gcm", key(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** Accepts "192.168.1.10:3001", "http://host:3001" or a full store-api URL; returns the store-api base, or an error. */
export function normalizeErpBase(input: string): { ok: true; base: string } | { ok: false; error: string } {
  let raw = input.trim();
  if (!raw || raw.length > 300) return { ok: false, error: "Enter the ERP address." };
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) && !/^https?:\/\//i.test(raw)) return { ok: false, error: "Use an http:// or https:// address." };
  if (!/^https?:\/\//i.test(raw)) raw = `http://${raw}`;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, error: "That address is not valid." };
  }
  if (u.username || u.password || u.search || u.hash) return { ok: false, error: "Give the address only, without a login, query or #." };
  if (!/^[a-z0-9.-]+$|^\[[0-9a-f:]+\]$/i.test(u.hostname)) return { ok: false, error: "That host name is not valid." };
  if (/^(169\.254\.|0\.0\.0\.0)/.test(u.hostname) || u.hostname === "metadata.google.internal") return { ok: false, error: "That address is not allowed." };
  const path = u.pathname.replace(/\/+$/, "");
  const full = path === "" ? "/api/v1/store-api" : path;
  return { ok: true, base: `${u.protocol}//${u.host}${full}` };
}

export const CREDENTIAL_RE = /^hxs_[^.\s]+\.\S+$/;

async function loadStored(): Promise<ErpEnv | null> {
  const db = getDb();
  if (!db || !encryptionConfigured()) return null;
  try {
    const row = await db.erpConnectionConfig.findUnique({ where: { id: "default" } });
    const cred = row ? decryptSecret(row.credentialEnc) : null;
    return row && cred ? { HX_API_BASE: row.baseUrl, HX_STORE_CREDENTIAL: cred } : null;
  } catch {
    return g.__erpConn?.env ?? null; // database hiccup: keep the last good connection
  }
}

/** Active ERP settings (admin-saved connection first, environment second), cached for a few seconds. */
export async function getActiveErpEnv(): Promise<ErpEnv | null> {
  if (!getDb() || !encryptionConfigured()) return getErpEnv(); // nothing can be saved, so the environment is the only source (no cache needed)
  const c = g.__erpConn;
  if (c && Date.now() - c.at < TTL_MS) return c.env;
  const env = (await loadStored()) ?? getErpEnv();
  g.__erpConn = { at: Date.now(), env };
  return env;
}

export function invalidateErpConnection() {
  g.__erpConn = undefined;
}

export async function connectionSource(): Promise<"admin" | "environment" | "none"> {
  const db = getDb();
  if (db && encryptionConfigured()) {
    const row = await db.erpConnectionConfig.findUnique({ where: { id: "default" }, select: { id: true } }).catch(() => null);
    if (row) return "admin";
  }
  return getErpEnv() ? "environment" : "none";
}

export interface ProbeResult { ok: boolean; message: string; shop?: { currency: string; ordersEnabled: boolean; cod: boolean } }

/** Tries the ERP with the given address and credential (ping, then settings). Redirects are never followed. */
export async function probeErp(base: string, credential: string): Promise<ProbeResult> {
  const call = async (path: string) => {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 6000);
    try {
      return await fetch(base + path, { headers: { Accept: "application/json", Authorization: `Bearer ${credential}` }, redirect: "error", cache: "no-store", signal: ctl.signal });
    } finally {
      clearTimeout(t);
    }
  };
  try {
    const ping = await call("/ping");
    if (ping.status === 401) return { ok: false, message: "The ERP rejected this credential. Check that it is complete and still active." };
    if (ping.status === 403) return { ok: false, message: "The ERP says e-commerce is not active for this shop. Ask the shop owner or HEXALYTE to enable it." };
    if (!ping.ok) return { ok: false, message: `The ERP answered with an error (${ping.status}). Check the address.` };
    const s = await call("/settings");
    const j = (await s.json().catch(() => null)) as { data?: { currency?: string; ordersEnabled?: boolean; paymentMethods?: { COD?: boolean } } } | null;
    if (!s.ok || !j?.data) return { ok: false, message: "The ERP answered, but not like a HEXALYTE store API. Check the address." };
    return { ok: true, message: "Connected.", shop: { currency: String(j.data.currency ?? ""), ordersEnabled: Boolean(j.data.ordersEnabled), cod: Boolean(j.data.paymentMethods?.COD) } };
  } catch {
    return { ok: false, message: "Could not reach the ERP at that address. Check the IP/host, port and that the ERP is running." };
  }
}
