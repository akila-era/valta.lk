import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { getDb } from "../db";
import { getSnapshot } from "../erp/catalogue";
import type { ErpProduct } from "../erp/types";
import { errorResponse, guard } from "../security/api";
import { requireAdmin } from "./auth";
import { ContentError, productIdSchemaRe } from "./product-content";

type Ctx =
  | { ok: true; db: PrismaClient; product: ErpProduct; admin: { email: string; name: string }; id: string }
  | { ok: false; response: Response };

/**
 * Shared front door of every admin product-content API: origin + rate limit, admin session, valid id, website database,
 * and the product must exist in the ERP catalogue (so content can never be attached to an invented product).
 */
export async function adminProductRequest(req: Request, params: Promise<{ id: string }>, name: string, limit: number): Promise<Ctx> {
  const blocked = guard(req, { name, limit, windowMs: 60_000, mutating: true });
  if (blocked) return { ok: false, response: blocked };
  const access = await requireAdmin();
  if (access.kind === "signed-out") return { ok: false, response: errorResponse(401, "SIGNED_OUT", "Please sign in.") };
  if (access.kind === "forbidden") return { ok: false, response: errorResponse(403, "FORBIDDEN", "You do not have access to this action.") };
  const { id } = await params;
  if (!productIdSchemaRe.test(id)) return { ok: false, response: errorResponse(404, "NOT_FOUND", "Product not found.") };
  const db = getDb();
  if (!db) return { ok: false, response: errorResponse(503, "NO_DATABASE", "Website database is not configured.") };
  let products;
  try {
    products = (await getSnapshot()).products;
  } catch {
    return { ok: false, response: errorResponse(503, "ERP_UNAVAILABLE", "The ERP catalogue could not be reached, so the product could not be checked.") };
  }
  const product = products.get(id);
  if (!product) return { ok: false, response: errorResponse(404, "NOT_FOUND", "This product is not in the ERP catalogue.") };
  return { ok: true, db, product, admin: access.admin, id };
}

const STATUS: Record<ContentError["code"], number> = { TOO_LARGE: 413, BAD_TYPE: 422, TOO_MANY: 422, INVALID: 422, CONFLICT: 409, NOT_FOUND: 404 };

export function contentErrorResponse(e: unknown): Response {
  if (e instanceof ContentError) return errorResponse(STATUS[e.code], e.code, e.message, e.issues.length ? { issues: e.issues } : undefined);
  return errorResponse(500, "SERVER_ERROR", "Could not save. Please try again.");
}
