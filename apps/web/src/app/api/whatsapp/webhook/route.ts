import { errorResponse, json } from "@/lib/security/api";
import { parseWebhook, validSignature } from "@/lib/whatsapp/cloud";
import { storeStaffReply, updateDelivery } from "@/lib/whatsapp/relay";
import { getCloudSecrets, getWaSettings, toWaDigits } from "@/lib/whatsapp/settings";

export const dynamic = "force-dynamic";

/** Meta's webhook check: echo the challenge when the verify token matches the one saved in the admin. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const creds = await getCloudSecrets();
  if (!creds || u.searchParams.get("hub.mode") !== "subscribe" || u.searchParams.get("hub.verify_token") !== creds.verifyToken) {
    return errorResponse(403, "FORBIDDEN", "Verification failed.");
  }
  return new Response(u.searchParams.get("hub.challenge") ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
}

/**
 * WhatsApp Cloud API events, signed with the app secret (anything unsigned is refused). Replies from the staff number
 * become chat answers; delivery updates mark the copies as delivered or read.
 */
export async function POST(req: Request) {
  const settings = await getWaSettings();
  const creds = await getCloudSecrets();
  if (settings.mode !== "cloud" || !creds) return errorResponse(404, "NOT_FOUND", "Not found.");
  const raw = await req.text();
  if (raw.length > 200_000 || !validSignature(raw, req.headers.get("x-hub-signature-256"), creds.appSecret)) {
    return errorResponse(401, "BAD_SIGNATURE", "Signature check failed.");
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return errorResponse(400, "BAD_JSON", "Invalid body.");
  }
  const staff = toWaDigits(settings.notifyTo);
  const { messages, statuses } = parseWebhook(body);
  for (const m of messages) {
    if (m.from !== staff) continue; // only the staff number can answer chats
    await storeStaffReply({ waId: m.id, text: m.text, quotedId: m.quotedId }).catch(() => undefined);
  }
  for (const s of statuses) await updateDelivery(s.id, s.status).catch(() => undefined);
  return json({ ok: true });
}
