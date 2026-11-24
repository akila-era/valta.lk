import { randomBytes } from "node:crypto";
import { z } from "zod";
import { getErpSnapshot } from "@/lib/erp/catalogue";
import { getDb } from "@/lib/db";
import { sendPreorderMessage } from "@/lib/whatsapp/preorder-message";
import { errorResponse, guard, json, readJson } from "@/lib/security/api";

export const dynamic = "force-dynamic";

const body = z.object({
  productId: z.string().trim().min(1).max(60),
  quantity: z.coerce.number().int().min(1).max(20).default(1),
  name: z.string().trim().min(2).max(100),
  phone: z.string().trim().regex(/^\+?[\d\s-]{9,16}$/),
  email: z.union([z.literal(""), z.string().trim().toLowerCase().email().max(254)]).optional(),
  city: z.string().trim().max(80).optional(),
  note: z.string().trim().max(500).optional(),
  /** Hidden field real visitors leave empty; bots that fill every field are quietly ignored. */
  website: z.string().max(200).optional(),
});

const FIELD: Record<string, string> = { name: "Your name", phone: "Phone number", email: "Email", quantity: "Quantity" };
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newRef = () => `PRE-${[...randomBytes(6)].map((b) => ALPHABET[b % ALPHABET.length]).join("")}`;

/**
 * Pre-order request for an out-of-stock product. Stored for staff (Admin, Sales & Orders, Pre-orders); it is not sent
 * to the ERP and nothing is charged: staff contact the customer on WhatsApp or by phone to confirm payment and the
 * order. Only products that are out of stock can be pre-ordered; products in stock go through the normal checkout.
 */
export async function POST(req: Request) {
  const blocked = guard(req, { name: "preorder", limit: 5, windowMs: 60_000, mutating: true });
  if (blocked) return blocked;
  const parsed = body.safeParse(await readJson(req, 4_000).catch(() => null));
  if (!parsed.success) {
    const field = String(parsed.error.issues[0]?.path[0] ?? "");
    return errorResponse(422, "INVALID", `Please check: ${FIELD[field] ?? "the form"}.`);
  }
  const d = parsed.data;
  if (d.website) return json({ ok: true, ref: null });
  const db = getDb();
  if (!db) return errorResponse(503, "NO_DATABASE", "Pre-orders are not available right now. Please contact us instead.");
  const product = await getErpSnapshot()
    .then((s) => s.products.get(d.productId) ?? null)
    .catch(() => null);
  if (!product) return errorResponse(404, "NOT_FOUND", "That product is no longer available.");
  if (product.available) return errorResponse(409, "IN_STOCK", "This product is in stock now. Please add it to your cart instead.");
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const ref = newRef();
      const exists = await db.preOrderRequest.findUnique({ where: { ref }, select: { id: true } });
      if (exists) continue;
      const created = await db.preOrderRequest.create({
        data: {
          ref,
          erpItemId: product.id,
          productName: product.name,
          productSlug: product.slug,
          sku: product.sku || null,
          quantity: d.quantity,
          name: d.name,
          phone: d.phone,
          email: d.email || null,
          city: d.city || null,
          note: d.note || null,
        },
      });
      // The customer's WhatsApp confirmation (Admin, Pre-orders): sent from the store's linked WhatsApp, if set up.
      await sendPreorderMessage(created.id);
      return json({ ok: true, ref }, 201);
    }
    return errorResponse(500, "SERVER_ERROR", "Something went wrong. Please try again.");
  } catch {
    return errorResponse(500, "SERVER_ERROR", "Something went wrong. Please try again.");
  }
}
