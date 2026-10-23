"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";

/** Asks the server to send the order to the ERP again. Safe to press repeatedly: the ERP never duplicates an order. */
export function RetryButton({ orderRef }: { orderRef: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const inflight = useRef(false);

  async function retry() {
    if (inflight.current) return;
    inflight.current = true;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderRef}/retry`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setMsg({ ok: false, text: data.error?.message ?? "Retry failed." });
      else if (data.result === "synced") setMsg({ ok: true, text: "Order is now in the ERP." });
      else setMsg({ ok: false, text: data.sync?.lastError ? `Still not sent: ${data.sync.lastError}` : "Still not sent. It will keep retrying automatically." });
      router.refresh();
    } catch {
      setMsg({ ok: false, text: "Could not reach the server." });
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={retry} disabled={busy} className="btn-secondary min-h-10 gap-2 px-4 text-sm">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
        Retry sync to ERP
      </button>
      {msg && (
        <p role="status" className={`mt-2 text-sm ${msg.ok ? "text-success" : "text-danger"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
