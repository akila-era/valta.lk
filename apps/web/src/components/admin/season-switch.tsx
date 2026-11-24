"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

type Season = "none" | "halloween";
type Settings = { season: Season; message: string };

const DEFAULT_LINE: Record<Exclude<Season, "none">, string> = { halloween: "Happy Halloween from VOLTA.LK" };

/**
 * Admin (Promotions, Seasonal Theme): one button turns the Halloween look on or off for the whole storefront. The top
 * bar line can be changed before switching it on (or while it is on, with Save line).
 */
export function SeasonSwitch({ initial }: { initial: Settings }) {
  const [saved, setSaved] = useState<Settings>(initial);
  const [message, setMessage] = useState(initial.message);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const on = saved.season === "halloween";

  const save = async (next: Settings, done: string) => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/settings/season", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setMsg({ ok: false, text: body?.error?.message ?? "Could not save." });
      } else {
        setSaved(body.settings);
        setMessage(body.settings.message);
        setMsg({ ok: true, text: done });
      }
    } catch {
      setMsg({ ok: false, text: "Could not reach the server." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-border p-4">
        <div>
          <p className="font-semibold text-ink">Halloween look</p>
          <p className="mt-0.5 text-muted">{on ? "On. Shoppers see the Halloween look now." : "Off. The store has its normal look."}</p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void save(
              { season: on ? "none" : "halloween", message: message.trim() },
              on ? "Halloween look removed. The store is back to normal." : "Halloween look is on.",
            )
          }
          className={`${on ? "btn-secondary" : "btn-primary"} min-h-11 min-w-44`}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {on ? "Remove Halloween look" : "Turn on Halloween look"}
        </button>
      </div>

      <div>
        <label className="label" htmlFor="season-line">Top bar line</label>
        <div className="flex flex-wrap gap-2">
          <input
            id="season-line"
            className="input min-w-0 flex-1"
            maxLength={90}
            placeholder={DEFAULT_LINE.halloween}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          {on ? (
            <button type="button" className="btn-secondary min-h-11" disabled={busy || message.trim() === saved.message} onClick={() => void save({ season: "halloween", message: message.trim() }, "Line saved.")}>
              Save line
            </button>
          ) : null}
        </div>
        <p className="mt-1.5 text-xs text-muted">Shown in the black bar at the very top while the theme is on. Leave it empty for &ldquo;{DEFAULT_LINE.halloween}&rdquo;.</p>
      </div>

      {msg ? (
        <p role="status" className={msg.ok ? "text-success" : "text-danger"}>{msg.text}</p>
      ) : null}
    </div>
  );
}
