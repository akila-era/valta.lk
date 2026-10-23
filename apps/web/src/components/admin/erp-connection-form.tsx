"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { CheckCircle2, Loader2, Plug, Trash2, XCircle } from "lucide-react";

interface Props { source: "admin" | "environment" | "none"; base: string | null; hint: string | null; encryptionReady: boolean; dbReady: boolean }
interface Result { ok: boolean; text: string; shop?: { currency: string; ordersEnabled: boolean; cod: boolean } }

export function ErpConnectionForm({ source, base, hint, encryptionReady, dbReady }: Props) {
  const router = useRouter();
  const [address, setAddress] = useState(source === "admin" && base ? base : "");
  const [credential, setCredential] = useState("");
  const [busy, setBusy] = useState<null | "test" | "save" | "remove">(null);
  const [res, setRes] = useState<Result | null>(null);
  const inflight = useRef(false);

  async function run(action: "test" | "save") {
    if (inflight.current) return;
    inflight.current = true;
    setBusy(action);
    setRes(null);
    try {
      const r = await fetch("/api/admin/erp-connection", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address, credential, action }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) setRes({ ok: false, text: d.error?.message ?? "That did not work." });
      else {
        setRes({ ok: true, text: d.message, shop: d.shop });
        if (action === "save") {
          setCredential("");
          router.refresh();
        }
      }
    } catch {
      setRes({ ok: false, text: "Could not reach the website server. Try again." });
    } finally {
      inflight.current = false;
      setBusy(null);
    }
  }

  async function remove() {
    if (!window.confirm("Remove the saved ERP connection? The website falls back to the server settings (if any); otherwise products and orders stop working.")) return;
    setBusy("remove");
    const r = await fetch("/api/admin/erp-connection", { method: "DELETE" }).catch(() => null);
    setBusy(null);
    if (r?.ok) {
      setAddress("");
      setRes({ ok: true, text: "Removed." });
      router.refresh();
    } else setRes({ ok: false, text: "Could not remove it." });
  }

  const disabled = busy !== null || !address.trim() || !credential.trim();
  return (
    <div>
      <p className="text-sm text-muted">
        Currently using: <strong className="text-ink">{source === "admin" ? "the connection saved here" : source === "environment" ? "the server environment settings" : "nothing (not connected)"}</strong>
        {source === "admin" && base && <> · <span className="font-mono text-xs">{base}</span> · credential <span className="font-mono text-xs">{hint}</span></>}
      </p>
      {!dbReady && <p role="alert" className="mt-3 rounded-lg bg-warn-bg p-3 text-sm text-warn">The website database is not configured, so a connection cannot be saved here.</p>}
      {dbReady && !encryptionReady && <p role="alert" className="mt-3 rounded-lg bg-warn-bg p-3 text-sm text-warn">Set <code>SETTINGS_ENCRYPTION_KEY</code> (32+ characters) on the server first; it stores the credential encrypted. You can still test a connection.</p>}
      <form className="mt-5 grid gap-4 lg:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void run("save"); }}>
        <div>
          <label htmlFor="erp-addr" className="label">ERP address (IP or host)</label>
          <input id="erp-addr" className="input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="192.168.1.10:3001 or https://erp.example.com" autoComplete="off" spellCheck={false} />
          <p className="mt-1 text-xs text-muted">The store API path (/api/v1/store-api) is added for you.</p>
        </div>
        <div>
          <label htmlFor="erp-cred" className="label">API credential</label>
          <input id="erp-cred" type="password" className="input font-mono" value={credential} onChange={(e) => setCredential(e.target.value)} placeholder="hxs_..." autoComplete="new-password" spellCheck={false} />
          <p className="mt-1 text-xs text-muted">Created by the shop owner in the ERP (store registration) and shown once there. Stored encrypted, never displayed again.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:col-span-2">
          <button type="button" className="btn-secondary min-h-10" disabled={disabled} onClick={() => run("test")}>{busy === "test" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plug className="h-4 w-4" aria-hidden />} Test connection</button>
          <button type="submit" className="btn-primary min-h-10" disabled={disabled || !dbReady || !encryptionReady}>{busy === "save" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Test &amp; save</button>
          {source === "admin" && <button type="button" className="btn-ghost ml-auto min-h-10 text-danger" disabled={busy !== null} onClick={remove}><Trash2 className="h-4 w-4" aria-hidden /> Remove saved connection</button>}
        </div>
      </form>
      {res && (
        <div role={res.ok ? "status" : "alert"} className={`mt-4 flex items-start gap-2 rounded-lg p-3 text-sm ${res.ok ? "bg-success-bg text-success" : "bg-danger-bg text-danger"}`}>
          {res.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
          <div>
            <p className="font-semibold">{res.text}</p>
            {res.shop && <p className="mt-1 text-xs">Currency {res.shop.currency || "-"} · orders {res.shop.ordersEnabled ? "enabled" : "paused"} · cash on delivery {res.shop.cod ? "on" : "off"}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
