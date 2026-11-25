"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Manual reconciliation for a PENDING Payzy attempt, after checking the Payzy merchant portal. */
export function PayzyAttemptActions({ payzyOrderId }: { payzyOrderId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function settle(outcome: "PAID" | "FAILED") {
    const msg = outcome === "PAID"
      ? `Mark ${payzyOrderId} as PAID? Only do this if you saw the successful payment in the Payzy merchant portal. The order will be released to the ERP.`
      : `Mark ${payzyOrderId} as FAILED? Only do this if Payzy shows no successful payment.`;
    if (!window.confirm(msg)) return;
    setBusy(true);
    setError(null);
    const r = await fetch("/api/admin/payzy-attempts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ payzyOrderId, outcome }) }).catch(() => null);
    setBusy(false);
    if (r?.ok) router.refresh();
    else setError(((await r?.json().catch(() => null)) as { error?: { message?: string } } | null)?.error?.message ?? "That did not work.");
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button type="button" className="btn-secondary min-h-9 px-3 text-xs" disabled={busy} onClick={() => settle("PAID")}>Mark paid</button>
      <button type="button" className="btn-ghost min-h-9 px-3 text-xs text-danger" disabled={busy} onClick={() => settle("FAILED")}>Mark failed</button>
      {error && <span role="alert" className="text-xs text-danger">{error}</span>}
    </span>
  );
}
