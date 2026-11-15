import type { IncomingMessage } from "node:http";
import { ReplayCache, verifyRequest } from "../auth/hmac";
import { ApiError } from "../errors";

/**
 * Pre-authentication limits for every Agent route (the same approach as the voice routes, VO-02). The HMAC covers the body hash, so the
 * body has to be read before the signature can be fully checked. These limits bound what an UNAUTHENTICATED caller can make the server hold:
 *  1. the headers are checked first (known key id, fresh timestamp, well-formed nonce, identity, address, signature present): a request
 *     that fails any of them never has its body read at all;
 *  2. only a few bodies may be read at the same time (`BodyBudget`), the rest are refused with 503 at once;
 *  3. the whole body must arrive within BODY_DEADLINE_MS and no pause between chunks may exceed BODY_IDLE_MS (408, connection dropped);
 *  4. the slot is released on every path.
 * What this cannot do: a caller who knows a valid key id and sends well-formed headers can still occupy the few slots for up to the
 * deadline. That is bounded (a few slots, seconds) and the Agent only listens on loopback behind the website's tunnel.
 */
export const BODY_DEADLINE_MS = 10_000;
export const BODY_IDLE_MS = 3_000;
export const DEFAULT_PRE_AUTH_SLOTS = 8;

export class BodyBudget {
  private active = 0;
  constructor(readonly limit: number) {}
  tryAcquire(): (() => void) | null {
    if (this.active >= this.limit) return null;
    this.active++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active--;
    };
  }
  inUse(): number {
    return this.active;
  }
}

export type PreAuth = { ok: true } | { ok: false; reason: string };

/**
 * Everything verifyRequest checks before the signature (headers present and well formed, known key id, clock), run on the headers
 * alone. With an empty body a well-formed request can only fail at the signature step, so BAD_SIGNATURE here means "worth reading".
 */
export function preAuthenticate(req: IncomingMessage, route: string, keys: ReadonlyMap<string, string>, nowMs: number): PreAuth {
  const verdict = verifyRequest({
    header: (name) => {
      const v = req.headers[name];
      return Array.isArray(v) ? v[0] : v;
    },
    method: req.method ?? "",
    path: route,
    body: Buffer.alloc(0),
    keys,
    nowMs,
    replay: new ReplayCache(), // a throw-away cache: the real nonce is only consumed after the full signature check
  });
  if (verdict.ok || verdict.reason === "BAD_SIGNATURE") return { ok: true };
  return { ok: false, reason: verdict.reason };
}

/** Reads the body with a size cap, an overall deadline and an idle deadline. Rejects with ApiError (PAYLOAD_TOO_LARGE or REQUEST_TIMEOUT). */
export function readBodyGuarded(req: IncomingMessage, maxBytes: number, deadlineMs = BODY_DEADLINE_MS, idleMs = BODY_IDLE_MS): Promise<Buffer> {
  const declared = Number(req.headers["content-length"]);
  if (Number.isFinite(declared) && declared > maxBytes) {
    req.resume(); // discard the incoming body as it arrives (never buffered) so the client can still read the 413
    return Promise.reject(new ApiError("PAYLOAD_TOO_LARGE", "Request body is too large."));
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    let idle: ReturnType<typeof setTimeout> | undefined;
    const settle = (outcome: () => void, keep = false): void => {
      if (settled) return;
      settled = true;
      clearTimeout(overall);
      if (idle) clearTimeout(idle);
      if (!keep) chunks.length = 0; // drop whatever was buffered at once on any failure
      outcome();
    };
    const slow = (): void => settle(() => reject(new ApiError("REQUEST_TIMEOUT", "The request body was too slow.")));
    const overall = setTimeout(slow, deadlineMs);
    const armIdle = (): void => {
      if (idle) clearTimeout(idle);
      idle = setTimeout(slow, idleMs);
    };
    armIdle();
    req.on("data", (c: Buffer) => {
      if (settled) return;
      size += c.length;
      if (size > maxBytes) {
        settle(() => reject(new ApiError("PAYLOAD_TOO_LARGE", "Request body is too large.")));
        return;
      }
      chunks.push(c);
      armIdle();
    });
    req.on("end", () => settle(() => resolve(Buffer.concat(chunks)), true));
    req.on("error", (e) => settle(() => reject(e)));
    req.on("close", () => settle(() => reject(new Error("closed"))));
  });
}
