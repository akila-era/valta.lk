import { z } from "zod";
import { mapErpError } from "@/lib/erp/errors";
import { createReservation, releaseReservation } from "@/lib/erp/reservations";
import { errorResponse, guard, json, readJson } from "@/lib/security/api";
import { availabilityRequestSchema } from "@/lib/validation/checkout";

export const dynamic = "force-dynamic";

const createSchema = availabilityRequestSchema.extend({ idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/) });
const releaseSchema = z.object({ reservationRef: z.string().regex(/^[A-Za-z0-9_.-]{6,100}$/) });

async function body(req: Request): Promise<unknown | null> {
  try {
    return await readJson(req);
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const blocked = guard(req, { name: "reservations", limit: 20, windowMs: 60_000, mutating: true });
  if (blocked) return blocked;
  const parsed = createSchema.safeParse(await body(req));
  if (!parsed.success) return errorResponse(400, "INVALID_REQUEST", "Invalid reservation request.");
  try {
    const r = await createReservation(
      parsed.data.idempotencyKey,
      parsed.data.lines.map((l) => ({ productId: l.productId, variantKey: l.variantKey, quantity: l.quantity })),
    );
    return json({ reservationRef: r.reservationRef, expiresAt: r.expiresAt }, 201);
  } catch (e) {
    const m = mapErpError(e);
    return errorResponse(m.status, m.code, m.message);
  }
}

export async function DELETE(req: Request) {
  const blocked = guard(req, { name: "reservations-release", limit: 20, windowMs: 60_000, mutating: true });
  if (blocked) return blocked;
  const parsed = releaseSchema.safeParse(await body(req));
  if (!parsed.success) return errorResponse(400, "INVALID_REQUEST", "Invalid reservation reference.");
  try {
    await releaseReservation(parsed.data.reservationRef);
    return json({ released: true });
  } catch (e) {
    const m = mapErpError(e);
    return errorResponse(m.status, m.code, m.message);
  }
}
