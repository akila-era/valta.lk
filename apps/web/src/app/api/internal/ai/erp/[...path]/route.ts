import { z } from "zod";
import { readCatalogueAuthConfig, verifyCatalogueRequest } from "@/lib/assistant/catalogue-auth";
import { erpRequest } from "@/lib/erp/client";
import { ErpError } from "@/lib/erp/errors";
import { errorResponse, json } from "@/lib/security/api";
import { rateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Read-only catalogue relay for the AI Agent: the Agent asks THIS site and the site asks the ERP, so the ERP credential never
 * leaves the site. Three GET routes only (settings, product list, one product); orders, customers and every write endpoint are
 * not reachable here. Signed with its own key (see catalogue-auth.ts). Off (404) unless AI_CATALOGUE_ENABLED=true and the key is set;
 * a bad or missing signature also answers 404.
 */
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const notFound = () => errorResponse(404, "NOT_FOUND", "Not found.");

export async function GET(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const cfg = readCatalogueAuthConfig();
  if (!cfg) return notFound();
  const url = new URL(req.url);
  if (!verifyCatalogueRequest({ method: "GET", pathWithQuery: url.pathname + url.search, headers: req.headers }, cfg)) return notFound();
  if (!rateLimit("ai-catalogue", 120, 60_000).ok) return errorResponse(429, "RATE_LIMITED", "Too many requests.");

  const parts = (await ctx.params).path;
  let erpPath: string;
  if (parts.length === 1 && parts[0] === "settings") {
    erpPath = "/settings";
  } else if (parts.length === 2 && parts[0] === "catalogue" && parts[1] === "products") {
    const limit = url.searchParams.get("limit");
    const cursor = url.searchParams.get("cursor");
    if (limit !== null && !/^(?:[1-9]\d?|100)$/.test(limit)) return errorResponse(400, "INVALID", "Invalid request.");
    if (cursor !== null && !/^[A-Za-z0-9_=.-]{1,200}$/.test(cursor)) return errorResponse(400, "INVALID", "Invalid request.");
    for (const k of url.searchParams.keys()) if (k !== "limit" && k !== "cursor") return errorResponse(400, "INVALID", "Invalid request.");
    const q = new URLSearchParams({ ...(limit ? { limit } : {}), ...(cursor ? { cursor } : {}) });
    erpPath = `/catalogue/products${q.size ? `?${q}` : ""}`;
  } else if (parts.length === 3 && parts[0] === "catalogue" && parts[1] === "products" && ID.test(parts[2]!)) {
    if (url.search) return errorResponse(400, "INVALID", "Invalid request.");
    erpPath = `/catalogue/products/${encodeURIComponent(parts[2]!)}`;
  } else {
    return notFound();
  }

  try {
    const data = await erpRequest(erpPath, z.unknown(), { maxAttempts: 2, timeoutMs: 6000 });
    return json({ success: true, data });
  } catch (e) {
    if (e instanceof ErpError) {
      // Reached only with a valid signature, so this distinct code is not an oracle for outsiders; the Agent needs it to tell "no such product" from "rejected".
      if (e.kind === "NOT_FOUND") return errorResponse(404, "PRODUCT_NOT_FOUND", "No such product.");
      if (e.kind === "UNREACHABLE" || e.kind === "TIMEOUT" || e.kind === "RATE_LIMITED") return errorResponse(503, "ERP_UNAVAILABLE", "The catalogue is unavailable.");
    }
    return errorResponse(502, "UPSTREAM_CHANGED", "The catalogue answered unexpectedly.");
  }
}
