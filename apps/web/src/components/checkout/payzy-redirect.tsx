"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

/** Asks our server for a fresh Payzy attempt for this order, then sends the browser to Payzy. Throws a customer-safe message. */
export async function startPayzyRedirect(orderRef: string): Promise<void> {
  const res = await fetch("/api/payments/payzy/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderRef }) });
  const data = (await res.json().catch(() => null)) as { redirectUrl?: string; error?: { message?: string } } | null;
  if (!res.ok || !data?.redirectUrl) throw new Error(data?.error?.message ?? "We could not start the Payzy payment. Please try again.");
  window.location.href = data.redirectUrl;
}

export function RedirectingToPayzy() {
  return (
    <p role="status" className="flex items-center gap-2 text-sm font-semibold">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Redirecting to Payzy…
    </p>
  );
}

/** "Try Payzy again" on the result page: a new attempt with a new x_order_id. */
export function PayzyRetryButton({ orderRef }: { orderRef: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function go() {
    setBusy(true);
    setError(null);
    try {
      await startPayzyRedirect(orderRef);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
      setBusy(false);
    }
  }
  return (
    <div>
      <button type="button" className="btn-primary" onClick={go} disabled={busy}>
        {busy ? "Redirecting to Payzy…" : "Try Payzy again"}
      </button>
      {error && <p role="alert" className="field-error mt-2">{error}</p>}
    </div>
  );
}
