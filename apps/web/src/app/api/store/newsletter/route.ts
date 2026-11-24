import { z } from "zod";
import { getDb } from "@/lib/db";
import { errorResponse, guard, json, readJson } from "@/lib/security/api";

export const dynamic = "force-dynamic";

const body = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  /** Hidden field real visitors leave empty; bots that fill every field are quietly ignored. */
  company: z.string().max(200).optional(),
});

/**
 * Footer newsletter sign-up. The answer is the same whether the address was new or already on the list, so the form
 * cannot be used to find out who subscribed.
 */
export async function POST(req: Request) {
  const blocked = guard(req, { name: "newsletter", limit: 5, windowMs: 60_000, mutating: true });
  if (blocked) return blocked;
  const parsed = body.safeParse(await readJson(req, 2_000).catch(() => null));
  if (!parsed.success) return errorResponse(422, "INVALID_EMAIL", "Please enter a valid email address.");
  if (parsed.data.company) return json({ ok: true });
  const db = getDb();
  if (!db) return errorResponse(503, "NO_DATABASE", "Sign-up is not available right now. Please try again later.");
  try {
    await db.newsletterSubscriber.upsert({ where: { email: parsed.data.email }, create: { email: parsed.data.email, source: "footer" }, update: {} });
    return json({ ok: true });
  } catch {
    return errorResponse(500, "SERVER_ERROR", "Something went wrong. Please try again.");
  }
}
