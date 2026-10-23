import "server-only";
import type { NextResponse } from "next/server";
import type { z } from "zod";
import { errorResponse, guard, readJson } from "../security/api";
import { getDb } from "../db";
import { SESSION_COOKIE, sessionCookieOptions } from "./session";
import type { PrismaClient } from "@/generated/prisma/client";

type Parsed<S extends z.ZodType> = { ok: true; data: z.infer<S>; db: PrismaClient } | { ok: false; response: NextResponse };

/** Shared preamble for account POST routes: origin check, rate limit, DB availability, JSON + Zod validation. */
export async function accountRequest<S extends z.ZodType>(
  req: Request,
  schema: S,
  limit: { name: string; limit: number; windowMs: number },
): Promise<Parsed<S>> {
  const blocked = guard(req, { ...limit, mutating: true });
  if (blocked) return { ok: false, response: blocked };
  const db = getDb();
  if (!db) return { ok: false, response: errorResponse(503, "ACCOUNTS_UNAVAILABLE", "Customer accounts are not available right now.") };
  let body: unknown;
  try {
    body = await readJson(req);
  } catch {
    return { ok: false, response: errorResponse(400, "INVALID_JSON", "Invalid request body.") };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) fields[issue.path.join(".")] ??= issue.message;
    return { ok: false, response: errorResponse(422, "VALIDATION_FAILED", "Please correct the highlighted fields.", { fields }) };
  }
  return { ok: true, data: parsed.data, db };
}

export function setSessionCookie(res: NextResponse, token: string, expires: Date) {
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expires));
  return res;
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(new Date(0)), maxAge: 0 });
  return res;
}

export const serverError = () => errorResponse(500, "INTERNAL", "Something went wrong. Please try again.");
