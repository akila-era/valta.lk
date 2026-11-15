import "server-only";
import { requireAdmin } from "@/lib/admin/auth";
import { errorResponse, guard } from "@/lib/security/api";
import { qaEnabled } from "./flags";

/**
 * The front door of every QA API route: the QA centre must be enabled (development only), then the usual origin and rate-limit guard,
 * then an admin session. A disabled centre answers 404, exactly as if the route did not exist.
 */
export async function qaFront(req: Request, name: string, mutating: boolean): Promise<Response | null> {
  if (!qaEnabled()) return errorResponse(404, "NOT_FOUND", "Not found.");
  const blocked = guard(req, { name: `admin-ai-qa-${name}`, limit: 90, windowMs: 60_000, mutating });
  if (blocked) return blocked;
  const access = await requireAdmin();
  if (access.kind === "signed-out") return errorResponse(401, "SIGNED_OUT", "Please sign in.");
  if (access.kind === "forbidden") return errorResponse(403, "FORBIDDEN", "You do not have access to this action.");
  return null;
}
