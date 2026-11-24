"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

/** The "Apply Wholesale" form (/wholesale). The application is stored for staff; nothing is charged or ordered. */
export function WholesaleForm() {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  if (done) {
    return (
      <p role="status" className="rounded-card border border-border bg-surface p-5 text-[15px] text-ink">
        Thank you. We have your application and will contact you soon.
      </p>
    );
  }

  return (
    <form
      noValidate
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
        if (!f.business?.trim() || !f.name?.trim() || !f.phone?.trim()) return setError("Please fill in the business name, your name and phone number.");
        setBusy(true);
        setError("");
        try {
          const res = await fetch("/api/store/wholesale", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
          const out = await res.json().catch(() => null);
          if (!res.ok) setError(out?.error?.message ?? "Could not send. Please try again.");
          else setDone(true);
        } catch {
          setError("Could not reach the server. Please try again.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <div>
        <label htmlFor="w-business" className="label">Business name</label>
        <input id="w-business" name="business" autoComplete="organization" maxLength={120} className="input" />
      </div>
      <div>
        <label htmlFor="w-name" className="label">Your name</label>
        <input id="w-name" name="name" autoComplete="name" maxLength={100} className="input" />
      </div>
      <div>
        <label htmlFor="w-phone" className="label">Phone number</label>
        <input id="w-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={16} className="input" />
      </div>
      <div>
        <label htmlFor="w-email" className="label">Email (optional)</label>
        <input id="w-email" name="email" type="email" autoComplete="email" maxLength={254} className="input" />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="w-city" className="label">City (optional)</label>
        <input id="w-city" name="city" autoComplete="address-level2" maxLength={80} className="input sm:max-w-sm" />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="w-message" className="label">What would you like to buy? (optional)</label>
        <textarea id="w-message" name="message" rows={4} maxLength={1000} className="input min-h-28 py-2" placeholder="Products and rough quantities" />
      </div>
      {/* Left empty by people; filled by bots. */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
      {error ? <p role="alert" className="field-error sm:col-span-2">{error}</p> : null}
      <div className="sm:col-span-2">
        <button type="submit" disabled={busy} className="btn-primary min-h-11 rounded-control px-8 text-[13px] font-bold uppercase tracking-[0.04em]">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null} Send application
        </button>
      </div>
    </form>
  );
}
