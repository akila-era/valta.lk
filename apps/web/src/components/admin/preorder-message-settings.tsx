"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

type Settings = { enabled: boolean; selected: number; templates: [string, string, string] };
const NAMES = ["Friendly", "Short", "Formal"];
const SAMPLE = { name: "Kasun", ref: "PRE-7K2QX9", product: "Volt 10000mAh Power Bank", qty: 1, store: "VOLTA.LK" };
const preview = (t: string) => t.replace(/\{(name|ref|product|qty|store)\}/g, (_, k: keyof typeof SAMPLE) => String(SAMPLE[k]));

/**
 * Admin, Pre-orders: the WhatsApp message a customer gets right after a pre-order. Three templates; staff pick one
 * (and can reword any of them). Sent from the store's linked WhatsApp (Admin, WhatsApp chat).
 */
export function PreorderMessageSettings({ chatMode }: { chatMode: "off" | "qr" | "cloud" }) {
  const [s, setS] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/admin/preorders/message", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setS(d))
      .catch(() => undefined);
  }, []);

  if (!s) return <p className="flex items-center gap-2 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading...</p>;

  const setTemplate = (i: number, v: string) => setS({ ...s, templates: s.templates.map((t, j) => (j === i ? v : t)) as Settings["templates"] });

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setNote(null);
        const res = await fetch("/api/admin/preorders/message", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s) }).catch(() => null);
        const out = await res?.json().catch(() => null);
        setBusy(false);
        setNote(res?.ok ? { ok: true, text: "Saved." } : { ok: false, text: out?.error?.message ?? "Could not save." });
      }}
    >
      <label className="flex items-center gap-2.5 text-sm font-medium text-ink">
        <input type="checkbox" className="check" checked={s.enabled} onChange={(e) => setS({ ...s, enabled: e.target.checked })} />
        Send the customer a WhatsApp message when they send a pre-order
      </label>
      {chatMode === "off" ? (
        <p className="rounded-card bg-warn-bg p-3 text-sm text-warn">WhatsApp is not connected yet, so nothing is sent. Connect it in Customers, WhatsApp Chat.</p>
      ) : chatMode === "cloud" ? (
        <p className="rounded-card bg-surface p-3 text-sm text-muted">Cloud API: WhatsApp only delivers this text if the customer wrote to your business number in the last 24 hours. Other messages are marked as not sent.</p>
      ) : (
        <p className="rounded-card bg-surface p-3 text-sm text-muted">Sent from your linked WhatsApp number. Messaging people who have not written to you first can make WhatsApp restrict the number, so keep the message short and useful.</p>
      )}

      <fieldset>
        <legend className="label">Template to use</legend>
        <div className="mt-1 grid gap-3 lg:grid-cols-3">
          {s.templates.map((t, i) => (
            <div key={i} className={`flex flex-col rounded-card border p-3 ${s.selected === i ? "border-ink bg-surface" : "border-border"}`}>
              <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-ink">
                <input type="radio" name="po-template" checked={s.selected === i} onChange={() => setS({ ...s, selected: i })} className="h-4 w-4" />
                Template {i + 1}: {NAMES[i]}
              </label>
              <label htmlFor={`po-t${i}`} className="sr-only">Template {i + 1} text</label>
              <textarea id={`po-t${i}`} rows={7} maxLength={1000} value={t} onChange={(e) => setTemplate(i, e.target.value)} className="input mt-2 min-h-32 flex-1 py-2 text-sm" />
              <p className="mt-2 text-xs font-semibold text-muted">Preview</p>
              <p className="mt-1 whitespace-pre-wrap rounded-control bg-[#fff3eb] p-2 text-xs text-ink">{preview(t)}</p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">You can use {"{name}"}, {"{ref}"}, {"{product}"}, {"{qty}"} and {"{store}"}; they are filled in for each pre-order.</p>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy} className="btn-primary min-h-10 px-5 text-sm">{busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null} Save</button>
        {note ? <p role={note.ok ? "status" : "alert"} className={`text-sm ${note.ok ? "text-ink" : "text-danger"}`}>{note.text}</p> : null}
      </div>
    </form>
  );
}

/** Admin, Pre-orders table: send the WhatsApp message again for one pre-order. */
export function ResendPreorderMessage({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch("/api/admin/preorders/message", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }).catch(() => null);
        setBusy(false);
        router.refresh();
      }}
      className="mt-1 text-xs font-semibold text-ink underline underline-offset-2 hover:text-brand-600 disabled:opacity-50"
    >
      {busy ? "Sending..." : "Send again"}
    </button>
  );
}
