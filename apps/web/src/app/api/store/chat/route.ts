import { cookies } from "next/headers";
import { z } from "zod";
import { getCurrentCustomer } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { errorResponse, guard, json, readJson } from "@/lib/security/api";
import { chatStatus, createConversation, forwardToWhatsApp, hashToken } from "@/lib/whatsapp/relay";

export const dynamic = "force-dynamic";

const COOKIE = "volta_chat";
const MAX_AGE = 60 * 60 * 24 * 90; // 90 days

type Row = { id: string; direction: string; body: string; status: string; createdAt: Date };
const view = (m: Row) => ({ id: m.id, from: m.direction === "IN" ? "you" : "staff", body: m.body, status: m.status, at: m.createdAt.toISOString() });

/**
 * This visitor's chat. Signed in: the account's chat (on any device); a guest chat started in this browser before
 * signing in is joined to the account. Guest: only a chat that belongs to no account, so after signing out (or on a
 * shared computer) nobody sees the previous person's messages.
 */
async function current() {
  const db = getDb();
  if (!db) return { convo: null, customer: null };
  const customer = await getCurrentCustomer();
  const token = (await cookies()).get(COOKIE)?.value;
  const byCookie = token && token.length <= 100 ? await db.chatConversation.findUnique({ where: { tokenHash: hashToken(token) } }) : null;
  if (!customer) return { convo: byCookie && !byCookie.customerId ? byCookie : null, customer: null };
  const mine = await db.chatConversation.findFirst({ where: { customerId: customer.id }, orderBy: { lastMessageAt: "desc" } });
  if (mine) return { convo: mine, customer };
  if (byCookie && !byCookie.customerId) {
    const claimed = await db.chatConversation.update({ where: { id: byCookie.id }, data: { customerId: customer.id, name: customer.name, phone: customer.phone } });
    return { convo: claimed, customer };
  }
  return { convo: null, customer };
}

/** The visitor's own chat (found by its httpOnly cookie) and whether staff can be reached. Never another visitor's chat. */
export async function GET(req: Request) {
  const blocked = guard(req, { name: "chat-read", limit: 120, windowMs: 60_000 });
  if (blocked) return blocked;
  const status = await chatStatus().catch(() => ({ enabled: false, online: false }));
  const { convo } = await current();
  const db = getDb();
  const messages = convo && db ? await db.chatMessage.findMany({ where: { conversationId: convo.id }, orderBy: { createdAt: "asc" }, take: 200 }) : [];
  return json({ ...status, messages: messages.map(view) });
}

const body = z.object({
  body: z.string().trim().min(1).max(1000),
  /** A random id made in the browser for this message, so a double send is stored once. */
  clientId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
});

/** A visitor message: stored in the visitor's chat (started on the first message) and copied to the staff WhatsApp. */
export async function POST(req: Request) {
  const blocked = guard(req, { name: "chat-send", limit: 20, windowMs: 60_000, mutating: true });
  if (blocked) return blocked;
  const parsed = body.safeParse(await readJson(req, 4_000).catch(() => null));
  if (!parsed.success) return errorResponse(422, "INVALID", "Please type a message (up to 1000 characters).");
  const db = getDb();
  if (!db) return errorResponse(503, "NO_DATABASE", "Chat is not available right now.");
  const status = await chatStatus().catch(() => ({ enabled: false, online: false }));
  if (!status.enabled) return errorResponse(503, "CHAT_OFF", "Chat is not available right now.");

  const found = await current();
  let convo = found.convo;
  const customer = found.customer;
  let token: string | null = null;
  if (!convo) {
    const made = await createConversation(customer ? { customerId: customer.id, name: customer.name, phone: customer.phone } : undefined);
    convo = made.convo;
    token = made.token;
  } else if (customer && (convo.name !== customer.name || convo.phone !== customer.phone)) {
    // the account's name or phone changed since: staff see the current details
    convo = await db.chatConversation.update({ where: { id: convo.id }, data: { name: customer.name, phone: customer.phone } });
  }
  const key = { conversationId_clientId: { conversationId: convo.id, clientId: parsed.data.clientId } };
  // The same message sent twice (double tap, network retry) is stored and forwarded once.
  const existing = await db.chatMessage.findUnique({ where: key });
  let message = existing;
  if (!message) {
    try {
      message = await db.chatMessage.create({ data: { conversationId: convo.id, direction: "IN", body: parsed.data.body, clientId: parsed.data.clientId } });
    } catch {
      message = await db.chatMessage.findUnique({ where: key });
    }
    if (!message) return errorResponse(500, "SERVER_ERROR", "Could not send. Please try again.");
    await db.chatConversation.update({ where: { id: convo.id }, data: { lastMessageAt: new Date(), unread: { increment: 1 } } });
    await forwardToWhatsApp(message.id).catch(() => undefined);
    message = (await db.chatMessage.findUnique({ where: { id: message.id } })) ?? message;
  }
  const res = json({ message: view(message) }, existing ? 200 : 201);
  if (token) res.cookies.set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: MAX_AGE });
  return res;
}
