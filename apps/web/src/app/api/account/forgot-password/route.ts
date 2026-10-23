import { createResetToken } from "@/lib/auth/accounts";
import { sendPasswordResetEmail } from "@/lib/auth/mailer";
import { accountRequest, serverError } from "@/lib/auth/route-helpers";
import { json } from "@/lib/security/api";
import { siteConfig } from "@/lib/site-config";
import { forgotSchema } from "@/lib/validation/account";

export const dynamic = "force-dynamic";

/** Always answers the same way so the response never reveals whether an email is registered. */
export async function POST(req: Request) {
  const r = await accountRequest(req, forgotSchema, { name: "account-forgot", limit: 5, windowMs: 15 * 60_000 });
  if (!r.ok) return r.response;
  try {
    const t = await createResetToken(r.db, r.data.email);
    if (t) await sendPasswordResetEmail(r.data.email, t.name, `${siteConfig.url}/account/reset-password?token=${t.token}`);
    return json({ ok: true, message: "If an account exists for that email, we have sent a link to reset the password." });
  } catch {
    return serverError();
  }
}
