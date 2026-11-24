import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { getDb } from "../db";
import { siteConfig } from "../site-config";
import { connectWhatsApp, hasSavedSession, sendViaLinkedDevice, setNotifyTarget, setWaHandlers, waState } from "./baileys";
import { sendViaCloud } from "./cloud";
import { getCloudSecrets, getWaSettings, toWaDigits } from "./settings";

/**
 * The website support chat. A visitor's message is stored, then a copy is sent to the staff WhatsApp chat with the
 * chat's code ("#K7P2Q"). A staff message in that WhatsApp chat is matched to a website chat by, in order: the copy it
 * replies to (WhatsApp "Reply"), a "#K7P2Q" at the start, or else the website chat that wrote most recently (within
 * a few hours). The visitor then sees the answer in the widget. Staff can also answer from the admin inbox.
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
      // Only messages in the staff chat count as replies. A Reply to one of the site's copies can only be made in
      // that chat, so it counts even if the chat's id could not be matched to the staff number.
      if (!m.allowed) {
        const quoted = m.quotedId ? await getDb()?.chatMessage.findUnique({ where: { waMessageId: m.quotedId }, select: { direction: true } }) : null;
        if (quoted?.direction !== "IN") return;
      }
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

export async function createConversation(owner?: { customerId: string; name: string; phone: string | null }) {
  const db = getDb();
  if (!db) throw new Error("no database");
  const token = newToken();
  for (let i = 0; i < 4; i++) {
    const code = newCode();
    const exists = await db.chatConversation.findUnique({ where: { code }, select: { id: true } });
    if (exists) continue;
    const convo = await db.chatConversation.create({ data: { code, tokenHash: hashToken(token), ...(owner ? { customerId: owner.customerId, name: owner.name, phone: owner.phone } : {}) } });
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
  // A signed-in customer's name and phone number (from their account) go at the top, so staff know who it is.
  const who = [c.name, c.phone].filter(Boolean).join(", ");
  const text = `${siteConfig.name} website chat #${c.code}${who ? ` (${who})` : " (guest)"}\n\n${msg.body}\n\nReply to this message (or just type) to answer this customer. With several chats open, use Reply or start with #${c.code}.`;
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

/** How long a plain (not quoted, no code) staff message still counts as an answer to the latest website chat. */
const LATEST_CHAT_WINDOW_MS = 6 * 60 * 60 * 1000;
const COPY_PREFIX = `${siteConfig.name} website chat #`;

/**
 * A staff answer from WhatsApp: matched by the quoted copy, by a "#CODE" at the start, or else to the website chat
 * that wrote most recently. Duplicates and the copies the site itself sent are dropped.
 */
export async function storeStaffReply(m: { waId: string; text: string; quotedId: string | null }): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  if (m.text.startsWith(COPY_PREFIX)) return false; // the site's own copy of a visitor message
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
  if (!conversationId) {
    // A plain message: it answers the website chat whose visitor wrote most recently (not too long ago).
    const last = await db.chatMessage.findFirst({
      where: { direction: "IN", createdAt: { gte: new Date(Date.now() - LATEST_CHAT_WINDOW_MS) } },
      orderBy: { createdAt: "desc" },
      select: { conversationId: true },
    });
    conversationId = last?.conversationId ?? null;
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
