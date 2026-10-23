import { updateProfile } from "@/lib/auth/accounts";
import { serverError } from "@/lib/auth/route-helpers";
import { getCurrentCustomer } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { errorResponse, guard, json, readJson } from "@/lib/security/api";
import { profileSchema } from "@/lib/validation/account";

export const dynamic = "force-dynamic";

/** The signed-in customer's own details (used to pre-fill checkout). */
export async function GET(req: Request) {
  const blocked = guard(req, { name: "account-me", limit: 60, windowMs: 60_000 });
  if (blocked) return blocked;
  const c = await getCurrentCustomer();
  return json({ customer: c ? { name: c.name, email: c.email, phone: c.phone } : null });
}

export async function PATCH(req: Request) {
  const blocked = guard(req, { name: "account-profile", limit: 20, windowMs: 60_000, mutating: true });
  if (blocked) return blocked;
  const db = getDb();
  const c = await getCurrentCustomer();
  if (!db || !c) return errorResponse(401, "SIGNED_OUT", "Please sign in again.");
  let body: unknown;
  try {
    body = await readJson(req);
  } catch {
    return errorResponse(400, "INVALID_JSON", "Invalid request body.");
  }
  const parsed = profileSchema.safeParse(body);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) fields[issue.path.join(".")] ??= issue.message;
    return errorResponse(422, "VALIDATION_FAILED", "Please correct the highlighted fields.", { fields });
  }
  try {
    const u = await updateProfile(db, c.id, parsed.data);
    return json({ customer: { name: u.name, email: u.email, phone: u.phone } });
  } catch {
    return serverError();
  }
}
