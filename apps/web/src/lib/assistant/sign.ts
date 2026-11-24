import "server-only";
import { createHash, createHmac, randomBytes } from "node:crypto";

/**
 * Signs a request to the Agent API. The signature covers the timestamp, a one-time nonce, the method, the path, the caller's
 * identity, the client IP and a hash of the body, so none of them can be changed in transit; the Agent trusts the identity and
 * the IP only because they are signed here. The format must stay identical to apps/agent/src/auth/hmac.ts (a test checks it
 * against a vector produced by that code).
 */
export type AgentIdentity = { kind: "guest" } | { kind: "customer"; customerId: string };

export const identityClaim = (i: AgentIdentity): string => (i.kind === "guest" ? "anon" : `cust:${i.customerId}`);

export function signAgentRequest(p: { keyId: string; secret: string; method: string; path: string; identity: AgentIdentity; clientIp: string; body?: string; nowMs?: number; nonce?: string }): Record<string, string> {
  const timestamp = String(Math.floor((p.nowMs ?? Date.now()) / 1000));
  const nonce = p.nonce ?? randomBytes(16).toString("hex");
  const identity = identityClaim(p.identity);
  const bodySha = createHash("sha256").update(p.body ?? "").digest("hex");
  const canonical = [timestamp, nonce, p.method.toUpperCase(), p.path, identity, p.clientIp, bodySha].join("\n");
  return {
    "x-volta-key-id": p.keyId,
    "x-volta-timestamp": timestamp,
    "x-volta-nonce": nonce,
    "x-volta-identity": identity,
    "x-volta-client-ip": p.clientIp,
    "x-volta-signature": createHmac("sha256", p.secret).update(canonical).digest("hex"),
  };
}
