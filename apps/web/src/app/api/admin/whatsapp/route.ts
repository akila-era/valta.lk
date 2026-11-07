import QRCode from "qrcode";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/auth";
import { errorResponse, guard, json, readJson } from "@/lib/security/api";
import { siteConfig } from "@/lib/site-config";
import { connectWhatsApp, disconnectWhatsApp, waState } from "@/lib/whatsapp/baileys";
import { ensureLinkedDevice } from "@/lib/whatsapp/relay";
import { getWaSettings, saveWaSettings, settingsInput } from "@/lib/whatsapp/settings";

export const dynamic = "force-dynamic";

async function gate(): Promise<{ error: Response; email?: undefined } | { error?: undefined; email: string }> {
  const access = await requireAdmin();
  if (access.kind === "signed-out") return { error: errorResponse(401, "SIGNED_OUT", "Please sign in.") };
  if (access.kind === "forbidden") return { error: errorResponse(403, "FORBIDDEN", "You do not have access to this action.") };
  return { email: access.admin.email };
}

/** Admin only: the connection status and, while linking, the QR code (as an image). Secrets are never included. */
export async function GET(req: Request) {
  const blocked = guard(req, { name: "admin-whatsapp", limit: 120, windowMs: 60_000 });
  if (blocked) return blocked;
  const g = await gate();
  if (g.error) return g.error;
  const settings = await getWaSettings();
  if (settings.mode === "qr") await ensureLinkedDevice();
  const st = waState();
  const qr = settings.mode === "qr" && st.status === "qr" && st.qr ? await QRCode.toDataURL(st.qr, { margin: 1, width: 280 }) : null;
  const status = settings.mode === "qr" ? st.status : settings.mode === "cloud" && settings.cloud.hasAccessToken ? "connected" : "disconnected";
  return json({
    settings,
    status,
    me: settings.mode === "qr" && st.me ? st.me.replace(/[:@].*$/, "") : null,
    error: settings.mode === "qr" ? st.error : null,
    qr,
    webhookUrl: `${siteConfig.url.replace(/\/$/, "")}/api/whatsapp/webhook`,
  });
}

const action = z.object({ action: z.enum(["connect", "disconnect", "unlink"]) });

/** Admin only: connect (shows a QR when no session is saved), disconnect, or unlink the device. */
export async function POST(req: Request) {
  const blocked = guard(req, { name: "admin-whatsapp", limit: 30, windowMs: 60_000, mutating: true });
  if (blocked) return blocked;
  const g = await gate();
  if (g.error) return g.error;
  const parsed = action.safeParse(await readJson(req, 500).catch(() => null));
  if (!parsed.success) return errorResponse(422, "INVALID", "Unknown action.");
  const settings = await getWaSettings();
  if (settings.mode !== "qr") return errorResponse(409, "NOT_QR_MODE", "Choose QR linking and save first.");
  await ensureLinkedDevice();
  if (parsed.data.action === "connect") await connectWhatsApp();
  else await disconnectWhatsApp(parsed.data.action === "unlink");
  return json({ ok: true, status: waState().status });
}

/** Admin only: save the connection settings (mode, staff number, Cloud API details). */
export async function PUT(req: Request) {
  const blocked = guard(req, { name: "admin-whatsapp", limit: 30, windowMs: 60_000, mutating: true });
  if (blocked) return blocked;
  const g = await gate();
  if (g.error) return g.error;
  const parsed = settingsInput.safeParse(await readJson(req, 6_000).catch(() => null));
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path.join(".") ?? "";
    return errorResponse(422, "INVALID", `Please check: ${field || "the form"}.`);
  }
  const before = await getWaSettings();
  const saved = await saveWaSettings(parsed.data, g.email);
  if (!saved.ok) return errorResponse(422, "INVALID", saved.error);
  if (before.mode === "qr" && parsed.data.mode !== "qr") await disconnectWhatsApp(false);
  await ensureLinkedDevice();
  return json({ ok: true });
}
