import { AccountError, createSession, LOCK_MINUTES, login } from "@/lib/auth/accounts";
import { accountRequest, serverError, setSessionCookie } from "@/lib/auth/route-helpers";
import { errorResponse, json } from "@/lib/security/api";
import { loginSchema } from "@/lib/validation/account";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const r = await accountRequest(req, loginSchema, { name: "account-login", limit: 10, windowMs: 5 * 60_000 });
  if (!r.ok) return r.response;
  try {
    const customer = await login(r.db, r.data.email, r.data.password);
    const s = await createSession(r.db, customer.id);
    return setSessionCookie(json({ customer: { name: customer.name, email: customer.email } }), s.token, s.expiresAt);
  } catch (e) {
    if (e instanceof AccountError && e.code === "LOCKED") {
      return errorResponse(429, "LOCKED", `Too many failed attempts. Please try again in ${LOCK_MINUTES} minutes or reset your password.`);
    }
    if (e instanceof AccountError) return errorResponse(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
    return serverError();
  }
}
