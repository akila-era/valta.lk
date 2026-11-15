import "server-only";
import { isIP } from "node:net";
import { clientIp } from "@/lib/security/rate-limit";

/**
 * The address the Agent keys its per-address limits on. `clientIp()` already returns "unknown" for anything that is not exactly one plain
 * address (and warns, at most once a minute per reason, without printing the value). Such a request can only arrive when the reverse proxy
 * was bypassed or is misconfigured. It gets ONE reserved documentation address (RFC 5737 TEST-NET-1, never a real visitor), so that:
 *  - it is a visible, separate bucket at the Agent (not the all-zero address that other callers could also produce by accident),
 *  - it cannot share a bucket with any real visitor,
 *  - it is still served (local development has no proxy), but under the strictest shared limits.
 */
export const UNIDENTIFIED_CLIENT_ADDRESS = "192.0.2.1";

/** Calls `clientIp()` exactly once. */
export function agentClientAddress(req: Request): string {
  const raw = clientIp(req);
  return isIP(raw) !== 0 ? raw : UNIDENTIFIED_CLIENT_ADDRESS;
}
