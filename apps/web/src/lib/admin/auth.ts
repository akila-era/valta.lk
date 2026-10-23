import "server-only";
import { getCurrentCustomer } from "../auth/session";
import type { PublicCustomer } from "../auth/accounts";

/** Store staff who may open /admin: customer accounts whose email is listed in ADMIN_EMAILS (comma separated). */
export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export const isAdminEmail = (email: string) => adminEmails().includes(email.trim().toLowerCase());

export type AdminAccess = { kind: "ok"; admin: PublicCustomer } | { kind: "signed-out" } | { kind: "forbidden" };

/** Server-side authorisation check used by every admin page and API route. */
export async function requireAdmin(): Promise<AdminAccess> {
  const c = await getCurrentCustomer();
  if (!c) return { kind: "signed-out" };
  return isAdminEmail(c.email) ? { kind: "ok", admin: c } : { kind: "forbidden" };
}
