import { cookies } from "next/headers";
import { destroySession } from "@/lib/auth/accounts";
import { clearSessionCookie } from "@/lib/auth/route-helpers";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { guard, json } from "@/lib/security/api";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const blocked = guard(req, { name: "account-logout", limit: 30, windowMs: 60_000, mutating: true });
  if (blocked) return blocked;
  const db = getDb();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (db) await destroySession(db, token).catch(() => undefined);
  return clearSessionCookie(json({ ok: true }));
}
