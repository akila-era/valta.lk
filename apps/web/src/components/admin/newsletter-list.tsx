"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Download, Trash2 } from "lucide-react";

export interface SubscriberRow {
  id: string;
  email: string;
  createdAt: string;
}

/** Newsletter subscribers: total, CSV download and removal of one address (for example when someone asks to be removed). */
export function NewsletterList({ rows, total }: { rows: SubscriberRow[]; total: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove(r: SubscriberRow) {
    if (!window.confirm(`Remove ${r.email} from the list?`)) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/newsletter", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: r.id }) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setError("Could not remove it.");
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          <b className="text-ink">{total}</b> {total === 1 ? "subscriber" : "subscribers"}. Addresses come from the newsletter box on the homepage. Only the email and the sign-up time are stored.
        </p>
        <a href="/api/admin/newsletter" className="btn-secondary" download>
          <Download className="h-4 w-4" aria-hidden /> Download CSV
        </a>
      </div>
      {error && <p role="alert" className="rounded-lg bg-danger-bg p-3 text-sm text-danger">{error}</p>}
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted">No subscribers yet.</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 p-3">
              <span className="min-w-0 flex-1 truncate font-medium">{r.email}</span>
              <span className="shrink-0 text-xs text-muted">{new Date(r.createdAt).toLocaleDateString("en-LK", { dateStyle: "medium" })}</span>
              <button type="button" className="btn-ghost min-h-11 min-w-11 px-2 text-danger" aria-label={`Remove ${r.email}`} disabled={busy} onClick={() => remove(r)}>
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      {total > rows.length && <p className="text-xs text-muted">Showing the latest {rows.length}. The CSV has everyone.</p>}
    </div>
  );
}
