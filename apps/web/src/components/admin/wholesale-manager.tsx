"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Building2, Download, Mail, MapPin, Phone, Trash2 } from "lucide-react";
import { STATUSES, STATUS_LABEL, type WholesaleStatus } from "@/lib/wholesale-shared";

export interface ApplicationRow {
  id: string;
  receivedAt: string;
  status: WholesaleStatus;
  business: string;
  name: string;
  email: string;
  phone: string;
  type: string;
  district: string;
  message: string;
}

const TONE: Record<WholesaleStatus, string> = {
  new: "bg-brand-50 text-brand-700 ring-brand-100",
  contacted: "bg-info-bg text-info ring-border",
  approved: "bg-success-bg text-success ring-success/20",
  declined: "bg-danger-bg text-danger ring-danger/20",
};

/** Wholesale registrations: filter by status, change the status as you follow each one up, delete, or download a CSV. */
export function WholesaleManager({ rows, total }: { rows: ApplicationRow[]; total: number }) {
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | WholesaleStatus>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const counts = Object.fromEntries(STATUSES.map((s) => [s, rows.filter((r) => r.status === s).length])) as Record<WholesaleStatus, number>;
  const shown = filter === "all" ? rows : rows.filter((r) => r.status === filter);

  async function call(method: string, id: string, body: object) {
    setBusy(id);
    setError(null);
    const res = await fetch("/api/admin/wholesale", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...body }) }).catch(() => null);
    setBusy(null);
    if (!res?.ok) return setError("Could not save that change.");
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          <b className="text-ink">{total}</b> {total === 1 ? "registration" : "registrations"} from the Wholesale page. Contact each one on the phone or email they gave, then set its status so you know where it stands.
        </p>
        <a href="/api/admin/wholesale" className="btn-secondary" download>
          <Download className="h-4 w-4" aria-hidden /> Download CSV
        </a>
      </div>

      <div role="tablist" aria-label="Filter by status" className="flex flex-wrap gap-2">
        {(["all", ...STATUSES] as const).map((s) => (
          <button
            key={s}
            role="tab"
            type="button"
            aria-selected={filter === s}
            onClick={() => setFilter(s)}
            className={`min-h-10 rounded-full border px-4 text-sm font-semibold transition-colors ${filter === s ? "border-ink bg-ink text-white" : "border-border hover:border-ink"}`}
          >
            {s === "all" ? "All" : STATUS_LABEL[s]} <span className={filter === s ? "text-white/70" : "text-muted"}>{s === "all" ? rows.length : counts[s]}</span>
          </button>
        ))}
      </div>

      {error && <p role="alert" className="rounded-lg bg-danger-bg p-3 text-sm text-danger">{error}</p>}

      {shown.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted">{rows.length === 0 ? "No registrations yet." : "Nothing with this status."}</p>
      ) : (
        <ul className="space-y-3">
          {shown.map((r) => (
            <li key={r.id} className="card p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-base font-semibold"><Building2 className="h-4 w-4 shrink-0 text-brand-600" aria-hidden /> <span className="truncate">{r.business}</span></p>
                  <p className="mt-0.5 text-sm text-muted">
                    {r.name}
                    {r.type ? ` · ${r.type}` : ""} · {new Date(r.receivedAt).toLocaleString("en-LK", { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                </div>
                <span className={`badge ring-1 ${TONE[r.status]}`}>{STATUS_LABEL[r.status]}</span>
              </div>
              <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5 text-sm">
                <li className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted" aria-hidden /><a className="font-medium hover:underline" href={`tel:${r.phone.replace(/\s/g, "")}`}>{r.phone}</a></li>
                <li className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted" aria-hidden /><a className="font-medium hover:underline" href={`mailto:${r.email}`}>{r.email}</a></li>
                {r.district && <li className="flex items-center gap-2"><MapPin className="h-4 w-4 text-muted" aria-hidden />{r.district}</li>}
              </ul>
              {r.message && <p className="mt-3 whitespace-pre-line rounded-lg bg-surface p-3 text-sm leading-6">{r.message}</p>}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <label htmlFor={`st-${r.id}`} className="text-sm text-muted">Status</label>
                <select id={`st-${r.id}`} className="select min-h-10 w-auto text-sm" value={r.status} disabled={busy === r.id} onChange={(e) => void call("PATCH", r.id, { status: e.target.value })}>
                  {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                </select>
                <button type="button" className="btn-ghost ml-auto min-h-10 px-3 text-sm text-danger" disabled={busy === r.id} onClick={() => window.confirm(`Delete the registration from ${r.business}?`) && void call("DELETE", r.id, {})}>
                  <Trash2 className="h-4 w-4" aria-hidden /> Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
