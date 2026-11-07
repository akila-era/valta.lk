"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, CheckCheck, Clock, SendHorizontal, X } from "lucide-react";
import { WhatsAppLottie } from "./whatsapp-lottie";

type Msg = { id: string; from: "you" | "staff"; body: string; status: string; at: string; clientId?: string };

const QUICK = ["Product information", "Order status", "Payment information", "Shipping information", "Contact support"];
const OPEN_POLL_MS = 4_000;
const CLOSED_POLL_MS = 20_000;

function WhatsAppGlyph({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={`fill-current ${className}`}>
      <path d="M16.04 3C9 3 3.3 8.7 3.3 15.73c0 2.25.59 4.45 1.71 6.39L3.2 29l7.05-1.78a12.7 12.7 0 0 0 5.79 1.47h.01c7.03 0 12.74-5.7 12.74-12.73 0-3.4-1.33-6.6-3.73-9A12.66 12.66 0 0 0 16.04 3Zm0 23.4h-.01a10.6 10.6 0 0 1-5.4-1.48l-.39-.23-4.18 1.06 1.12-4.07-.25-.42a10.57 10.57 0 0 1-1.62-5.53c0-5.84 4.75-10.6 10.6-10.6 2.83 0 5.49 1.1 7.49 3.11a10.53 10.53 0 0 1 3.1 7.5c0 5.85-4.76 10.6-10.46 10.6Zm5.81-7.94c-.32-.16-1.89-.93-2.18-1.04-.29-.11-.5-.16-.72.16-.21.32-.82 1.04-1 1.25-.19.21-.37.24-.69.08-.32-.16-1.34-.5-2.56-1.58-.95-.85-1.59-1.89-1.77-2.21-.19-.32-.02-.49.14-.65.14-.14.32-.37.48-.56.16-.19.21-.32.32-.53.11-.21.05-.4-.03-.56-.08-.16-.72-1.73-.98-2.37-.26-.62-.52-.54-.72-.55h-.61c-.21 0-.56.08-.85.4-.29.32-1.11 1.09-1.11 2.66 0 1.57 1.14 3.08 1.3 3.3.16.21 2.24 3.42 5.43 4.8.76.33 1.35.52 1.81.67.76.24 1.45.21 2 .13.61-.09 1.89-.77 2.15-1.52.27-.75.27-1.39.19-1.52-.08-.13-.29-.21-.61-.37Z" />
    </svg>
  );
}

const newClientId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().replace(/-/g, "") : `${Date.now()}${Math.random().toString(36).slice(2, 12)}`);
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-LK", { hour: "numeric", minute: "2-digit" });

/** Delivery state of a visitor message, as in WhatsApp: clock, one tick, two ticks, blue ticks; or a failure note. */
function Ticks({ status }: { status: string }) {
  const icon =
    status === "PENDING" ? { label: "Sending", el: <Clock className="h-3.5 w-3.5" aria-hidden /> }
    : status === "SENT" ? { label: "Sent", el: <Check className="h-3.5 w-3.5" aria-hidden /> }
    : status === "DELIVERED" ? { label: "Delivered", el: <CheckCheck className="h-3.5 w-3.5" aria-hidden /> }
    : status === "READ" ? { label: "Read", el: <CheckCheck className="h-3.5 w-3.5 text-brand-500" aria-hidden /> }
    : null;
  if (!icon) return null;
  return (
    <span role="img" aria-label={icon.label} className="inline-flex">
      {icon.el}
    </span>
  );
}

/**
 * The floating "WhatsApp Support" chat (bottom right). Messages are typed here, on the site: they are delivered to the
 * store's WhatsApp, and staff answers appear in this window. The chat belongs to this browser only (an httpOnly
 * cookie); nothing opens WhatsApp or another site.
 */
export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [online, setOnline] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [seenStaff, setSeenStaff] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/store/chat", { cache: "no-store" });
      if (!res.ok) return;
      const d = (await res.json()) as { online: boolean; messages: Msg[] };
      setOnline(d.online);
      setMessages((cur) => {
        // keep messages still on their way to the server
        const pending = cur.filter((m) => m.status === "PENDING" && m.clientId && !d.messages.some((x) => x.body === m.body && x.from === "you" && Math.abs(Date.parse(x.at) - Date.parse(m.at)) < 60_000));
        return [...d.messages, ...pending];
      });
    } catch {
      /* offline: try again on the next round */
    }
  }, []);

  // Poll: often while open, slowly while closed (only once a chat exists), to show new answers.
  useEffect(() => {
    const first = setTimeout(load, open ? 0 : 1500);
    const every = open || messages.length ? (open ? OPEN_POLL_MS : CLOSED_POLL_MS) : 0;
    const timer = every ? setInterval(load, every) : undefined;
    return () => {
      clearTimeout(first);
      if (timer) clearInterval(timer);
    };
  }, [open, load, messages.length]);

  const staffCount = messages.filter((m) => m.from === "staff").length;
  const unread = open ? 0 : Math.max(0, staffCount - seenStaff);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      setSeenStaff(staffCount);
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    }, 0);
    return () => clearTimeout(t);
  }, [open, staffCount, messages.length]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const send = async (raw: string) => {
    const body = raw.trim().slice(0, 1000);
    if (!body) return;
    const clientId = newClientId();
    const local: Msg = { id: `local-${clientId}`, from: "you", body, status: "PENDING", at: new Date().toISOString(), clientId };
    setMessages((m) => [...m, local]);
    setText("");
    setError("");
    try {
      const res = await fetch("/api/store/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body, clientId }) });
      const out = await res.json().catch(() => null);
      if (!res.ok || !out?.message) {
        setMessages((m) => m.filter((x) => x.id !== local.id));
        setText(body);
        setError(out?.error?.message ?? "Could not send. Please try again.");
        return;
      }
      setMessages((m) => m.map((x) => (x.id === local.id ? { ...out.message, clientId } : x)));
    } catch {
      setMessages((m) => m.filter((x) => x.id !== local.id));
      setText(body);
      setError("No connection. Please try again.");
    }
  };

  const sentAny = messages.some((m) => m.from === "you");

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="wa-chat"
        aria-label={open ? "Close WhatsApp support chat" : "Open WhatsApp support chat"}
        className={`wa-float fixed right-5 z-30 flex items-center justify-center transition-[transform,bottom] duration-200 hover:scale-105 motion-reduce:transition-none sm:right-8 ${open ? "h-13 w-13 rounded-full bg-[#fe752d] text-on-brand shadow-[0_8px_24px_-8px_rgb(0_0_0/0.45)] hover:bg-ink hover:text-white" : "h-[6.25rem] w-[7.5rem]"}`}
      >
        {open ? <X className="h-6 w-6" aria-hidden /> : <WhatsAppLottie className="h-full w-full drop-shadow-[0_6px_10px_rgb(0_0_0/0.25)]" />}
        {unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#b42318] px-1 text-[11px] font-bold text-white">
            {unread}
            <span className="sr-only"> new {unread === 1 ? "reply" : "replies"}</span>
          </span>
        ) : null}
      </button>

      {open ? (
        <section
          id="wa-chat"
          role="dialog"
          aria-label="WhatsApp Support"
          className="fixed inset-x-0 bottom-0 z-[60] flex h-[min(88svh,36rem)] flex-col overflow-hidden rounded-t-2xl bg-white shadow-[0_-10px_40px_-12px_rgb(0_0_0/0.4)] sm:inset-x-auto sm:bottom-24 sm:right-5 sm:h-[min(34rem,calc(100svh-8rem))] sm:w-[23rem] sm:rounded-2xl sm:shadow-[0_18px_50px_-14px_rgb(0_0_0/0.45)]"
        >
          <header className="flex items-center gap-3 bg-ink px-4 py-3 text-white">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#fe752d] text-on-brand">
              <WhatsAppGlyph className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-bold leading-tight">WhatsApp Support</p>
              <p className="flex items-center gap-1.5 text-xs text-white/85" aria-live="polite">
                <span aria-hidden className={`h-2 w-2 rounded-full ${online ? "bg-[#4ade80]" : "bg-white/50"}`} />
                {online === null ? "Connecting..." : online ? "Online" : "Offline"}
              </p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close chat" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/15">
              <X className="h-5 w-5" aria-hidden />
            </button>
          </header>

          <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto bg-surface px-3 py-4" aria-live="polite">
            <div className="max-w-[85%] rounded-xl rounded-tl-none border border-border bg-white px-3 py-2 text-sm text-ink">
              Hello! Welcome to VOLTA.LK. How can we help you today?
              {online === false ? <span className="mt-1 block text-xs text-muted">We are offline right now. Leave a message and we will reply here.</span> : null}
            </div>

            {!sentAny ? (
              <div className="flex flex-wrap gap-2 pt-1" role="group" aria-label="Quick questions">
                {QUICK.map((q) => (
                  <button key={q} type="button" onClick={() => send(q)} className="min-h-9 rounded-full border border-brand-500/60 bg-white px-3 text-[13px] font-medium text-ink hover:border-brand-500 hover:bg-brand-500 hover:text-on-brand">
                    {q}
                  </button>
                ))}
              </div>
            ) : null}

            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.from === "you" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-xl px-3 py-1.5 text-sm text-ink ${m.from === "you" ? "rounded-tr-none border border-[#f2c5b3] bg-[#fff3eb]" : "rounded-tl-none border border-border bg-white"}`}>
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <p className="mt-0.5 flex items-center justify-end gap-1 text-[11px] text-muted">
                    {time(m.at)}
                    {m.from === "you" ? <Ticks status={m.status} /> : null}
                  </p>
                  {m.from === "you" && m.status === "FAILED" ? (
                    <p className="mt-0.5 text-[11px] font-medium text-danger">Not delivered to WhatsApp. Our team will still see it here.</p>
                  ) : null}
                </div>
              </div>
            ))}
          </div>

          <form
            className="flex items-end gap-2 border-t border-border bg-white px-3 py-2.5"
            onSubmit={(e) => {
              e.preventDefault();
              send(text);
            }}
          >
            <label htmlFor="wa-chat-input" className="sr-only">Type a message</label>
            <textarea
              id="wa-chat-input"
              ref={inputRef}
              rows={1}
              value={text}
              maxLength={1000}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(text);
                }
              }}
              placeholder="Type a message"
              className="max-h-28 min-h-11 flex-1 resize-none rounded-3xl border border-border bg-surface px-4 py-3 text-[15px] text-ink outline-none placeholder:text-muted focus-visible:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/30"
            />
            <button type="submit" disabled={!text.trim()} aria-label="Send" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#fe752d] text-on-brand hover:bg-ink hover:text-white disabled:opacity-50">
              <SendHorizontal className="h-5 w-5" aria-hidden />
            </button>
          </form>
          {error ? <p role="alert" className="bg-white px-4 pb-2 text-xs font-medium text-danger">{error}</p> : null}
        </section>
      ) : null}
    </>
  );
}
