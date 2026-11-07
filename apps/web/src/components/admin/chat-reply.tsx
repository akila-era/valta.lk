"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2, SendHorizontal } from "lucide-react";

/** Admin inbox: refreshes the open chat every few seconds and sends a reply that the visitor sees in the chat window. */
export function ChatReply({ id }: { id: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const t = setInterval(() => router.refresh(), 5_000);
    return () => clearInterval(t);
  }, [router]);

  return (
    <form
      className="flex items-end gap-2 border-t border-border p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!text.trim()) return;
        setBusy(true);
        setError("");
        const res = await fetch(`/api/admin/chats/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: text }) }).catch(() => null);
        const out = await res?.json().catch(() => null);
        setBusy(false);
        if (!res?.ok) return setError(out?.error?.message ?? "Could not send.");
        setText("");
        router.refresh();
      }}
    >
      <label htmlFor="chat-reply" className="sr-only">Reply</label>
      <textarea id="chat-reply" rows={2} value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} placeholder="Type a reply" className="input min-h-11 flex-1 resize-y py-2" />
      <button type="submit" disabled={busy || !text.trim()} className="btn-primary min-h-11 px-4 text-sm">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <SendHorizontal className="h-4 w-4" aria-hidden />} Send
      </button>
      {error ? <p role="alert" className="field-error">{error}</p> : null}
    </form>
  );
}
