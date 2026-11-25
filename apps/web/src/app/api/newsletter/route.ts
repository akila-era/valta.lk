import { z } from "zod";
import { getDb } from "@/lib/db";
import { errorResponse, guard, json } from "@/lib/security/api";

export const dynamic = "force-dynamic";

const schema = z.object({
  email: z.string().trim().toLowerCase().min(5).max(120).email(),
  website: z.string().max(200).optional(), // honeypot: real visitors leave it empty
});

/** Public: add an email address to the newsletter list. Origin-checked, rate-limited, idempotent. */
export async function POST(req: Request) {
  const blocked = guard(req, { name: "newsletter", limit: 6, windowMs: 10 * 60_000, mutating: true });
  if (blocked) return blocked;
  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return errorResponse(422, "INVALID_EMAIL", "Please enter a valid email address.");
  if (body.data.website) return json({ ok: true }, 201); // a bot filled the hidden field: pretend it worked
  const db = getDb();
  if (!db) return errorResponse(503, "UNAVAILABLE", "Sign-up is not available right now. Please try again later.");
  try {
    await db.newsletterSubscriber.upsert({ where: { email: body.data.email }, create: { email: body.data.email, source: "home" }, update: {} });
  } catch {
    return errorResponse(503, "UNAVAILABLE", "Sign-up is not available right now. Please try again later.");
  }
  return json({ ok: true }, 201);
}
