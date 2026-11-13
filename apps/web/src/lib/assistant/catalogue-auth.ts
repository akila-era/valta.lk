import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifies a request from the AI Agent to the read-only catalogue endpoints (the opposite direction to sign.ts, with its OWN key
 * id and secret). The format is the Agent's: the signature covers the timestamp, a one-time nonce, the method, the path with its
 * query, the identity, the client IP and a hash of the body. Every failure is reported the same way (the caller answers 404), so
 * the endpoint cannot be told apart from one that does not exist.
 */
export interface CatalogueAuthConfig {
  keyId: string;
  secret: string;
}

const SKEW_SEC = 60;
const NONCE_TTL_MS = 120_000;
const MAX_NONCES = 5_000;
const g = globalThis as unknown as { __voltaCatalogueNonces?: Map<string, number> };
const nonces = (g.__voltaCatalogueNonces ??= new Map());

/** Off (null) unless explicitly enabled and a key of at least 32 characters is set. */
export function readCatalogueAuthConfig(env: NodeJS.ProcessEnv = process.env): CatalogueAuthConfig | null {
  if (env.AI_CATALOGUE_ENABLED !== "true") return null;
  const keyId = env.AI_CATALOGUE_KEY_ID?.trim() ?? "";
  const secret = env.AI_CATALOGUE_SECRET?.trim() ?? "";
  if (!/^[A-Za-z0-9_-]{1,16}$/.test(keyId) || secret.length < 32) return null;
  return { keyId, secret };
}

const safeEqualHex = (a: string, b: string): boolean => {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
};

export function verifyCatalogueRequest(
  req: { method: string; pathWithQuery: string; headers: Headers },
  cfg: CatalogueAuthConfig,
  nowMs: number = Date.now(),
): boolean {
  const h = (n: string) => req.headers.get(n) ?? "";
  const keyId = h("x-volta-key-id");
  const timestamp = h("x-volta-timestamp");
  const nonce = h("x-volta-nonce");
  const identity = h("x-volta-identity");
  const clientIp = h("x-volta-client-ip");
  const signature = h("x-volta-signature");
  if (!keyId || !timestamp || !nonce || !identity || !clientIp || !signature) return false;
  if (!safeEqualHex(keyId, cfg.keyId)) return false;
  // Catalogue data is public: only the anonymous identity is accepted here, so no customer identity can ride on this key.
  if (identity !== "anon") return false;
  if (!/^[a-f0-9]{16,64}$/.test(nonce) || !/^\d{9,12}$/.test(timestamp)) return false;
  if (Math.abs(Math.floor(nowMs / 1000) - Number(timestamp)) > SKEW_SEC) return false;
  const bodySha = createHash("sha256").update("").digest("hex");
  const canonical = [timestamp, nonce, req.method.toUpperCase(), req.pathWithQuery, identity, clientIp, bodySha].join("\n");
  const expected = createHmac("sha256", cfg.secret).update(canonical).digest("hex");
  if (!safeEqualHex(expected, signature)) return false;
  // Replay protection runs only after the signature checked out, so unsigned traffic cannot fill the cache.
  if (nonces.size >= MAX_NONCES) for (const [k, exp] of nonces) if (exp <= nowMs) nonces.delete(k);
  if (nonces.size >= MAX_NONCES) return false;
  const seen = nonces.get(nonce);
  if (seen !== undefined && seen > nowMs) return false;
  nonces.set(nonce, nowMs + NONCE_TTL_MS);
  return true;
}

/** Test helper: forget remembered nonces. */
export function resetCatalogueNonces(): void {
  nonces.clear();
}
