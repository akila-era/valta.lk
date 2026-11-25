"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { cartActions } from "@/store/cart";

/** Posts the fields to Koko as a real form. Values are set through the DOM (never string-built), so they are escaped. */
export function submitKokoForm(action: string, fields: Record<string, string>) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = action;
  form.style.display = "none";
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}

/** Asks our server for a fresh Koko attempt for this order, then sends the browser to Koko. Throws a customer-safe message. */
export async function startKokoRedirect(orderRef: string): Promise<void> {
  const res = await fetch("/api/payments/koko/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderRef }) });
  const data = (await res.json().catch(() => null)) as { action?: string; fields?: Record<string, string>; error?: { message?: string } } | null;
  if (!res.ok || !data?.action || !data.fields) throw new Error(data?.error?.message ?? "We could not start the Koko payment. Please try again.");
  submitKokoForm(data.action, data.fields);
}

export function RedirectingToKoko() {
  return (
    <p role="status" className="flex items-center gap-2 text-sm font-semibold">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Redirecting to Koko…
    </p>
  );
}

/** "Try again with Koko" on the result page: a new attempt with a new Koko order id. */
export function KokoRetryButton({ orderRef }: { orderRef: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function go() {
    setBusy(true);
    setError(null);
    try {
      await startKokoRedirect(orderRef);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
      setBusy(false);
    }
  }
  return (
    <div>
      <button type="button" className="btn-primary" onClick={go} disabled={busy}>
        {busy ? "Redirecting to Koko…" : "Try Koko again"}
      </button>
      {error && <p role="alert" className="field-error mt-2">{error}</p>}
    </div>
  );
}

/** Refreshes the server-rendered result page while the payment is still being confirmed, for about a minute. */
export function PollWhilePending({ maxTries = 20, everyMs = 3000 }: { maxTries?: number; everyMs?: number }) {
  const router = useRouter();
  const tries = useRef(0);
  const [gaveUp, setGaveUp] = useState(false);
  useEffect(() => {
    const id = setInterval(() => {
      tries.current += 1;
      if (tries.current > maxTries) {
        clearInterval(id);
        setGaveUp(true);
        return;
      }
      router.refresh();
    }, everyMs);
    return () => clearInterval(id);
  }, [router, maxTries, everyMs]);
  return gaveUp ? (
    <p className="mt-3 text-sm text-muted">This is taking longer than usual. You do not need to pay again: we will update your order as soon as Koko confirms. You can safely close this page.</p>
  ) : (
    <Loader2 className="mx-auto mt-4 h-5 w-5 animate-spin text-muted" aria-hidden />
  );
}

/** The cart is only emptied once the payment is confirmed, so a cancelled or failed payment keeps it. */
export function ClearCartOnPaid() {
  useEffect(() => {
    cartActions.clear();
    try {
      window.sessionStorage.removeItem("valta.checkout.ref");
      window.sessionStorage.removeItem("valta.checkout.ref.koko");
    } catch {
      /* ignore */
    }
  }, []);
  return null;
}
