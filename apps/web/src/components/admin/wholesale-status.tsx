"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Admin: one wholesale application's status, NEW or CONTACTED, switched with one button. */
export function WholesaleStatus({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const contacted = status === "CONTACTED";
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch(`/api/admin/wholesale/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: contacted ? "NEW" : "CONTACTED" }) }).catch(() => null);
        setBusy(false);
        router.refresh();
      }}
      className={contacted ? "btn-secondary min-h-8 px-3 text-xs" : "btn-primary min-h-8 px-3 text-xs"}
    >
      {contacted ? "Mark as new" : "Mark contacted"}
    </button>
  );
}
