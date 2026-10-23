import { offersForSources } from "@/lib/accessories/load";
import { errorResponse, guard, json } from "@/lib/security/api";

export const dynamic = "force-dynamic";

const idRe = /^[A-Za-z0-9_-]{1,64}$/;

/** In-stock accessories explicitly linked to the requested products. */
export async function GET(req: Request) {
  const blocked = guard(req, { name: "accessories", limit: 60, windowMs: 60_000 });
  if (blocked) return blocked;
  const ids = (new URL(req.url).searchParams.get("productIds") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => idRe.test(s))
    .slice(0, 20);
  if (!ids.length) return errorResponse(400, "INVALID_REQUEST", "Choose a product first.");
  return json({ items: await offersForSources(ids) });
}
