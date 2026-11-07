"use client";

import { useState } from "react";
import { CalendarClock, Loader2, MessageCircle } from "lucide-react";

/**
 * Pre-order for a product that is out of stock. The request is stored for staff; it is not an ERP order and nothing is
 * paid online. Staff confirm the payment and the order with the customer on WhatsApp (or by phone). After sending, the
 * customer gets a reference and, when the store has a WhatsApp number, a button to message the store about it.
 */
export function PreorderForm({ productId, productName, whatsapp }: { productId: string; productName: string; whatsapp?: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ref, setRef] = useState<string | null>(null);
  const storeDigits = (whatsapp ?? "").replace(/\D/g, "");

  if (ref) {
    const text = `Hello, I sent a pre-order on your website (${ref}) for ${productName}. I would like to confirm the payment and my order.`;
    return (
      <div role="status" className="rounded-card border border-border bg-surface p-4 text-[15px] text-ink sm:p-5">
        <p className="font-semibold">Thank you. Your pre-order request has been sent.</p>
        <p className="mt-1 text-sm text-ink/80">
          Reference: <span className="font-mono font-bold text-ink">{ref}</span>. Nothing has been charged. We will contact you to confirm the payment and your order when stock is on the way.
        </p>
        {storeDigits ? (
          <a
            href={`https://wa.me/${storeDigits}?text=${encodeURIComponent(text)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-control bg-[#25d366] px-4 text-sm font-bold text-white hover:bg-[#1ebe5b]"
          >
            <MessageCircle className="h-4 w-4" aria-hidden /> Confirm on WhatsApp<span className="sr-only"> (opens in a new tab)</span>
          </a>
        ) : null}
      </div>
    );
  }

  if (!open) {
    return (
      <div id="preorder" className="scroll-mt-40">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="btn-primary min-h-12 w-full rounded-control px-6 text-[13px] font-bold uppercase tracking-[0.04em] sm:w-auto"
        >
          <CalendarClock className="h-4 w-4" aria-hidden /> Pre-order
        </button>
        <p className="mt-2 text-sm text-muted">Out of stock right now. Send a pre-order and we will contact you to confirm. No payment is taken online.</p>
      </div>
    );
  }

  return (
    <form
      id="preorder"
      noValidate
      aria-label="Pre-order"
      className="grid scroll-mt-40 gap-3 rounded-card border border-border p-4 sm:grid-cols-2 sm:p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
        if (!f.name?.trim() || !f.phone?.trim()) return setError("Please fill in your name and phone number.");
        setBusy(true);
        setError("");
        try {
          const res = await fetch("/api/store/preorders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, productId }) });
          const out = await res.json().catch(() => null);
          if (!res.ok) setError(out?.error?.message ?? "Could not send. Please try again.");
          else setRef(out?.ref ?? "sent");
        } catch {
          setError("Could not reach the server. Please try again.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="text-[15px] font-semibold text-ink sm:col-span-2">Pre-order this product</p>
      <div>
        <label htmlFor="po-name" className="label">Your name</label>
        <input id="po-name" name="name" autoComplete="name" maxLength={100} className="input" />
      </div>
      <div>
        <label htmlFor="po-phone" className="label">Phone number (WhatsApp)</label>
        <input id="po-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={16} className="input" placeholder="e.g. 0771234567" />
      </div>
      <div>
        <label htmlFor="po-qty" className="label">Quantity</label>
        <input id="po-qty" name="quantity" type="number" inputMode="numeric" min={1} max={20} defaultValue={1} className="input" />
      </div>
      <div>
        <label htmlFor="po-city" className="label">City (optional)</label>
        <input id="po-city" name="city" autoComplete="address-level2" maxLength={80} className="input" />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="po-note" className="label">Note (optional)</label>
        <textarea id="po-note" name="note" rows={2} maxLength={500} className="input min-h-20 py-2" />
      </div>
      {/* Left empty by people; filled by bots. */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
      {error ? <p role="alert" className="field-error sm:col-span-2">{error}</p> : null}
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={busy} className="btn-primary min-h-11 rounded-control px-6 text-[13px] font-bold uppercase tracking-[0.04em]">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null} Send pre-order
        </button>
        <p className="text-xs text-muted">No payment now. We confirm payment and the order with you on WhatsApp.</p>
      </div>
    </form>
  );
}
