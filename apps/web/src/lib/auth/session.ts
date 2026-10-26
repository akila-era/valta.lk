import "server-only";
import { cookies } from "next/headers";
import { getDb } from "../db";
import { customerForSession, type PublicCustomer } from "./accounts";

export const SESSION_COOKIE = "volta_session";

export function sessionCookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === "true" : process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires,
  };
}

/** The signed-in customer for this request, or null (also null when accounts are not configured or the DB is down). */
export async function getCurrentCustomer(): Promise<PublicCustomer | null> {
  const db = getDb();
  if (!db) return null;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    return await customerForSession(db, token);
  } catch {
    return null;
  }
}

export const accountsEnabled = () => Boolean(process.env.DATABASE_URL?.trim());
