import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The official WhatsApp Business Platform (Cloud API). Messages go out through the Graph API; staff replies and
 * delivery updates come back through the webhook (/api/whatsapp/webhook), which is checked with the app secret.
 * Note: a business number can only send free-form text to a person who messaged it in the last 24 hours, so the
 * staff number should message the business number once a day (or keep the chat open) for chats to arrive there.
 * Every chat is also in the admin inbox, where staff can always reply.
 */
const GRAPH = () => (process.env.WA_GRAPH_BASE || "https://graph.facebook.com/v21.0").replace(/\/$/, "");

export async function sendViaCloud(
  creds: { phoneNumberId: string; accessToken: string },
  toDigits: string,
  text: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${GRAPH()}/${creds.phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${creds.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: toDigits, type: "text", text: { body: text, preview_url: false } }),
      signal: AbortSignal.timeout(10_000),
    });
    const out = (await res.json().catch(() => null)) as { messages?: { id: string }[]; error?: { message?: string } } | null;
    const id = out?.messages?.[0]?.id;
    if (res.ok && id) return { ok: true, id };
    return { ok: false, error: (out?.error?.message ?? `WhatsApp Cloud API error ${res.status}`).slice(0, 200) };
  } catch {
    return { ok: false, error: "Could not reach the WhatsApp Cloud API." };
  }
}

/** Is the webhook body really from Meta? (X-Hub-Signature-256 = HMAC-SHA256 of the raw body with the app secret.) */
export function validSignature(raw: string, header: string | null, appSecret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(createHmac("sha256", appSecret).update(raw).digest("hex"));
  const given = Buffer.from(header.slice(7));
  return given.length === expected.length && timingSafeEqual(given, expected);
}

type WebhookBody = {
  entry?: {
    changes?: {
      value?: {
        messages?: { id?: string; from?: string; type?: string; text?: { body?: string }; context?: { id?: string } }[];
        statuses?: { id?: string; status?: string }[];
      };
    }[];
  }[];
};

/** The messages and delivery updates in one webhook call. */
export function parseWebhook(body: unknown) {
  const b = body as WebhookBody;
  const messages: { id: string; from: string; text: string; quotedId: string | null }[] = [];
  const statuses: { id: string; status: "SENT" | "DELIVERED" | "READ" | "FAILED" }[] = [];
  for (const e of b?.entry ?? []) {
    for (const c of e.changes ?? []) {
      for (const m of c.value?.messages ?? []) {
        if (m.id && m.from && m.type === "text" && m.text?.body) messages.push({ id: m.id, from: m.from, text: m.text.body.trim(), quotedId: m.context?.id ?? null });
      }
      for (const s of c.value?.statuses ?? []) {
        const map = { sent: "SENT", delivered: "DELIVERED", read: "READ", failed: "FAILED" } as const;
        const st = map[(s.status ?? "") as keyof typeof map];
        if (s.id && st) statuses.push({ id: s.id, status: st });
      }
    }
  }
  return { messages, statuses };
}
