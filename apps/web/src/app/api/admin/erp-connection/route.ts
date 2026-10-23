import { z } from "zod";
import { requireAdmin } from "@/lib/admin/auth";
import { getDb } from "@/lib/db";
import { resetCatalogueCache } from "@/lib/erp/catalogue";
import { CREDENTIAL_RE, encryptionConfigured, encryptSecret, invalidateErpConnection, normalizeErpBase, probeErp } from "@/lib/erp/connection";
import { errorResponse, guard, json, readJson } from "@/lib/security/api";

export const dynamic = "force-dynamic";

const body = z.object({ address: z.string().max(300), credential: z.string().max(400), action: z.enum(["test", "save"]) });

async function staff(req: Request) {
  const blocked = guard(req, { name: "admin-erp-connection", limit: 20, windowMs: 60_000, mutating: true });
  if (blocked) return { response: blocked } as const;
  const a = await requireAdmin();
  if (a.kind === "signed-out") return { response: errorResponse(401, "SIGNED_OUT", "Please sign in.") } as const;
  if (a.kind === "forbidden") return { response: errorResponse(403, "FORBIDDEN", "You do not have access to this action.") } as const;
  return { admin: a.admin } as const;
}

/** Test, or test-then-save, an ERP connection. The credential is checked against the ERP first and never echoed back. */
export async function POST(req: Request) {
  const s = await staff(req);
  if ("response" in s) return s.response;
  const parsed = body.safeParse(await readJson(req, 5_000).catch(() => null));
  if (!parsed.success) return errorResponse(400, "INVALID", "Enter the ERP address and the API credential.");
  const base = normalizeErpBase(parsed.data.address);
  if (!base.ok) return errorResponse(422, "ADDRESS", base.error);
  const cred = parsed.data.credential.trim();
  if (!CREDENTIAL_RE.test(cred)) return errorResponse(422, "CREDENTIAL", "The credential should look like hxs_<key>.<secret>.");

  const probe = await probeErp(base.base, cred);
  if (!probe.ok) return errorResponse(422, "PROBE_FAILED", probe.message);
  if (parsed.data.action === "test") return json({ ok: true, message: probe.message, shop: probe.shop, base: base.base });

  const db = getDb();
  if (!db) return errorResponse(503, "NO_DATABASE", "The website database is not configured.");
  if (!encryptionConfigured()) return errorResponse(503, "NO_KEY", "Set SETTINGS_ENCRYPTION_KEY (32+ characters) on the server so the credential can be stored encrypted.");
  const hint = `${cred.slice(0, 8)}…${cred.slice(-3)}`;
  const data = { baseUrl: base.base, credentialEnc: encryptSecret(cred), credentialHint: hint, updatedBy: s.admin.email };
  await db.erpConnectionConfig.upsert({ where: { id: "default" }, create: { id: "default", ...data }, update: data });
  invalidateErpConnection();
  resetCatalogueCache();
  return json({ ok: true, message: "Saved. The website now uses this ERP.", shop: probe.shop, base: base.base, hint });
}

/** Remove the saved connection; the website falls back to the environment variables (if any). */
export async function DELETE(req: Request) {
  const s = await staff(req);
  if ("response" in s) return s.response;
  const db = getDb();
  if (!db) return errorResponse(503, "NO_DATABASE", "The website database is not configured.");
  await db.erpConnectionConfig.deleteMany({ where: { id: "default" } });
  invalidateErpConnection();
  resetCatalogueCache();
  return json({ ok: true });
}
