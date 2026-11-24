"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const NEXT: Record<string, { to: string; label: string }[]> = {
  NEW: [{ to: "CONTACTED", label: "Mark contacted" }, { to: "CLOSED", label: "Close" }],
  CONTACTED: [{ to: "CLOSED", label: "Close" }, { to: "NEW", label: "Mark as new" }],
  CLOSED: [{ to: "NEW", label: "Reopen" }],
};

/** Admin: move one pre-order request between New, Contacted and Closed. */
export function PreorderStatus({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {(NEXT[status] ?? NEXT.NEW).map((n, i) => (
        <button
          key={n.to}
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await fetch(`/api/admin/preorders/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: n.to }) }).catch(() => null);
            setBusy(false);
            router.refresh();
          }}
          className={i === 0 ? "btn-primary min-h-8 px-3 text-xs" : "btn-secondary min-h-8 px-3 text-xs"}
        >
          {n.label}
        </button>
      ))}
    </div>
  );
}
