"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { CheckCircle2, Loader2, Plug, Power, Trash2, XCircle } from "lucide-react";

export interface KokoSaved {
  environment: "QA" | "PROD" | null;
  merchantId: string;
  apiKeyHint: string;
  pluginName: string;
  pluginVersion: string;
  appUrl: string;
  enabled: boolean;
}
interface Props { source: "admin" | "environment" | "none"; saved: KokoSaved | null; encryptionReady: boolean; dbReady: boolean; defaultAppUrl: string }

export function KokoConnectionForm({ source, saved, encryptionReady, dbReady, defaultAppUrl }: Props) {
  const router = useRouter();
  const [environment, setEnvironment] = useState<"QA" | "PROD">(saved?.environment ?? "QA");
  const [merchantId, setMerchantId] = useState(saved?.merchantId ?? "");
  const [apiKey, setApiKey] = useState("");
  const [pluginName, setPluginName] = useState(saved?.pluginName ?? "customapi");
  const [pluginVersion, setPluginVersion] = useState(saved?.pluginVersion ?? "1");
  const [privateKey, setPrivateKey] = useState("");
  const [publicKey, setPublicKey] = useState("");
  const [appUrl, setAppUrl] = useState(saved?.appUrl ?? defaultAppUrl);
  const [busy, setBusy] = useState<null | "test" | "save" | "toggle" | "remove">(null);
  const [res, setRes] = useState<{ ok: boolean; text: string } | null>(null);
  const inflight = useRef(false);

  async function call(action: "test" | "save" | "toggle", extra: Record<string, unknown> = {}) {
    if (inflight.current) return;
    inflight.current = true;
    setBusy(action);
    setRes(null);
    try {
      const r = await fetch("/api/admin/koko-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, environment, merchantId, apiKey, pluginName, pluginVersion, privateKey, publicKey, appUrl, ...extra }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) setRes({ ok: false, text: d.error?.message ?? "That did not work." });
      else {
        setRes({ ok: true, text: d.message ?? (action === "toggle" ? (d.enabled ? "Koko is now shown at checkout." : "Koko is now hidden at checkout.") : "Done.") });
        if (action !== "test") {
          setApiKey("");
          setPrivateKey("");
          setPublicKey("");
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
    if (!window.confirm("Remove the saved Koko settings? Koko disappears from checkout unless the server environment has its own settings.")) return;
    setBusy("remove");
    const r = await fetch("/api/admin/koko-connection", { method: "DELETE" }).catch(() => null);
    setBusy(null);
    if (r?.ok) {
      setRes({ ok: true, text: "Removed." });
      router.refresh();
    } else setRes({ ok: false, text: "Could not remove it." });
  }

  const hasSaved = source === "admin" && saved;
  const missing = !merchantId.trim() || !pluginName.trim() || !pluginVersion.trim() || !appUrl.trim() || (!hasSaved && (!apiKey.trim() || !privateKey.trim() || !publicKey.trim()));
  const disabled = busy !== null || missing;
  const keyHelp = hasSaved ? "Leave blank to keep the saved one." : "Required.";

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted">
          Using: <strong className="text-ink">{source === "admin" ? "the settings saved here" : source === "environment" ? "the server environment settings (read-only here)" : "nothing yet"}</strong>
          {hasSaved && <> · {saved.environment === "PROD" ? "Production" : "QA"} · merchant <span className="font-mono text-xs">{saved.merchantId}</span> · API key <span className="font-mono text-xs">{saved.apiKeyHint}</span></>}
        </p>
        {hasSaved && (
          <button type="button" role="switch" aria-checked={saved.enabled} disabled={busy !== null} onClick={() => call("toggle", { enabled: !saved.enabled })} className={`ml-auto inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold ${saved.enabled ? "bg-success-bg text-success" : "bg-surface text-muted"}`}>
            {busy === "toggle" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Power className="h-4 w-4" aria-hidden />}
            {saved.enabled ? "Shown at checkout (click to hide)" : "Hidden (click to show at checkout)"}
          </button>
        )}
      </div>
      {!dbReady && <p role="alert" className="mt-3 rounded-lg bg-warn-bg p-3 text-sm text-warn">The website database is not configured, so settings cannot be saved here.</p>}
      {dbReady && !encryptionReady && <p role="alert" className="mt-3 rounded-lg bg-warn-bg p-3 text-sm text-warn">Set <code>SETTINGS_ENCRYPTION_KEY</code> (32+ characters) on the server first; it stores the keys encrypted. You can still check the details.</p>}

      <form className="mt-5 grid gap-4 lg:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void call("save"); }}>
        <div>
          <label htmlFor="koko-env" className="label">Environment</label>
          <select id="koko-env" className="select" value={environment} onChange={(e) => setEnvironment(e.target.value as "QA" | "PROD")}>
            <option value="QA">QA (test payments, qaapi.paykoko.com)</option>
            <option value="PROD">Production (real money, prodapi.paykoko.com)</option>
          </select>
          {environment === "PROD" && <p className="mt-1 text-xs text-warn">Production needs the production merchant ID, API key and keys from Koko.</p>}
        </div>
        <div>
          <label htmlFor="koko-mid" className="label">Merchant ID</label>
          <input id="koko-mid" className="input font-mono" value={merchantId} onChange={(e) => setMerchantId(e.target.value)} autoComplete="off" spellCheck={false} />
        </div>
        <div>
          <label htmlFor="koko-key" className="label">API key</label>
          <input id="koko-key" type="password" className="input font-mono" value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoComplete="new-password" spellCheck={false} />
          <p className="mt-1 text-xs text-muted">{keyHelp} Stored encrypted, never shown again.</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="koko-pn" className="label">Plugin name</label>
            <input id="koko-pn" className="input font-mono" value={pluginName} onChange={(e) => setPluginName(e.target.value)} autoComplete="off" spellCheck={false} />
          </div>
          <div>
            <label htmlFor="koko-pv" className="label">Plugin version</label>
            <input id="koko-pv" className="input font-mono" value={pluginVersion} onChange={(e) => setPluginVersion(e.target.value)} autoComplete="off" spellCheck={false} />
          </div>
        </div>
        <div>
          <label htmlFor="koko-priv" className="label">Our merchant private key (signs requests)</label>
          <textarea id="koko-priv" rows={5} className="textarea font-mono text-xs" value={privateKey} onChange={(e) => setPrivateKey(e.target.value)} placeholder={hasSaved ? "Saved. Paste a new key only to replace it." : "-----BEGIN RSA PRIVATE KEY-----"} autoComplete="off" spellCheck={false} />
          <p className="mt-1 text-xs text-muted">{keyHelp} Stored encrypted, never shown again.</p>
        </div>
        <div>
          <label htmlFor="koko-pub" className="label">Koko public key (verifies their callbacks)</label>
          <textarea id="koko-pub" rows={5} className="textarea font-mono text-xs" value={publicKey} onChange={(e) => setPublicKey(e.target.value)} placeholder={hasSaved ? "Saved. Paste a new key only to replace it." : "-----BEGIN PUBLIC KEY-----"} autoComplete="off" spellCheck={false} />
          <p className="mt-1 text-xs text-muted">{keyHelp}</p>
        </div>
        <div className="lg:col-span-2">
          <label htmlFor="koko-app" className="label">Public site URL (Koko calls back here)</label>
          <input id="koko-app" className="input" value={appUrl} onChange={(e) => setAppUrl(e.target.value)} placeholder="https://valta.lk" autoComplete="off" spellCheck={false} />
          <p className="mt-1 text-xs text-muted">Must be a public https address. In testing use a tunnel URL (ngrok or cloudflared).</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:col-span-2">
          <button type="button" className="btn-secondary min-h-10" disabled={disabled} onClick={() => call("test")}>{busy === "test" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plug className="h-4 w-4" aria-hidden />} Check details</button>
          <button type="submit" className="btn-primary min-h-10" disabled={disabled || !dbReady || !encryptionReady}>{busy === "save" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Save</button>
          {hasSaved && <button type="button" className="btn-ghost ml-auto min-h-10 text-danger" disabled={busy !== null} onClick={remove}><Trash2 className="h-4 w-4" aria-hidden /> Remove saved settings</button>}
        </div>
      </form>
      {res && (
        <div role={res.ok ? "status" : "alert"} className={`mt-4 flex items-start gap-2 rounded-lg p-3 text-sm ${res.ok ? "bg-success-bg text-success" : "bg-danger-bg text-danger"}`}>
          {res.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
          <p className="font-semibold">{res.text}</p>
        </div>
      )}
    </div>
  );
}
