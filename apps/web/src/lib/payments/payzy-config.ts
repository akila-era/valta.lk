import "server-only";
import { getDb } from "../db";
import { decryptSecret, encryptionConfigured } from "../erp/connection";
import { assertPayzyKey, tryGetPayzyConfig, type PayzyConfig } from "./payzy";

/**
 * Which Payzy account this website uses: the settings saved in the admin (secret encrypted in the website database)
 * win over the PAYZY_* environment variables. The secret is never returned to a browser.
 */
const TTL_MS = 10_000;
const g = globalThis as unknown as { __payzyConn?: { at: number; cfg: PayzyConfig | null; enabled: boolean } };

/** Payzy only talks to its own hosts; this also stops the admin form being used to make the server call arbitrary URLs. */
export const PAYZY_ENVIRONMENTS = {
  SANDBOX: "https://api.payzypay.xyz",
  PROD: "https://api.payzy.lk",
} as const;
export type PayzyEnvironment = keyof typeof PAYZY_ENVIRONMENTS;
export const payzyEnvironmentOf = (baseUrl: string): PayzyEnvironment | null => (Object.entries(PAYZY_ENVIRONMENTS).find(([, u]) => u === baseUrl.replace(/\/+$/, ""))?.[0] as PayzyEnvironment | undefined) ?? null;

async function loadStored(): Promise<{ cfg: PayzyConfig; enabled: boolean } | null> {
  const db = getDb();
  if (!db || !encryptionConfigured()) return null;
  const row = await db.payzyConnectionConfig.findUnique({ where: { id: "default" } });
  if (!row) return null;
  const secretKey = decryptSecret(row.secretKeyEnc);
  if (!secretKey) return null;
  try {
    assertPayzyKey(secretKey);
  } catch {
    return null;
  }
  return { enabled: row.enabled, cfg: { baseUrl: row.baseUrl, shopId: row.shopId, secretKey, testMode: row.testMode, appUrl: row.appUrl.replace(/\/+$/, ""), legacyVersionSigning: row.legacyVersionSigning } };
}

/** Active configuration. `enabled` is the admin switch (always true for environment config). Returns keep verifying while disabled. */
export async function getActivePayzy(): Promise<{ cfg: PayzyConfig | null; enabled: boolean }> {
  const c = g.__payzyConn;
  if (c && Date.now() - c.at < TTL_MS) return c;
  let stored: Awaited<ReturnType<typeof loadStored>> = null;
  try {
    stored = await loadStored();
  } catch {
    if (c) return c; // database hiccup: keep the last good configuration
  }
  const env = tryGetPayzyConfig();
  const next = { at: Date.now(), cfg: stored?.cfg ?? env, enabled: stored ? stored.enabled : Boolean(env) };
  g.__payzyConn = next;
  return next;
}

export const getActivePayzyConfig = async () => (await getActivePayzy()).cfg;

/** True when checkout may offer Payzy: credentials exist and the admin switch is on. */
export async function isPayzyOffered(): Promise<boolean> {
  const p = await getActivePayzy();
  return Boolean(p.cfg) && p.enabled;
}

export const invalidatePayzyConfig = () => {
  g.__payzyConn = undefined;
};

export async function payzySource(): Promise<"admin" | "environment" | "none"> {
  const db = getDb();
  if (db && encryptionConfigured()) {
    const row = await db.payzyConnectionConfig.findUnique({ where: { id: "default" }, select: { id: true } }).catch(() => null);
    if (row) return "admin";
  }
  return tryGetPayzyConfig() ? "environment" : "none";
}
