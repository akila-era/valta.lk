import { getDb } from "@/lib/db";
import { errorResponse, guard, json } from "@/lib/security/api";
import { applicationSchema, WHOLESALE_PLACEMENT } from "@/lib/wholesale";

export const dynamic = "force-dynamic";

/** Public: send a wholesale registration. Origin-checked, rate-limited, with a hidden field for bots. */
export async function POST(req: Request) {
  const blocked = guard(req, { name: "wholesale", limit: 4, windowMs: 15 * 60_000, mutating: true });
  if (blocked) return blocked;
  const body = applicationSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    const i = body.error.issues[0];
    return errorResponse(422, "INVALID", i?.message ?? "Please check the form and try again.");
  }
  const { website, business, ...rest } = body.data;
  if (website) return json({ ok: true }, 201); // a bot filled the hidden field: pretend it worked
  const db = getDb();
  if (!db) return errorResponse(503, "UNAVAILABLE", "Registration is not available right now. Please call or message us instead.");
  const row = await db.banner
    .create({ data: { placement: WHOLESALE_PLACEMENT, headline: business, text: JSON.stringify(rest), ctaLabel: "Wholesale", href: "new", active: true }, select: { id: true } })
    .catch(() => null);
  if (!row) return errorResponse(503, "UNAVAILABLE", "Registration is not available right now. Please call or message us instead.");
  return json({ ok: true }, 201);
}
