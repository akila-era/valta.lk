import { z } from "zod";
import { getDb } from "@/lib/db";
import { errorResponse, guard, json, readJson } from "@/lib/security/api";

export const dynamic = "force-dynamic";

const body = z.object({
  business: z.string().trim().min(2).max(120),
  name: z.string().trim().min(2).max(100),
  phone: z.string().trim().regex(/^\+?[\d\s-]{9,16}$/),
  email: z.union([z.literal(""), z.string().trim().toLowerCase().email().max(254)]).optional(),
  city: z.string().trim().max(80).optional(),
  message: z.string().trim().max(1000).optional(),
  /** Hidden field real visitors leave empty; bots that fill every field are quietly ignored. */
  website: z.string().max(200).optional(),
});

const FIELD: Record<string, string> = { business: "Business name", name: "Your name", phone: "Phone number", email: "Email" };

/** "Apply Wholesale": stores the application for staff (Admin, Customers, Wholesale Applications). */
export async function POST(req: Request) {
  const blocked = guard(req, { name: "wholesale", limit: 5, windowMs: 60_000, mutating: true });
  if (blocked) return blocked;
  const parsed = body.safeParse(await readJson(req, 4_000).catch(() => null));
  if (!parsed.success) {
    const field = String(parsed.error.issues[0]?.path[0] ?? "");
    return errorResponse(422, "INVALID", `Please check: ${FIELD[field] ?? "the form"}.`);
  }
  const d = parsed.data;
  if (d.website) return json({ ok: true });
  const db = getDb();
  if (!db) return errorResponse(503, "NO_DATABASE", "Applications are not available right now. Please call us instead.");
  try {
    await db.wholesaleApplication.create({
      data: { business: d.business, name: d.name, phone: d.phone, email: d.email || null, city: d.city || null, message: d.message || null },
    });
    return json({ ok: true });
  } catch {
    return errorResponse(500, "SERVER_ERROR", "Something went wrong. Please try again.");
  }
}
