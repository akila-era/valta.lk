import { AccountError, createSession, resetPassword } from "@/lib/auth/accounts";
import { accountRequest, serverError, setSessionCookie } from "@/lib/auth/route-helpers";
import { errorResponse, json } from "@/lib/security/api";
import { resetSchema } from "@/lib/validation/account";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const r = await accountRequest(req, resetSchema, { name: "account-reset", limit: 10, windowMs: 15 * 60_000 });
  if (!r.ok) return r.response;
  try {
    const customer = await resetPassword(r.db, r.data.token, r.data.password);
    const s = await createSession(r.db, customer.id);
    return setSessionCookie(json({ ok: true }), s.token, s.expiresAt);
  } catch (e) {
    if (e instanceof AccountError) return errorResponse(400, "INVALID_TOKEN", "This reset link is invalid or has expired. Please request a new one.");
    return serverError();
  }
}
