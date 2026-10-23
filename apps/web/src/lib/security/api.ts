import "server-only";
import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "./rate-limit";

export function json(data: unknown, status = 200, headers?: Record<string, string>) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

export function errorResponse(status: number, code: string, message: string, extra?: Record<string, unknown>) {
  return json({ error: { code, message, ...extra } }, status);
}

/** CSRF defence for state-changing routes: browsers always send Origin on cross-site POST/DELETE. */
export function checkOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === (req.headers.get("x-forwarded-host") ?? req.headers.get("host"));
  } catch {
    return false;
  }
}

/** Returns an error response when the request should be rejected, otherwise null. */
export function guard(req: Request, opts: { name: string; limit: number; windowMs: number; mutating?: boolean }) {
  if (opts.mutating && !checkOrigin(req)) return errorResponse(403, "FORBIDDEN_ORIGIN", "Request blocked.");
  const rl = rateLimit(`${opts.name}:${clientIp(req)}`, opts.limit, opts.windowMs);
  if (!rl.ok) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "Too many requests. Please wait a moment and try again." } },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec), "Cache-Control": "no-store" } },
    );
  }
  return null;
}

export async function readJson(req: Request, maxBytes = 20_000): Promise<unknown> {
  const text = await req.text();
  if (text.length > maxBytes) throw new Error("too large");
  return JSON.parse(text);
}
