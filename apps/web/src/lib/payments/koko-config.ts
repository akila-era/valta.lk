import "server-only";
import { createPrivateKey, createPublicKey } from "node:crypto";
import { getDb } from "../db";
import { decryptSecret, encryptionConfigured } from "../erp/connection";
import { getKokoConfig, normalizePem, type KokoConfig } from "./koko";

/**
 * Which Koko account this website uses: the credentials saved in the admin (secrets encrypted in the website database)
 * win over the KOKO_* environment variables. Secrets are never returned to a browser.
 */
const TTL_MS = 10_000;
const g = globalThis as unknown as { __kokoConn?: { at: number; cfg: KokoConfig | null; enabled: boolean } };

/** Koko only talks to its own hosts; restricting them also stops the admin form being used to make the server call arbitrary URLs. */
export const KOKO_ENVIRONMENTS = {
  QA: "https://qaapi.paykoko.com",
  PROD: "https://prodapi.paykoko.com",
} as const;
export type KokoEnvironment = keyof typeof KOKO_ENVIRONMENTS;
export const environmentOf = (baseUrl: string): KokoEnvironment | null => (Object.entries(KOKO_ENVIRONMENTS).find(([, u]) => u === baseUrl.replace(/\/+$/, ""))?.[0] as KokoEnvironment | undefined) ?? null;

async function loadStored(): Promise<{ cfg: KokoConfig; enabled: boolean } | null> {
  const db = getDb();
  if (!db || !encryptionConfigured()) return null;
  const row = await db.kokoConnectionConfig.findUnique({ where: { id: "default" } });
  if (!row) return null;
  const apiKey = decryptSecret(row.apiKeyEnc);
  const privateKey = decryptSecret(row.privateKeyEnc);
  if (!apiKey || !privateKey) return null;
  return {
    enabled: row.enabled,
    cfg: { baseUrl: row.baseUrl, merchantId: row.merchantId, apiKey, pluginName: row.pluginName, pluginVersion: row.pluginVersion, privateKey, publicKey: row.publicKey, appUrl: row.appUrl.replace(/\/+$/, "") },
  };
}

/**
 * Active Koko configuration. `enabled` is the admin switch (always true for environment config).
 * Callbacks and status checks use the config even when disabled, so a payment already started can still complete.
 */
export async function getActiveKoko(): Promise<{ cfg: KokoConfig | null; enabled: boolean }> {
  const c = g.__kokoConn;
  if (c && Date.now() - c.at < TTL_MS) return c;
  let stored: Awaited<ReturnType<typeof loadStored>> = null;
  try {
    stored = await loadStored();
  } catch {
    if (c) return c; // database hiccup: keep the last good configuration
  }
  const env = getKokoConfig();
  const next = { at: Date.now(), cfg: stored?.cfg ?? env, enabled: stored ? stored.enabled : Boolean(env) };
  g.__kokoConn = next;
  return next;
}

export const getActiveKokoConfig = async () => (await getActiveKoko()).cfg;

/** True when checkout may offer Koko: credentials exist and the admin switch is on. */
export async function isKokoOffered(): Promise<boolean> {
  const k = await getActiveKoko();
  return Boolean(k.cfg) && k.enabled;
}

export const invalidateKokoConfig = () => {
  g.__kokoConn = undefined;
};

export async function kokoSource(): Promise<"admin" | "environment" | "none"> {
  const db = getDb();
  if (db && encryptionConfigured()) {
    const row = await db.kokoConnectionConfig.findUnique({ where: { id: "default" }, select: { id: true } }).catch(() => null);
    if (row) return "admin";
  }
  return getKokoConfig() ? "environment" : "none";
}

/** Checks that pasted keys are real PEM keys of the right kind and that the private key can sign. Returns an error message or null. */
export function checkKeyPair(privatePem: string, publicPem: string): string | null {
  try {
    const priv = createPrivateKey(normalizePem(privatePem));
    if (priv.asymmetricKeyType !== "rsa") return "The merchant private key must be an RSA key.";
  } catch {
    return "The merchant private key is not a valid PEM key.";
  }
  try {
    const pub = createPublicKey(normalizePem(publicPem));
    if (pub.asymmetricKeyType !== "rsa") return "Koko's public key must be an RSA key.";
  } catch {
    return "Koko's public key is not a valid PEM key.";
  }
  return null;
}
