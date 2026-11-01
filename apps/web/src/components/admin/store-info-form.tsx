"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

type Payment = "koko" | "mintpay" | "visa" | "mastercard" | "amex" | "bank" | "cod";
export type StoreInfoValue = {
  topLine: string;
  phone: string;
  phone2: string;
  whatsapp: string;
  email: string;
  address: string;
  mapUrl: string;
  hours: string[];
  social: { facebook: string; instagram: string; tiktok: string; youtube: string };
  payments: Payment[];
};

const PAYMENTS: { key: Payment; label: string }[] = [
  { key: "koko", label: "KOKO" },
  { key: "mintpay", label: "Mintpay" },
  { key: "visa", label: "VISA" },
  { key: "mastercard", label: "Mastercard" },
  { key: "amex", label: "AMEX" },
  { key: "bank", label: "Bank Transfer" },
  { key: "cod", label: "Cash Payment" },
];
const SOCIAL: { key: keyof StoreInfoValue["social"]; label: string }[] = [
  { key: "facebook", label: "Facebook" },
  { key: "instagram", label: "Instagram" },
  { key: "tiktok", label: "TikTok" },
  { key: "youtube", label: "YouTube" },
];

/**
 * Admin (Settings, Store details): everything the storefront shows about the store itself, in one form. "Fill with
 * demo details" puts sample values in the form (for a demo); nothing changes on the store until Save.
 */
export function StoreInfoForm({ initial, demo }: { initial: StoreInfoValue; demo: StoreInfoValue }) {
  const [v, setV] = useState<StoreInfoValue>(initial);
  const [hours, setHours] = useState(initial.hours.join("\n"));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = <K extends keyof StoreInfoValue>(k: K, val: StoreInfoValue[K]) => setV((x) => ({ ...x, [k]: val }));

  const save = async () => {
    setBusy(true);
    setMsg(null);
    const body = { ...v, hours: hours.split("\n").map((h) => h.trim()).filter(Boolean).slice(0, 4) };
    try {
      const res = await fetch("/api/admin/settings/store", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const out = await res.json().catch(() => null);
      if (!res.ok) setMsg({ ok: false, text: out?.error?.message ?? "Could not save." });
      else {
        setV(out.settings);
        setHours(out.settings.hours.join("\n"));
        setMsg({ ok: true, text: "Saved. The store shows the new details within about 15 seconds." });
      }
    } catch {
      setMsg({ ok: false, text: "Could not reach the server." });
    } finally {
      setBusy(false);
    }
  };

  const field = (id: keyof StoreInfoValue, label: string, hint?: string, type = "text") => (
    <div>
      <label className="label" htmlFor={`si-${id}`}>{label}</label>
      <input id={`si-${id}`} type={type} className="input" value={v[id] as string} onChange={(e) => set(id, e.target.value as never)} />
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );

  return (
    <form
      className="space-y-6 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border p-4">
        <p className="text-muted">For a demo, fill every field with sample details, check them, then Save.</p>
        <button
          type="button"
          className="btn-secondary min-h-10"
          onClick={() => {
            setV(demo);
            setHours(demo.hours.join("\n"));
            setMsg({ ok: true, text: "Demo details filled in. Press Save to show them on the store." });
          }}
        >
          Fill with demo details
        </button>
      </div>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 font-semibold text-ink">Top bar</legend>
        <div className="sm:col-span-2">{field("topLine", "Top bar line", "The words at the left of the black bar at the very top, e.g. “VOLTA.LK Sri Lanka Official Store”.")}</div>
        {field("mapUrl", "Store Locator link", "A Google Maps link (https://…). Shown as “Store Locator” at the top right.", "url")}
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 font-semibold text-ink">Contact</legend>
        {field("phone", "Phone")}
        {field("phone2", "Second phone")}
        {field("whatsapp", "WhatsApp number", "Shows the WhatsApp chat button on every page.")}
        {field("email", "Email", undefined, "email")}
        <div className="sm:col-span-2">{field("address", "Address")}</div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="si-hours">Opening hours</label>
          <textarea id="si-hours" rows={3} className="input min-h-24 py-2" value={hours} onChange={(e) => setHours(e.target.value)} />
          <p className="mt-1 text-xs text-muted">One line each, up to four lines.</p>
        </div>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 font-semibold text-ink">Social links</legend>
        {SOCIAL.map((s) => (
          <div key={s.key}>
            <label className="label" htmlFor={`si-${s.key}`}>{s.label}</label>
            <input id={`si-${s.key}`} type="url" className="input" placeholder="https://" value={v.social[s.key]} onChange={(e) => set("social", { ...v.social, [s.key]: e.target.value })} />
          </div>
        ))}
      </fieldset>

      <fieldset>
        <legend className="mb-2 font-semibold text-ink">Payment badges in the footer</legend>
        <div className="flex flex-wrap gap-2">
          {PAYMENTS.map((p) => {
            const on = v.payments.includes(p.key);
            return (
              <label key={p.key} className={`inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-control border px-3 ${on ? "border-brand-500 bg-brand-50" : "border-border"}`}>
                <input type="checkbox" checked={on} onChange={() => set("payments", on ? v.payments.filter((x) => x !== p.key) : [...v.payments, p.key])} />
                {p.label}
              </label>
            );
          })}
        </div>
        <p className="mt-1.5 text-xs text-muted">Shown as “Payment System” at the bottom of every page. Checkout itself takes the methods set in Payment Settings.</p>
      </fieldset>

      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" disabled={busy} className="btn-primary min-h-11 min-w-32">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          Save
        </button>
        {msg ? <p role="status" className={msg.ok ? "text-success" : "text-danger"}>{msg.text}</p> : null}
      </div>
    </form>
  );
}
