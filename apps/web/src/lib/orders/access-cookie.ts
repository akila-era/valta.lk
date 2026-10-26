import "server-only";
import { cookies } from "next/headers";

/**
 * Remembers, in the placing browser only, a random token per recent order. The server stores just its hash, so the
 * cookie is what lets that browser (and nobody who merely knows the order reference) see the delivery details.
 */
const NAME = "volta_orders";
const MAX = 6;
const DAYS = 14;

interface Entry {
  r: string; // order reference
  t: string; // access token
}

function parse(raw: string | undefined): Entry[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((e): e is Entry => typeof e?.r === "string" && typeof e?.t === "string").slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export async function accessTokensFor(ref: string): Promise<string[]> {
  return parse((await cookies()).get(NAME)?.value)
    .filter((e) => e.r === ref)
    .map((e) => e.t);
}

/** Cookie value + options to attach to a response (Route Handlers can set cookies on the returned response). */
export async function withOrderAccess(ref: string, token: string) {
  const prev = parse((await cookies()).get(NAME)?.value).filter((e) => e.r !== ref);
  const next = [{ r: ref, t: token }, ...prev].slice(0, MAX);
  return {
    name: NAME,
    value: JSON.stringify(next),
    options: {
      httpOnly: true,
      secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === "true" : process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
      maxAge: DAYS * 24 * 60 * 60,
    },
  };
}
