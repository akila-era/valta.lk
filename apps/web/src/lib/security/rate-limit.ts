import "server-only";
import { isIP } from "node:net";

interface Bucket {
  count: number;
  resetAt: number;
}

const g = globalThis as unknown as { __voltaRate?: Map<string, Bucket> };
const buckets = (g.__voltaRate ??= new Map());

/**
 * Fixed-window in-memory limiter. Adequate for a single instance; use a shared store (e.g. Redis)
 * if the site is deployed across multiple instances.
 */
export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  if (buckets.size > 5000) for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }
  b.count++;
  return b.count <= limit ? { ok: true, retryAfterSec: 0 } : { ok: false, retryAfterSec: Math.ceil((b.resetAt - now) / 1000) };
}

const MAX_ADDR_LEN = 45; // longest textual IPv6 (with an embedded IPv4 tail)
const warned = new Map<string, number>();

/** Flag (not silently swallow) an address we could not use; at most one line per reason per minute so it cannot flood the log. */
function flag(reason: string): void {
  const now = Date.now();
  if ((warned.get(reason) ?? 0) > now) return;
  warned.set(reason, now + 60_000);
  console.warn(`[client-ip] unusable client address (${reason}); using the shared "unknown" bucket`);
}

/** Expand a valid IPv6 text form to eight 16-bit groups, or null. Handles "::" and a dotted IPv4 tail. */
function groups6(ip: string): number[] | null {
  let s = ip;
  const tail = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(s);
  if (tail) {
    const [a, b, c, d] = [1, 2, 3, 4].map((i) => Number(tail[i]));
    s = s.slice(0, tail.index) + ((a << 8) | b).toString(16) + ":" + ((c << 8) | d).toString(16);
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = 8 - head.length - rest.length;
  if ((halves.length === 1 && fill !== 0) || fill < 0) return null;
  const all = [...head, ...Array<string>(halves.length === 2 ? fill : 0).fill("0"), ...rest].map((h) => parseInt(h, 16));
  return all.length === 8 && all.every((n) => Number.isInteger(n) && n >= 0 && n <= 0xffff) ? all : null;
}

/**
 * One canonical key per CLIENT, or null when the text is not a single plain IP address.
 *  - IPv4 stays as is. IPv4-mapped IPv6 (::ffff:a.b.c.d) becomes that IPv4.
 *  - Any other IPv6 becomes its /64 network address ("2001:db8:1:2::"): a visitor owns a whole /64 and can rotate through 2^64
 *    addresses without spoofing anything, so a per-/128 key would be no limit at all.
 * The result is itself a valid IP text (isIP !== 0), so the same value can be signed to the Agent.
 */
export function canonicalClientKey(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v || v.length > MAX_ADDR_LEN) return null;
  const kind = isIP(v);
  if (kind === 4) return v;
  if (kind !== 6 || v.includes("%")) return null;
  const g = groups6(v);
  if (!g) return null;
  if (g.slice(0, 5).every((n) => n === 0) && g[5] === 0xffff) return `${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`;
  return `${g[0].toString(16)}:${g[1].toString(16)}:${g[2].toString(16)}:${g[3].toString(16)}::`;
}

/**
 * The client address used for rate limiting and signed to the Agent.
 * Order: x-real-ip (set by the reverse proxy from the socket, never appended), then the LAST x-forwarded-for entry (the one our own
 * proxy added; the first entry is whatever the caller sent). Only a single plain IP is accepted. Anything else is flagged and
 * returns "unknown" (callers that must sign an IP map that to 0.0.0.0).
 * This is only as trustworthy as the proxy: it assumes the app is reachable ONLY through it.
 */
export function clientIp(req: Request): string {
  const real = req.headers.get("x-real-ip");
  if (real !== null) {
    const k = canonicalClientKey(real);
    if (k) return k;
    flag("bad x-real-ip");
    return "unknown";
  }
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd !== null) {
    const k = canonicalClientKey(fwd.split(",").pop());
    if (k) return k;
    flag("bad x-forwarded-for");
    return "unknown";
  }
  flag("no proxy header");
  return "unknown";
}
