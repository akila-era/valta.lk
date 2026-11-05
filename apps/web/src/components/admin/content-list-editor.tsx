"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from "lucide-react";

export interface ListField {
  key: string;
  label: string;
  /** "textarea" for longer text, "number" for a rating, otherwise one line. */
  type?: "text" | "textarea" | "number";
  hint?: string;
  optional?: boolean;
}

type Row = Record<string, string>;

/**
 * Admin: edit a list of items (FAQs, reviews, videos, Why Choose cards, strip items, popular searches) for one content
 * key: add, edit, reorder, remove, then Save. "Use the built-in text" removes the saved list so the site's default shows.
 */
export function ContentListEditor({
  contentKey,
  fields,
  initial,
  max,
  min = 0,
  title,
  isDefault,
  addLabel = "Add item",
  single = false,
}: {
  contentKey: string;
  fields: ListField[];
  initial: Row[];
  max: number;
  min?: number;
  /** An optional section title stored with the list ({ title, items }). */
  title?: { label: string; value: string };
  /** True while the site shows its built-in text (nothing saved yet). */
  isDefault: boolean;
  addLabel?: string;
  /** One item saved as the value itself (e.g. the first banner slide), not as { items }. */
  single?: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(initial);
  const [heading, setHeading] = useState(title?.value ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const blank = () => Object.fromEntries(fields.map((f) => [f.key, ""]));
  const set = (i: number, k: string, v: string) => setRows((r) => r.map((row, j) => (j === i ? { ...row, [k]: v } : row)));
  const move = (i: number, d: number) => setRows((r) => { const n = [...r]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x); return n; });

  async function send(value: unknown, done: string) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/content/${contentKey}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value }) });
      const out = await res.json().catch(() => null);
      if (!res.ok) setMsg({ ok: false, text: out?.error?.message ?? "Could not save." });
      else {
        setMsg({ ok: true, text: done });
        router.refresh();
      }
    } catch {
      setMsg({ ok: false, text: "Could not reach the server." });
    } finally {
      setBusy(false);
    }
  }

  const value = () => {
    const items = rows.map((r) =>
      Object.fromEntries(
        fields
          .map((f) => [f.key, f.type === "number" ? Number(r[f.key] || 0) : (r[f.key] ?? "").trim()] as const)
          .filter(([k, v]) => !(fields.find((f) => f.key === k)?.optional && v === "")),
      ),
    );
    if (single) return items[0];
    return title ? { title: heading.trim(), items } : { items };
  };

  return (
    <div className="space-y-4 text-sm">
      <p className="text-muted">{isDefault ? "The site shows its built-in text. Save to replace it with yours." : "The site shows the text saved here."}</p>
      {title ? (
        <div>
          <label className="label" htmlFor={`${contentKey}-title`}>{title.label}</label>
          <input id={`${contentKey}-title`} className="input" maxLength={80} value={heading} onChange={(e) => setHeading(e.target.value)} />
        </div>
      ) : null}
      <ol className="space-y-3">
        {rows.map((row, i) => (
          <li key={i} className="rounded-card border border-border p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="font-semibold text-ink">#{i + 1}</span>
              <span className="flex gap-1">
                <button type="button" className="btn-ghost min-h-8 px-2" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move item ${i + 1} up`}><ArrowUp className="h-4 w-4" aria-hidden /></button>
                <button type="button" className="btn-ghost min-h-8 px-2" disabled={i === rows.length - 1} onClick={() => move(i, 1)} aria-label={`Move item ${i + 1} down`}><ArrowDown className="h-4 w-4" aria-hidden /></button>
                <button type="button" className="btn-ghost min-h-8 px-2 text-danger" disabled={rows.length <= min} onClick={() => setRows((r) => r.filter((_, j) => j !== i))} aria-label={`Remove item ${i + 1}`}><Trash2 className="h-4 w-4" aria-hidden /></button>
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {fields.map((f) => {
                const id = `${contentKey}-${i}-${f.key}`;
                return (
                  <div key={f.key} className={f.type === "textarea" ? "sm:col-span-2" : ""}>
                    <label className="label" htmlFor={id}>{f.label}{f.optional ? " (optional)" : ""}</label>
                    {f.type === "textarea" ? (
                      <textarea id={id} rows={3} className="input min-h-20 py-2" value={row[f.key] ?? ""} onChange={(e) => set(i, f.key, e.target.value)} />
                    ) : (
                      <input id={id} type={f.type === "number" ? "number" : "text"} className="input" value={row[f.key] ?? ""} onChange={(e) => set(i, f.key, e.target.value)} />
                    )}
                    {f.hint ? <p className="mt-1 text-xs text-muted">{f.hint}</p> : null}
                  </div>
                );
              })}
            </div>
          </li>
        ))}
      </ol>
      {rows.length < max ? (
        <button type="button" className="btn-secondary min-h-10" onClick={() => setRows((r) => [...r, blank()])}>
          <Plus className="h-4 w-4" aria-hidden /> {addLabel}
        </button>
      ) : null}
      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <button type="button" disabled={busy} className="btn-primary min-h-11 min-w-28" onClick={() => void send(value(), "Saved. The site shows it within about 15 seconds.")}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null} Save
        </button>
        {!isDefault ? (
          <button type="button" disabled={busy} className="text-sm font-semibold text-muted hover:text-ink hover:underline" onClick={() => void send(null, "Back to the built-in text.")}>
            Use the built-in text
          </button>
        ) : null}
        {msg ? <p role="status" className={msg.ok ? "text-success" : "text-danger"}>{msg.text}</p> : null}
      </div>
    </div>
  );
}
