"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Trash2, X } from "lucide-react";

type Status = "PENDING" | "APPROVED" | "REJECTED";

/** Approve, reject (or move back) and delete one review, then refresh the list. */
export function ReviewActions({ id, status }: { id: string; status: Status }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(method: "PATCH" | "DELETE", body: Record<string, string>) {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/reviews", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    setBusy(false);
    if (res?.ok) router.refresh();
    else setError("Could not save. Try again.");
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {status !== "APPROVED" ? (
        <button type="button" disabled={busy} className="btn-primary min-h-9 px-3 text-xs" onClick={() => void send("PATCH", { id, status: "APPROVED" })}>
          <Check className="h-3.5 w-3.5" aria-hidden /> Approve
        </button>
      ) : null}
      {status !== "REJECTED" ? (
        <button type="button" disabled={busy} className="btn-secondary min-h-9 px-3 text-xs" onClick={() => void send("PATCH", { id, status: "REJECTED" })}>
          <X className="h-3.5 w-3.5" aria-hidden /> {status === "APPROVED" ? "Hide" : "Reject"}
        </button>
      ) : null}
      <button
        type="button"
        disabled={busy}
        aria-label="Delete review"
        className="btn-ghost h-9 min-h-0 w-9 px-0 text-danger"
        onClick={() => {
          if (window.confirm("Delete this review for good?")) void send("DELETE", { id });
        }}
      >
        <Trash2 className="h-4 w-4" aria-hidden />
      </button>
      {error ? <p role="alert" className="w-full text-right text-xs text-danger">{error}</p> : null}
    </div>
  );
}
