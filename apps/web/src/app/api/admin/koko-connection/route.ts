import { z } from "zod";
import { requireAdmin } from "@/lib/admin/auth";
import { getDb } from "@/lib/db";
import { encryptionConfigured, encryptSecret, decryptSecret } from "@/lib/erp/connection";
import { checkKeyPair, invalidateKokoConfig, KOKO_ENVIRONMENTS } from "@/lib/payments/koko-config";
import { errorResponse, guard, json, readJson } from "@/lib/security/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const text = (max: number) => z.string().trim().max(max);
const body = z.object({
  action: z.enum(["test", "save", "toggle"]),
  enabled: z.boolean().optional(),
  environment: z.enum(["QA", "PROD"]).optional(),
  merchantId: text(100).optional(),
  apiKey: text(300).optional(),
  pluginName: text(60).optional(),
  pluginVersion: text(20).optional(),
  privateKey: z.string().max(10_000).optional(),
  publicKey: z.string().max(10_000).optional(),
  appUrl: text(300).optional(),
});

async function staff(req: Request) {
  const blocked = guard(req, { name: "admin-koko-connection", limit: 20, windowMs: 60_000, mutating: true });
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
 * Save, test, or switch on/off the Koko connection. Blank secret fields keep the stored value, so changing one setting
 * never requires pasting the keys again. Secrets are encrypted at rest and never sent back to the browser.
 */
export async function POST(req: Request) {
  const s = await staff(req);
  if ("response" in s) return s.response;
  const parsed = body.safeParse(await readJson(req, 30_000).catch(() => null));
  if (!parsed.success) return errorResponse(400, "INVALID", "Some fields are missing or too long.");
  const b = parsed.data;
  const db = getDb();
  if (!db) return errorResponse(503, "NO_DATABASE", "The website database is not configured.");
  const row = await db.kokoConnectionConfig.findUnique({ where: { id: "default" } });

  if (b.action === "toggle") {
    if (!row) return errorResponse(409, "NOT_SAVED", "Save the Koko settings first.");
    await db.kokoConnectionConfig.update({ where: { id: "default" }, data: { enabled: Boolean(b.enabled), updatedBy: s.admin.email } });
    invalidateKokoConfig();
    return json({ ok: true, enabled: Boolean(b.enabled) });
  }

  const apiKey = b.apiKey || (row ? decryptSecret(row.apiKeyEnc) : null);
  const privateKey = b.privateKey?.trim() || (row ? decryptSecret(row.privateKeyEnc) : null);
  const publicKey = b.publicKey?.trim() || row?.publicKey || null;
  const merchantId = b.merchantId || row?.merchantId;
  const environment = b.environment;
  const pluginName = b.pluginName || row?.pluginName;
  const pluginVersion = b.pluginVersion || row?.pluginVersion;
  const appUrlRaw = b.appUrl || row?.appUrl;
  if (!merchantId || !apiKey || !privateKey || !publicKey || !environment || !pluginName || !pluginVersion || !appUrlRaw) {
    return errorResponse(422, "MISSING", "Fill in every field. Keys can only be left blank when they are already saved.");
  }
  const appUrl = normalizeAppUrl(appUrlRaw);
  if (!appUrl) return errorResponse(422, "APP_URL", "The public site URL must be an https:// address (Koko must be able to reach it).");
  const keyError = checkKeyPair(privateKey, publicKey);
  if (keyError) return errorResponse(422, "KEYS", keyError);
  if (b.action === "test") return json({ ok: true, message: "The details look valid: the keys are readable and the private key can sign. Koko itself is only contacted when a customer pays or you recheck an order." });

  if (!encryptionConfigured()) return errorResponse(503, "NO_KEY", "Set SETTINGS_ENCRYPTION_KEY (32+ characters) on the server so the keys can be stored encrypted.");
  const data = {
    baseUrl: KOKO_ENVIRONMENTS[environment],
    merchantId,
    apiKeyEnc: encryptSecret(apiKey),
    apiKeyHint: `…${apiKey.slice(-3)}`,
    pluginName,
    pluginVersion,
    privateKeyEnc: encryptSecret(privateKey.replace(/\\n/g, "\n")),
    publicKey: publicKey.replace(/\\n/g, "\n").trim(),
    appUrl,
    updatedBy: s.admin.email,
  };
  await db.kokoConnectionConfig.upsert({ where: { id: "default" }, create: { id: "default", enabled: false, ...data }, update: data });
  invalidateKokoConfig();
  return json({ ok: true, message: row ? "Saved." : "Saved. Koko is still switched off: turn it on when you are ready to show it at checkout.", environment });
}

/** Remove the saved connection; the website falls back to the KOKO_* environment variables (if any). */
export async function DELETE(req: Request) {
  const s = await staff(req);
  if ("response" in s) return s.response;
  const db = getDb();
  if (!db) return errorResponse(503, "NO_DATABASE", "The website database is not configured.");
  await db.kokoConnectionConfig.deleteMany({ where: { id: "default" } });
  invalidateKokoConfig();
  return json({ ok: true });
}
