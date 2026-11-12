import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";

/**
 * Service-to-service authentication between the website backend (BFF) and this Agent.
 * The signature covers the method, path, caller identity, client IP and a hash of the body, so none of them can be altered
 * in transit. The identity is trusted ONLY because it is covered by the signature.
 */
export const HEADERS = {
  keyId: "x-volta-key-id",
  timestamp: "x-volta-timestamp",
  nonce: "x-volta-nonce",
  identity: "x-volta-identity",
  clientIp: "x-volta-client-ip",
  signature: "x-volta-signature",
} as const;

export const MAX_SKEW_SEC = 60;
export const NONCE_TTL_SEC = 120;

const KEY_ID = /^[A-Za-z0-9_-]{1,16}$/;
const NONCE = /^[0-9a-f]{32}$/;
const SIGNATURE = /^[0-9a-f]{64}$/;
const TIMESTAMP = /^\d{10}$/;
const CUSTOMER_ID = /^[A-Za-z0-9_-]{1,64}$/;

export type Identity = { kind: "guest" } | { kind: "customer"; customerId: string };

export function parseIdentity(raw: string): Identity | null {
  if (raw === "anon") return { kind: "guest" };
  if (raw.startsWith("cust:")) {
    const id = raw.slice(5);
    return CUSTOMER_ID.test(id) ? { kind: "customer", customerId: id } : null;
  }
  return null;
}

export const formatIdentity = (i: Identity): string => (i.kind === "guest" ? "anon" : `cust:${i.customerId}`);

const sha256Hex = (data: Uint8Array | string): string => createHash("sha256").update(data).digest("hex");

export function canonicalString(p: {
  timestamp: string;
  nonce: string;
  method: string;
  path: string;
  identity: string;
  clientIp: string;
  bodySha256: string;
}): string {
  return [p.timestamp, p.nonce, p.method.toUpperCase(), p.path, p.identity, p.clientIp, p.bodySha256].join("\n");
}

const hmacHex = (secret: string, canonical: string): string => createHmac("sha256", secret).update(canonical).digest("hex");

export interface SignInput {
  keyId: string;
  secret: string;
  method: string;
  path: string;
  identity: Identity;
  clientIp: string;
  body?: Uint8Array | string;
  /** Milliseconds since the epoch; defaults to now. */
  nowMs?: number;
  nonce?: string;
}

/** Used by the website side (later) and by tests. Returns the headers to send. */
export function signRequest(p: SignInput): Record<string, string> {
  const timestamp = String(Math.floor((p.nowMs ?? Date.now()) / 1000));
  const nonce = p.nonce ?? randomBytes(16).toString("hex");
  const identity = formatIdentity(p.identity);
  const canonical = canonicalString({ timestamp, nonce, method: p.method, path: p.path, identity, clientIp: p.clientIp, bodySha256: sha256Hex(p.body ?? "") });
  return {
    [HEADERS.keyId]: p.keyId,
    [HEADERS.timestamp]: timestamp,
    [HEADERS.nonce]: nonce,
    [HEADERS.identity]: identity,
    [HEADERS.clientIp]: p.clientIp,
    [HEADERS.signature]: hmacHex(p.secret, canonical),
  };
}

/** Remembers nonces of authenticated requests so a captured request cannot be replayed. Fails closed when full. */
export class ReplayCache {
  private readonly seen = new Map<string, number>();
  constructor(
    private readonly opts: { ttlSec?: number; maxEntries?: number; now?: () => number } = {},
  ) {}

  private now(): number {
    return (this.opts.now ?? Date.now)();
  }

  /** True the first time a nonce is seen. False for a repeat, or when the cache is full (fail closed). */
  check(nonce: string): boolean {
    const now = this.now();
    const max = this.opts.maxEntries ?? 20_000;
    if (this.seen.size >= max) this.prune(now);
    if (this.seen.size >= max) return false;
    const existing = this.seen.get(nonce);
    if (existing !== undefined && existing > now) return false;
    this.seen.set(nonce, now + (this.opts.ttlSec ?? NONCE_TTL_SEC) * 1000);
    return true;
  }

  private prune(now: number): void {
    for (const [k, exp] of this.seen) if (exp <= now) this.seen.delete(k);
  }

  size(): number {
    return this.seen.size;
  }
}

export type VerifyFailure = "MISSING_HEADER" | "BAD_FORMAT" | "UNKNOWN_KEY" | "STALE" | "BAD_SIGNATURE" | "REPLAY";
export type VerifyResult = { ok: true; identity: Identity; clientIp: string; keyId: string } | { ok: false; reason: VerifyFailure };

export interface VerifyInput {
  header: (name: string) => string | undefined;
  method: string;
  path: string;
  body: Uint8Array;
  keys: ReadonlyMap<string, string>;
  nowMs: number;
  replay: ReplayCache;
}

/**
 * Order matters: format, key, clock, signature and only THEN the replay cache, so an unauthenticated caller can neither
 * learn anything from the nonce nor fill the cache. Every failure becomes the same 401 for the caller; the reason is for logs.
 */
export function verifyRequest(p: VerifyInput): VerifyResult {
  const keyId = p.header(HEADERS.keyId);
  const timestamp = p.header(HEADERS.timestamp);
  const nonce = p.header(HEADERS.nonce);
  const identityRaw = p.header(HEADERS.identity);
  const clientIp = p.header(HEADERS.clientIp);
  const signature = p.header(HEADERS.signature);
  if (!keyId || !timestamp || !nonce || !identityRaw || !clientIp || !signature) return { ok: false, reason: "MISSING_HEADER" };

  const identity = parseIdentity(identityRaw);
  if (!KEY_ID.test(keyId) || !TIMESTAMP.test(timestamp) || !NONCE.test(nonce) || !SIGNATURE.test(signature) || !identity || isIP(clientIp) === 0) {
    return { ok: false, reason: "BAD_FORMAT" };
  }

  const secret = p.keys.get(keyId);
  if (secret === undefined) return { ok: false, reason: "UNKNOWN_KEY" };

  if (Math.abs(p.nowMs / 1000 - Number(timestamp)) > MAX_SKEW_SEC) return { ok: false, reason: "STALE" };

  const expected = hmacHex(
    secret,
    canonicalString({ timestamp, nonce, method: p.method, path: p.path, identity: identityRaw, clientIp, bodySha256: sha256Hex(p.body) }),
  );
  if (!timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"))) return { ok: false, reason: "BAD_SIGNATURE" };

  if (!p.replay.check(nonce)) return { ok: false, reason: "REPLAY" };
  return { ok: true, identity, clientIp, keyId };
}
