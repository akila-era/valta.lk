"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, TriangleAlert } from "lucide-react";

type Mode = "off" | "qr" | "cloud";
type Info = {
  settings: { mode: Mode; notifyTo: string; cloud: { phoneNumberId: string; verifyToken: string; hasAccessToken: boolean; hasAppSecret: boolean }; encryption: boolean };
  status: "disconnected" | "connecting" | "qr" | "connected";
  me: string | null;
  error: string | null;
  qr: string | null;
  webhookUrl: string;
};

const STATUS: Record<Info["status"], { label: string; cls: string }> = {
  connected: { label: "Connected", cls: "bg-[#dcfce7] text-[#15803d]" },
  connecting: { label: "Connecting", cls: "bg-warn-bg text-warn" },
  qr: { label: "Waiting for QR scan", cls: "bg-warn-bg text-warn" },
  disconnected: { label: "Disconnected", cls: "bg-surface text-ink" },
};

/**
 * Admin: how the website chat reaches WhatsApp. QR linking (unofficial, Baileys) shows a QR to scan from
 * WhatsApp > Linked devices > Link a device, with Connect / Disconnect / Unlink. The Cloud API (official) takes the
 * Meta app details; secrets are write-only (never shown again). The QR and secrets only ever reach signed-in admins.
 */
export function WhatsAppConnection() {
  const [info, setInfo] = useState<Info | null>(null);
  const [mode, setMode] = useState<Mode>("off");
  const [notifyTo, setNotifyTo] = useState("");
  const [cloud, setCloud] = useState({ phoneNumberId: "", verifyToken: "", accessToken: "", appSecret: "" });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const loaded = useRef(false);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/admin/whatsapp", { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return;
    const d = (await res.json()) as Info;
    setInfo(d);
    if (!loaded.current) {
      // the form starts from the saved settings; later refreshes only update the status
      loaded.current = true;
      setMode(d.settings.mode);
      setNotifyTo(d.settings.notifyTo);
      setCloud((c) => ({ ...c, phoneNumberId: d.settings.cloud.phoneNumberId, verifyToken: d.settings.cloud.verifyToken }));
    }
  }, []);

  // Poll quickly while linking (the QR changes every ~20 s), slowly otherwise.
  useEffect(() => {
    const first = setTimeout(refresh, 0);
    const fast = info?.status === "qr" || info?.status === "connecting";
    const t = setInterval(refresh, fast ? 2_500 : 15_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [refresh, info?.status]);

  const save = async () => {
    setBusy(true);
    setNote(null);
    const res = await fetch("/api/admin/whatsapp", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode, notifyTo, cloud }) }).catch(() => null);
    const out = await res?.json().catch(() => null);
    setBusy(false);
    if (res?.ok) {
      setNote({ ok: true, text: "Saved." });
      setCloud((c) => ({ ...c, accessToken: "", appSecret: "" }));
      refresh();
    } else setNote({ ok: false, text: out?.error?.message ?? "Could not save." });
  };

  const act = async (action: "connect" | "disconnect" | "unlink") => {
    if (action === "unlink" && !confirm("Unlink this device from WhatsApp? You will need to scan a new QR code to connect again.")) return;
    setBusy(true);
    setNote(null);
    const res = await fetch("/api/admin/whatsapp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) }).catch(() => null);
    const out = await res?.json().catch(() => null);
    setBusy(false);
    if (!res?.ok) setNote({ ok: false, text: out?.error?.message ?? "Could not do that." });
    refresh();
  };

  if (!info) return <p className="flex items-center gap-2 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading WhatsApp settings...</p>;
  const saved = info.settings.mode;
  const st = STATUS[info.status];

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <fieldset>
          <legend className="label">How the website chat connects to WhatsApp</legend>
          <div className="mt-1 grid gap-2">
            {(
              [
                ["off", "Off", "No chat window. The plain WhatsApp button (Store details number) is shown instead."],
                ["qr", "QR linking (unofficial)", "Link a WhatsApp number like WhatsApp Web, by scanning a QR code. Not allowed by WhatsApp's terms: the number can be restricted or banned. Use a separate number, not your main business number."],
                ["cloud", "WhatsApp Cloud API (official)", "Meta's official WhatsApp Business Platform. Safe for production. Needs a Meta app, a phone number id, an access token and the app secret."],
              ] as const
            ).map(([value, label, help]) => (
              <label key={value} className={`flex cursor-pointer gap-3 rounded-card border p-3 ${mode === value ? "border-ink bg-surface" : "border-border"}`}>
                <input type="radio" name="wa-mode" value={value} checked={mode === value} onChange={() => setMode(value)} className="mt-1 h-4 w-4" />
                <span>
                  <span className="block text-sm font-semibold text-ink">{label}</span>
                  <span className="block text-xs text-muted">{help}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {mode !== "off" ? (
          <div>
            <label htmlFor="wa-notify" className="label">Staff WhatsApp number that receives the chats{mode === "qr" ? " (optional)" : ""}</label>
            <input id="wa-notify" value={notifyTo} onChange={(e) => setNotifyTo(e.target.value)} inputMode="tel" placeholder="e.g. 0771234567" className="input max-w-sm" />
            <p className="mt-1 text-xs text-muted">
              {mode === "qr"
                ? "Leave empty to receive chats in the linked number's own chat (\"Message yourself\"). Reply to a chat message in WhatsApp to answer the customer."
                : "Chats are sent to this number from your business number. Reply to a chat message to answer. WhatsApp only delivers if this number has messaged the business number in the last 24 hours."}
            </p>
          </div>
        ) : null}

        {mode === "cloud" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="wa-pnid" className="label">Phone number id</label>
              <input id="wa-pnid" value={cloud.phoneNumberId} onChange={(e) => setCloud({ ...cloud, phoneNumberId: e.target.value })} inputMode="numeric" className="input" />
            </div>
            <div>
              <label htmlFor="wa-verify" className="label">Webhook verify token</label>
              <input id="wa-verify" value={cloud.verifyToken} onChange={(e) => setCloud({ ...cloud, verifyToken: e.target.value })} className="input" placeholder="Any secret text, 8+ characters" />
            </div>
            <div>
              <label htmlFor="wa-token" className="label">Access token {info.settings.cloud.hasAccessToken ? "(saved; type to replace)" : ""}</label>
              <input id="wa-token" type="password" autoComplete="off" value={cloud.accessToken} onChange={(e) => setCloud({ ...cloud, accessToken: e.target.value })} className="input" />
            </div>
            <div>
              <label htmlFor="wa-secret" className="label">App secret {info.settings.cloud.hasAppSecret ? "(saved; type to replace)" : ""}</label>
              <input id="wa-secret" type="password" autoComplete="off" value={cloud.appSecret} onChange={(e) => setCloud({ ...cloud, appSecret: e.target.value })} className="input" />
            </div>
            <p className="text-xs text-muted sm:col-span-2">
              In the Meta app, set the webhook callback URL to <code className="rounded bg-surface px-1 font-mono text-ink">{info.webhookUrl}</code>, use the verify token above, and subscribe to the <b>messages</b> field.
            </p>
          </div>
        ) : null}

        {!info.settings.encryption && mode !== "off" ? (
          <p className="flex gap-2 rounded-card bg-warn-bg p-3 text-sm text-warn"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> SETTINGS_ENCRYPTION_KEY is not set on the server, so the WhatsApp session and secrets cannot be stored safely.</p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={busy} className="btn-primary min-h-10 px-5 text-sm">{busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null} Save</button>
          {note ? <p role={note.ok ? "status" : "alert"} className={`text-sm ${note.ok ? "text-ink" : "text-danger"}`}>{note.text}</p> : null}
        </div>
      </form>

      <aside aria-label="Connection status" className="rounded-card border border-border p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-ink">Status</p>
          <span data-testid="wa-status" className={`badge ${saved === "off" ? "bg-surface text-muted" : st.cls}`}>{saved === "off" ? "Chat off" : st.label}</span>
        </div>
        {saved === "qr" ? (
          <div className="mt-4 space-y-3">
            {info.me && info.status === "connected" ? <p className="text-sm text-muted">Linked number: <span className="font-semibold text-ink">+{info.me}</span></p> : null}
            {info.status === "qr" && info.qr ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element -- a data URL made on the server */}
                <img src={info.qr} alt="WhatsApp link QR code" width={240} height={240} className="mx-auto rounded-control border border-border" />
                <p className="text-xs text-muted">On the phone: WhatsApp, Settings (or the menu), <b>Linked devices</b>, <b>Link a device</b>, then scan this code. It refreshes by itself.</p>
              </>
            ) : null}
            {info.status === "connecting" ? <p className="flex items-center gap-2 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Connecting to WhatsApp...</p> : null}
            {info.error ? <p className="text-sm text-danger">{info.error}</p> : null}
            <div className="flex flex-wrap gap-2">
              {info.status === "disconnected" ? (
                <button type="button" disabled={busy} onClick={() => act("connect")} className="btn-primary min-h-9 px-4 text-sm">Connect WhatsApp</button>
              ) : (
                <button type="button" disabled={busy} onClick={() => act("disconnect")} className="btn-secondary min-h-9 px-4 text-sm">Disconnect</button>
              )}
              <button type="button" disabled={busy} onClick={() => act("unlink")} className="btn-text min-h-9 px-3 text-sm text-danger">Unlink device</button>
            </div>
            <p className="text-xs text-muted">The session is saved (encrypted), so the server reconnects after a restart without a new scan. Unlink removes it.</p>
          </div>
        ) : saved === "cloud" ? (
          <p className="mt-3 text-sm text-muted">{info.status === "connected" ? "Cloud API details are saved. Messages are sent through Meta." : "Fill in the Cloud API details and save."}</p>
        ) : (
          <p className="mt-3 text-sm text-muted">Choose a connection and save to switch the website chat on.</p>
        )}
      </aside>
    </div>
  );
}
