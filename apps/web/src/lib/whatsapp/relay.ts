import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { getDb } from "../db";
import { siteConfig } from "../site-config";
import { connectWhatsApp, hasSavedSession, sendViaLinkedDevice, setNotifyTarget, setWaHandlers, waState } from "./baileys";
import { sendViaCloud } from "./cloud";
import { getCloudSecrets, getWaSettings, toWaDigits } from "./settings";

/**
 * The website support chat. A visitor's message is stored, then a copy is sent to the staff WhatsApp chat with the
 * chat's code ("#K7P2Q"). When staff answer that copy (WhatsApp "Reply") or start a message with "#K7P2Q", the answer
 * is stored in that chat and the visitor sees it in the widget. Staff can also answer from the admin inbox.
 * Only the visitor holding the chat's cookie token can read it.
 */
export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");
export const newToken = () => randomBytes(24).toString("base64url");
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newCode = () => [...randomBytes(5)].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");

/** Is the chat on, and can messages reach WhatsApp right now? (Shown as Online / Offline in the widget.) */
export async function chatStatus(): Promise<{ enabled: boolean; online: boolean }> {
  const s = await getWaSettings();
  if (s.mode === "off") return { enabled: false, online: false };
  if (s.mode === "qr") {
    await ensureLinkedDevice();
    return { enabled: true, online: waState().status === "connected" };
  }
  return { enabled: true, online: Boolean(await getCloudSecrets()) };
}

/** QR mode: point the linked device at the right chat and wire the reply handlers; reconnect a saved session. */
export async function ensureLinkedDevice() {
  const s = await getWaSettings();
  setNotifyTarget(s.notifyTo ? toWaDigits(s.notifyTo) : "");
  setWaHandlers({
    onIncoming: async (m) => {
      if (!m.allowed) return; // only messages in the staff chat count as replies
      await storeStaffReply({ waId: m.id, text: m.text, quotedId: m.quotedId });
    },
    onStatus: async (m) => updateDelivery(m.id, m.status),
  });
  const st = waState().status;
  if (s.mode === "qr" && st === "disconnected" && !booted.done && (await hasSavedSession())) {
    booted.done = true;
    await connectWhatsApp();
  }
}
const booted = { done: false };

export async function createConversation() {
  const db = getDb();
  if (!db) throw new Error("no database");
  const token = newToken();
  for (let i = 0; i < 4; i++) {
    const code = newCode();
    const exists = await db.chatConversation.findUnique({ where: { code }, select: { id: true } });
    if (exists) continue;
    const convo = await db.chatConversation.create({ data: { code, tokenHash: hashToken(token) } });
    return { convo, token };
  }
  throw new Error("could not create a chat");
}

/** Sends the copy of a visitor message to the staff WhatsApp chat and records the result on the message. */
export async function forwardToWhatsApp(messageId: string) {
  const db = getDb();
  if (!db) return;
  const msg = await db.chatMessage.findUnique({ where: { id: messageId }, include: { conversation: true } });
  if (!msg || msg.direction !== "IN") return;
  const c = msg.conversation;
  const text = `${siteConfig.name} website chat #${c.code}${c.name ? ` (${c.name})` : ""}\n\n${msg.body}\n\nReply to this message to answer the customer, or start your message with #${c.code}.`;
  const s = await getWaSettings();
  let result: { ok: true; id: string } | { ok: false; error: string };
  if (s.mode === "qr") {
    await ensureLinkedDevice();
    result = await sendViaLinkedDevice(text);
  } else if (s.mode === "cloud") {
    const creds = await getCloudSecrets();
    result = creds && s.notifyTo ? await sendViaCloud(creds, toWaDigits(s.notifyTo), text) : { ok: false, error: "The WhatsApp Cloud API is not set up." };
  } else {
    result = { ok: false, error: "The WhatsApp chat is switched off." };
  }
  await db.chatMessage.update({
    where: { id: msg.id },
    data: result.ok ? { status: "SENT", waMessageId: result.id, error: null } : { status: "FAILED", error: result.error },
  });
}

/** A staff answer from WhatsApp: matched by the quoted copy, or by a "#CODE" at the start. Duplicates are dropped. */
export async function storeStaffReply(m: { waId: string; text: string; quotedId: string | null }): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  if (await db.chatMessage.findUnique({ where: { waMessageId: m.waId }, select: { id: true } })) return false; // seen already (or our own copy)
  let conversationId: string | null = null;
  let text = m.text;
  if (m.quotedId) {
    const quoted = await db.chatMessage.findUnique({ where: { waMessageId: m.quotedId }, select: { conversationId: true, direction: true } });
    if (quoted?.direction === "IN") conversationId = quoted.conversationId;
  }
  const code = /^#([A-Z0-9]{5})\b[\s:,-]*/i.exec(text);
  if (!conversationId && code) {
    const c = await db.chatConversation.findUnique({ where: { code: code[1].toUpperCase() }, select: { id: true } });
    if (c) {
      conversationId = c.id;
      text = text.slice(code[0].length);
    }
  }
  text = text.trim().slice(0, 2000);
  if (!conversationId || !text) return false;
  try {
    await db.chatMessage.create({ data: { conversationId, direction: "OUT", body: text, status: "RECEIVED", source: "whatsapp", waMessageId: m.waId } });
    await db.chatConversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date() } });
    return true;
  } catch {
    return false; // the same WhatsApp message arrived twice at the same moment (unique waMessageId)
  }
}

const RANK: Record<string, number> = { PENDING: 0, FAILED: 0, SENT: 1, DELIVERED: 2, READ: 3 };
/** Delivery updates for the copies sent to WhatsApp; never moves a message backwards. */
export async function updateDelivery(waId: string, status: "SENT" | "DELIVERED" | "READ" | "FAILED") {
  const db = getDb();
  if (!db) return;
  const msg = await db.chatMessage.findUnique({ where: { waMessageId: waId }, select: { id: true, status: true, direction: true } });
  if (!msg || msg.direction !== "IN") return;
  if (status !== "FAILED" && (RANK[status] ?? 0) <= (RANK[msg.status] ?? 0)) return;
  await db.chatMessage.update({ where: { id: msg.id }, data: { status } });
}
