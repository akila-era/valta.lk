import { z } from "zod";
import { getDb } from "@/lib/db";
import { errorResponse, guard, json, readJson } from "@/lib/security/api";

export const dynamic = "force-dynamic";

const event = z.object({
  type: z.enum(["impression", "click", "add"]),
  sourceItemId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  accessoryItemId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
});
const body = z.object({ events: z.array(event).min(1).max(20) });

/** Records accessory recommendation impressions, clicks and add-to-cart events for links that actually exist. */
export async function POST(req: Request) {
  const blocked = guard(req, { name: "reco", limit: 30, windowMs: 60_000, mutating: true });
  if (blocked) return blocked;
  const parsed = body.safeParse(await readJson(req).catch(() => null));
  if (!parsed.success) return errorResponse(400, "INVALID_REQUEST", "The event was not understood.");
  const db = getDb();
  if (!db) return json({ accepted: 0 });
  try {
    const links = await db.accessoryLink.findMany({
      where: { OR: parsed.data.events.map((e) => ({ sourceItemId: e.sourceItemId, accessoryItemId: e.accessoryItemId })) },
      select: { sourceItemId: true, accessoryItemId: true },
    });
    const allowed = new Set(links.map((l) => `${l.sourceItemId}::${l.accessoryItemId}`));
    const rows = parsed.data.events.filter((e) => allowed.has(`${e.sourceItemId}::${e.accessoryItemId}`));
    if (rows.length) await db.recommendationEvent.createMany({ data: rows });
    return json({ accepted: rows.length });
  } catch {
    return json({ accepted: 0 });
  }
}
