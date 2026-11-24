import { cookies } from "next/headers";
import { destroySession } from "@/lib/auth/accounts";
import { clearAdminSessionCookie } from "@/lib/auth/route-helpers";
import { ADMIN_SESSION_COOKIE } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { guard, json } from "@/lib/security/api";

export const dynamic = "force-dynamic";

/** Signs out of the admin only; a customer signed in on the shop in the same browser stays signed in. */
export async function POST(req: Request) {
  const blocked = guard(req, { name: "account-logout", limit: 30, windowMs: 60_000, mutating: true });
  if (blocked) return blocked;
  const db = getDb();
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  if (db) await destroySession(db, token).catch(() => undefined);
  return clearAdminSessionCookie(json({ ok: true }));
}
