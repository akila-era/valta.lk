import { z } from "zod";
import { requireAdmin } from "@/lib/admin/auth";
import { getDb } from "@/lib/db";
import { errorResponse, guard, json, readJson } from "@/lib/security/api";

export const dynamic = "force-dynamic";

const body = z.object({ body: z.string().trim().min(1).max(2000) });

/** Admin only: answer a website chat from the admin inbox (the visitor sees it in the chat window). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = guard(req, { name: "admin-chat", limit: 60, windowMs: 60_000, mutating: true });
  if (blocked) return blocked;
  const access = await requireAdmin();
  if (access.kind === "signed-out") return errorResponse(401, "SIGNED_OUT", "Please sign in.");
  if (access.kind === "forbidden") return errorResponse(403, "FORBIDDEN", "You do not have access to this action.");
  const parsed = body.safeParse(await readJson(req, 6_000).catch(() => null));
  if (!parsed.success) return errorResponse(422, "INVALID", "Please type a reply.");
  const db = getDb();
  if (!db) return errorResponse(503, "NO_DATABASE", "Website database is not configured.");
  const { id } = await params;
  const convo = await db.chatConversation.findUnique({ where: { id: id.slice(0, 40) }, select: { id: true } });
  if (!convo) return errorResponse(404, "NOT_FOUND", "That chat no longer exists.");
  await db.chatMessage.create({ data: { conversationId: convo.id, direction: "OUT", body: parsed.data.body, status: "RECEIVED", source: "web" } });
  await db.chatConversation.update({ where: { id: convo.id }, data: { lastMessageAt: new Date(), unread: 0 } });
  return json({ ok: true }, 201);
}
