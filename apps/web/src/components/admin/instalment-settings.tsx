"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { formatLkr } from "@/lib/utils/money";

type Provider = "koko" | "mintpay";
type Settings = { enabled: boolean; providers: Provider[]; parts: number };

const NAMES: Record<Provider, string> = { koko: "KOKO", mintpay: "Mintpay" };
/** A sample price for the preview line. */
const SAMPLE = 14_900;

/**
 * Admin (Payments): the "or 3 × LKR … with KOKO | Mintpay" line under every product card price. Staff switch it on,
 * pick the providers and the number of parts; the preview shows exactly what shoppers will see.
 */
export function InstalmentSettingsForm({ initial, canSave }: { initial: Settings; canSave: boolean }) {
  const [s, setS] = useState<Settings>(initial);
  const [saved, setSaved] = useState<Settings>(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const dirty = JSON.stringify(s) !== JSON.stringify(saved);

  const toggle = (p: Provider) => setS((v) => ({ ...v, providers: v.providers.includes(p) ? v.providers.filter((x) => x !== p) : [...v.providers, p] }));

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/settings/instalments", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s) });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setMsg({ ok: false, text: body?.error?.message ?? "Could not save." });
      } else {
        setS(body.settings);
        setSaved(body.settings);
        setMsg({ ok: true, text: body.settings.enabled ? "Saved. The line now shows on product cards." : "Saved. The line is off." });
      }
    } catch {
      setMsg({ ok: false, text: "Could not reach the server." });
    } finally {
      setBusy(false);
    }
  };

  const live = s.enabled && s.providers.length > 0;
  return (
    <div className="space-y-4 text-sm">
      <label className="flex items-center gap-3 font-semibold">
        <input type="checkbox" className="check" checked={s.enabled} onChange={(e) => setS((v) => ({ ...v, enabled: e.target.checked }))} />
        Show the instalment line on product cards
      </label>

      <fieldset className="space-y-2">
        <legend className="mb-1 font-semibold">Providers</legend>
        {(Object.keys(NAMES) as Provider[]).map((p) => (
          <label key={p} className="flex items-center gap-3">
            <input type="checkbox" className="check" checked={s.providers.includes(p)} onChange={() => toggle(p)} />
            {NAMES[p]}
          </label>
        ))}
      </fieldset>

      <label className="flex items-center gap-3">
        <span className="font-semibold">Number of parts</span>
        <select className="input w-24" value={s.parts} onChange={(e) => setS((v) => ({ ...v, parts: Number(e.target.value) }))}>
          {[2, 3, 4, 5, 6].map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </label>

      <div className="rounded-lg bg-surface p-3">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Preview (a {formatLkr(SAMPLE)} product)</p>
        {live ? (
          <p className="text-xs text-muted">
            or {s.parts} × <span className="font-semibold text-ink">{formatLkr(Math.ceil(SAMPLE / s.parts))}</span> with <span className="font-extrabold text-ink">{s.providers.map((p) => NAMES[p]).join(" | ")}</span>
          </p>
        ) : (
          <p className="text-xs text-muted">No line is shown on the cards.</p>
        )}
      </div>

      <p className="rounded-lg bg-warn-bg p-3 text-xs text-warn">
        Turn this on only when checkout really offers the chosen provider. The amount is the card price divided by the number of parts (rounded up); the provider&apos;s own fees are not included.
      </p>

      <div className="flex items-center gap-3">
        <button type="button" className="btn-primary" onClick={save} disabled={!canSave || busy || !dirty}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null} Save
        </button>
        {!canSave ? <span className="text-xs text-muted">The website database is not configured, so this cannot be saved.</span> : null}
        {msg ? (
          <span role={msg.ok ? "status" : "alert"} className={`text-xs font-semibold ${msg.ok ? "text-success" : "text-danger"}`}>
            {msg.text}
          </span>
        ) : null}
      </div>
    </div>
  );
}
