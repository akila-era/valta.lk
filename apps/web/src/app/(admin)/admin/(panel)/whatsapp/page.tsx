import type { Metadata } from "next";
import Link from "next/link";
import { ChatReply } from "@/components/admin/chat-reply";
import { PreorderMessageSettings } from "@/components/admin/preorder-message-settings";
import { Empty, ErrorNote, PageHeader, Panel } from "@/components/admin/ui";
import { WhatsAppConnection } from "@/components/admin/whatsapp-connection";
import { adminGate } from "@/lib/admin/gate";
import { getDb } from "@/lib/db";
import { getWaSettings, toWaDigits } from "@/lib/whatsapp/settings";

export const metadata: Metadata = { title: "WhatsApp Chat" };
export const dynamic = "force-dynamic";

const STATUS_TEXT: Record<string, string> = { PENDING: "Sending", SENT: "Sent to WhatsApp", DELIVERED: "Delivered", READ: "Read", FAILED: "Not delivered to WhatsApp" };
const when = (d: Date) => d.toLocaleString("en-LK", { dateStyle: "medium", timeStyle: "short" });

/** Admin: the WhatsApp connection (QR linking or Cloud API) and the inbox of website chats, newest first. */
export default async function WhatsAppPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const denied = await adminGate("/admin/whatsapp");
  if (denied) return denied;
  const sp = await searchParams;
  const db = getDb();
  const header = <PageHeader title="WhatsApp Chat" subtitle="Website visitors chat from the WhatsApp Support window. Their messages are sent to your WhatsApp; reply there (or here) and the visitor sees the answer on the site." />;
  if (!db) return (<>{header}<ErrorNote>The website database is not configured.</ErrorNote></>);

  const chats = await db.chatConversation.findMany({ orderBy: { lastMessageAt: "desc" }, take: 50, include: { messages: { orderBy: { createdAt: "desc" }, take: 1 } } });
  const openId = sp.c && chats.some((c) => c.id === sp.c) ? sp.c : undefined;
  const open = openId ? await db.chatConversation.findUnique({ where: { id: openId }, include: { messages: { orderBy: { createdAt: "asc" }, take: 300 } } }) : null;
  const wa = await getWaSettings().catch(() => null);
  if (open && open.unread > 0) await db.chatConversation.update({ where: { id: open.id }, data: { unread: 0 } }).catch(() => undefined);

  return (
    <>
      {header}
      <Panel title="Connection" className="mb-5">
        <WhatsAppConnection />
      </Panel>
      <Panel title="Pre-order message to the customer (WhatsApp)" className="mb-5" id="preorder-message">
        <PreorderMessageSettings chatMode={wa?.mode ?? "off"} />
      </Panel>
      <Panel title="Chats">
        {chats.length === 0 ? (
          <Empty>No chats yet. They appear here when a visitor sends a message from the WhatsApp Support window.</Empty>
        ) : (
          <div className="grid min-h-[28rem] gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
            <ul aria-label="Chats" className="divide-y divide-border overflow-hidden rounded-card border border-border">
              {chats.map((c) => {
                const last = c.messages[0];
                return (
                  <li key={c.id}>
                    <Link href={`/admin/whatsapp?c=${c.id}`} aria-current={c.id === openId ? "page" : undefined} className={`block px-3 py-2.5 hover:bg-surface ${c.id === openId ? "bg-surface" : ""}`}>
                      <span className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-sm font-bold text-ink">{c.name ?? "Guest"} <span className="font-mono font-semibold text-muted">#{c.code}</span></span>
                        {c.unread > 0 && c.id !== openId ? <span className="badge bg-brand-500 text-on-brand">{c.unread} new</span> : <span className="text-xs text-muted">{when(c.lastMessageAt)}</span>}
                      </span>
                      <span className="mt-0.5 block truncate text-sm text-muted">{last ? `${last.direction === "IN" ? "" : "You: "}${last.body}` : "-"}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            {open ? (
              <section aria-label={`Chat #${open.code}`} className="flex flex-col overflow-hidden rounded-card border border-border">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5 text-sm">
                  <p className="font-semibold text-ink">
                    {open.name ?? "Guest"} <span className="font-mono text-muted">#{open.code}</span>
                    <span className="font-normal text-muted"> · started {when(open.createdAt)}{open.customerId ? " · signed-in customer" : ""}</span>
                  </p>
                  {open.phone ? (
                    <span className="flex items-center gap-3">
                      <a href={`tel:${open.phone.replace(/[^\d+]/g, "")}`} className="text-muted hover:underline">{open.phone}</a>
                      <a href={`https://wa.me/${toWaDigits(open.phone)}`} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#128c4a] hover:underline">Open in WhatsApp</a>
                    </span>
                  ) : null}
                </div>
                <div className="flex-1 space-y-2 overflow-y-auto bg-surface p-4">
                  {open.messages.map((m) => (
                    <div key={m.id} className={`flex ${m.direction === "IN" ? "justify-start" : "justify-end"}`}>
                      <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${m.direction === "IN" ? "bg-white" : "bg-[#d9fdd3]"}`}>
                        <p className="whitespace-pre-wrap break-words text-ink">{m.body}</p>
                        <p className="mt-1 text-[11px] text-muted">
                          {when(m.createdAt)} · {m.direction === "IN" ? STATUS_TEXT[m.status] ?? m.status : m.source === "whatsapp" ? "Replied on WhatsApp" : "Replied here"}
                          {m.direction === "IN" && m.status === "FAILED" && m.error ? ` (${m.error})` : ""}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                <ChatReply id={open.id} />
              </section>
            ) : (
              <p className="flex items-center justify-center rounded-card border border-dashed border-border p-6 text-sm text-muted">Choose a chat to read and reply.</p>
            )}
          </div>
        )}
      </Panel>
    </>
  );
}
