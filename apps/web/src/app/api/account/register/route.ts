import { AccountError, createSession, register } from "@/lib/auth/accounts";
import { accountRequest, serverError, setSessionCookie } from "@/lib/auth/route-helpers";
import { errorResponse, json } from "@/lib/security/api";
import { registerSchema } from "@/lib/validation/account";

export const dynamic = "force-dynamic";

// Generous per-IP limit: many Sri Lankan mobile users share one carrier IP.
export async function POST(req: Request) {
  const r = await accountRequest(req, registerSchema, { name: "account-register", limit: 20, windowMs: 10 * 60_000 });
  if (!r.ok) return r.response;
  try {
    const customer = await register(r.db, r.data);
    const s = await createSession(r.db, customer.id);
    return setSessionCookie(json({ customer: { name: customer.name, email: customer.email } }, 201), s.token, s.expiresAt);
  } catch (e) {
    if (e instanceof AccountError && e.code === "EMAIL_TAKEN") {
      return errorResponse(409, "EMAIL_TAKEN", "An account with this email already exists. Try signing in instead.", { fields: { email: "This email is already registered" } });
    }
    return serverError();
  }
}
