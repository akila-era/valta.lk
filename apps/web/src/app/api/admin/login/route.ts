import { isAdminEmail } from "@/lib/admin/auth";
import { AccountError, createSession, LOCK_MINUTES, login } from "@/lib/auth/accounts";
import { accountRequest, serverError, setSessionCookie } from "@/lib/auth/route-helpers";
import { errorResponse, json } from "@/lib/security/api";
import { loginSchema } from "@/lib/validation/account";

export const dynamic = "force-dynamic";

/** Staff sign-in. Same credential check as customers, but only emails listed in ADMIN_EMAILS get a session here. */
export async function POST(req: Request) {
  const r = await accountRequest(req, loginSchema, { name: "admin-login", limit: 10, windowMs: 5 * 60_000 });
  if (!r.ok) return r.response;
  // Same error for "not staff" and "wrong password", so this cannot be used to discover who is staff.
  const denied = () => errorResponse(401, "INVALID_CREDENTIALS", "Email or password is incorrect, or this account is not store staff.");
  if (!isAdminEmail(r.data.email)) return denied();
  try {
    const customer = await login(r.db, r.data.email, r.data.password);
    const s = await createSession(r.db, customer.id);
    return setSessionCookie(json({ customer: { name: customer.name, email: customer.email } }), s.token, s.expiresAt);
  } catch (e) {
    if (e instanceof AccountError && e.code === "LOCKED") {
      return errorResponse(429, "LOCKED", `Too many failed attempts. Please try again in ${LOCK_MINUTES} minutes.`);
    }
    if (e instanceof AccountError) return denied();
    return serverError();
  }
}
