"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";

/** Asks Koko (orderView) about this order's unfinished payment attempts. Safe to press repeatedly. */
export function KokoRecheckButton({ orderRef }: { orderRef: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const inflight = useRef(false);

  async function recheck() {
    if (inflight.current) return;
    inflight.current = true;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderRef}/koko-recheck`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setMsg({ ok: false, text: data.error?.message ?? "Recheck failed." });
      else if (data.order?.paymentStatus === "PAID") setMsg({ ok: true, text: "Koko confirms this order is paid." });
      else setMsg({ ok: false, text: "Koko has not confirmed a payment for this order yet." });
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
      <button type="button" onClick={recheck} disabled={busy} className="btn-secondary min-h-10 gap-2 px-4 text-sm">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
        Recheck Koko status
      </button>
      {msg && (
        <p role="status" className={`mt-2 text-sm ${msg.ok ? "text-success" : "text-danger"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
