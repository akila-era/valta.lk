import { z } from "zod";
import { requireAdmin } from "@/lib/admin/auth";
import { getDb } from "@/lib/db";
import { decryptSecret, encryptSecret, encryptionConfigured } from "@/lib/erp/connection";
import { assertPayzyKey } from "@/lib/payments/payzy";
import { invalidatePayzyConfig, PAYZY_ENVIRONMENTS } from "@/lib/payments/payzy-config";
import { errorResponse, guard, json, readJson } from "@/lib/security/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const text = (max: number) => z.string().trim().max(max);
const body = z.object({
  action: z.enum(["test", "save", "toggle"]),
  enabled: z.boolean().optional(),
  environment: z.enum(["SANDBOX", "PROD"]).optional(),
  shopId: text(50).optional(),
  secretKey: text(200).optional(),
  testMode: text(10).optional(),
  appUrl: text(300).optional(),
  legacyVersionSigning: z.boolean().optional(),
});

async function staff(req: Request) {
  const blocked = guard(req, { name: "admin-payzy-connection", limit: 20, windowMs: 60_000, mutating: true });
  if (blocked) return { response: blocked } as const;
  const a = await requireAdmin();
  if (a.kind === "signed-out") return { response: errorResponse(401, "SIGNED_OUT", "Please sign in.") } as const;
  if (a.kind === "forbidden") return { response: errorResponse(403, "FORBIDDEN", "You do not have access to this action.") } as const;
  return { admin: a.admin } as const;
}

function normalizeAppUrl(input: string): string | null {
  try {
    const u = new URL(input);
    const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
    if (u.protocol !== "https:" && !(local && u.protocol === "http:")) return null;
    if (u.username || u.password || u.search || u.hash) return null;
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

/**
 * Save, check, or switch on/off the Payzy connection. A blank secret key keeps the stored one. The key is encrypted at
 * rest and never sent back to the browser. Pasting it here also avoids the "$" escaping needed in .env files.
 */
export async function POST(req: Request) {
  const s = await staff(req);
  if ("response" in s) return s.response;
  const parsed = body.safeParse(await readJson(req, 10_000).catch(() => null));
  if (!parsed.success) return errorResponse(400, "INVALID", "Some fields are missing or too long.");
  const b = parsed.data;
  const db = getDb();
  if (!db) return errorResponse(503, "NO_DATABASE", "The website database is not configured.");
  const row = await db.payzyConnectionConfig.findUnique({ where: { id: "default" } });

  if (b.action === "toggle") {
    if (!row) return errorResponse(409, "NOT_SAVED", "Save the Payzy settings first.");
    await db.payzyConnectionConfig.update({ where: { id: "default" }, data: { enabled: Boolean(b.enabled), updatedBy: s.admin.email } });
    invalidatePayzyConfig();
    return json({ ok: true, enabled: Boolean(b.enabled) });
  }

  const secretKey = b.secretKey || (row ? decryptSecret(row.secretKeyEnc) : null);
  const shopId = b.shopId || row?.shopId;
  const testMode = b.testMode || row?.testMode;
  const appUrlRaw = b.appUrl || row?.appUrl;
  if (!b.environment || !shopId || !secretKey || !testMode || !appUrlRaw) return errorResponse(422, "MISSING", "Fill in every field. The secret key can only be left blank when it is already saved.");
  const appUrl = normalizeAppUrl(appUrlRaw);
  if (!appUrl) return errorResponse(422, "APP_URL", "The public site URL must be an https:// address (Payzy must be able to redirect customers back to it).");
  try {
    assertPayzyKey(secretKey);
  } catch {
    return errorResponse(422, "KEY", `The secret key looks wrong: it should be 60 characters starting with $2b$, but it has ${secretKey.length}. Paste it exactly as Payzy gave it.`);
  }
  if (b.action === "test") return json({ ok: true, message: "The details look valid: the secret key has the right format. Payzy itself is only contacted when a customer pays." });

  if (!encryptionConfigured()) return errorResponse(503, "NO_KEY", "Set SETTINGS_ENCRYPTION_KEY (32+ characters) on the server so the key can be stored encrypted.");
  const data = {
    baseUrl: PAYZY_ENVIRONMENTS[b.environment],
    shopId,
    secretKeyEnc: encryptSecret(secretKey),
    secretKeyHint: `…${secretKey.slice(-3)}`,
    testMode,
    appUrl,
    legacyVersionSigning: b.legacyVersionSigning ?? row?.legacyVersionSigning ?? false,
    updatedBy: s.admin.email,
  };
  await db.payzyConnectionConfig.upsert({ where: { id: "default" }, create: { id: "default", enabled: false, ...data }, update: data });
  invalidatePayzyConfig();
  return json({ ok: true, message: row ? "Saved." : "Saved. Payzy is still switched off: turn it on when you are ready to show it at checkout." });
}

/** Remove the saved connection; the website falls back to the PAYZY_* environment variables (if any). */
export async function DELETE(req: Request) {
  const s = await staff(req);
  if ("response" in s) return s.response;
  const db = getDb();
  if (!db) return errorResponse(503, "NO_DATABASE", "The website database is not configured.");
  await db.payzyConnectionConfig.deleteMany({ where: { id: "default" } });
  invalidatePayzyConfig();
  return json({ ok: true });
}
