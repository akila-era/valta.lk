"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { CheckCircle2, Loader2, Plug, Power, Trash2, XCircle } from "lucide-react";

export interface PayzySaved {
  environment: "SANDBOX" | "PROD" | null;
  shopId: string;
  secretKeyHint: string;
  testMode: string;
  appUrl: string;
  legacyVersionSigning: boolean;
  enabled: boolean;
}
interface Props { source: "admin" | "environment" | "none"; saved: PayzySaved | null; encryptionReady: boolean; dbReady: boolean; defaultAppUrl: string }

export function PayzyConnectionForm({ source, saved, encryptionReady, dbReady, defaultAppUrl }: Props) {
  const router = useRouter();
  const [environment, setEnvironment] = useState<"SANDBOX" | "PROD">(saved?.environment ?? "SANDBOX");
  const [shopId, setShopId] = useState(saved?.shopId ?? "");
  const [secretKey, setSecretKey] = useState("");
  const [testMode, setTestMode] = useState(saved?.testMode ?? "on");
  const [appUrl, setAppUrl] = useState(saved?.appUrl ?? defaultAppUrl);
  const [legacy, setLegacy] = useState(saved?.legacyVersionSigning ?? false);
  const [busy, setBusy] = useState<null | "test" | "save" | "toggle" | "remove">(null);
  const [res, setRes] = useState<{ ok: boolean; text: string } | null>(null);
  const inflight = useRef(false);

  async function call(action: "test" | "save" | "toggle", extra: Record<string, unknown> = {}) {
    if (inflight.current) return;
    inflight.current = true;
    setBusy(action);
    setRes(null);
    try {
      const r = await fetch("/api/admin/payzy-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, environment, shopId, secretKey, testMode, appUrl, legacyVersionSigning: legacy, ...extra }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) setRes({ ok: false, text: d.error?.message ?? "That did not work." });
      else {
        setRes({ ok: true, text: d.message ?? (action === "toggle" ? (d.enabled ? "Payzy is now shown at checkout." : "Payzy is now hidden at checkout.") : "Done.") });
        if (action !== "test") {
          setSecretKey("");
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
    if (!window.confirm("Remove the saved Payzy settings? Payzy disappears from checkout unless the server environment has its own settings.")) return;
    setBusy("remove");
    const r = await fetch("/api/admin/payzy-connection", { method: "DELETE" }).catch(() => null);
    setBusy(null);
    if (r?.ok) {
      setRes({ ok: true, text: "Removed." });
      router.refresh();
    } else setRes({ ok: false, text: "Could not remove it." });
  }

  const hasSaved = source === "admin" && saved;
  const missing = !shopId.trim() || !testMode.trim() || !appUrl.trim() || (!hasSaved && !secretKey.trim());
  const disabled = busy !== null || missing;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted">
          Using: <strong className="text-ink">{source === "admin" ? "the settings saved here" : source === "environment" ? "the server environment settings (read-only here)" : "nothing yet"}</strong>
          {hasSaved && <> · {saved.environment === "PROD" ? "Production" : "Sandbox"} · shop <span className="font-mono text-xs">{saved.shopId}</span> · key <span className="font-mono text-xs">{saved.secretKeyHint}</span></>}
        </p>
        {hasSaved && (
          <button type="button" role="switch" aria-checked={saved.enabled} disabled={busy !== null} onClick={() => call("toggle", { enabled: !saved.enabled })} className={`ml-auto inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold ${saved.enabled ? "bg-success-bg text-success" : "bg-surface text-muted"}`}>
            {busy === "toggle" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Power className="h-4 w-4" aria-hidden />}
            {saved.enabled ? "Shown at checkout (click to hide)" : "Hidden (click to show at checkout)"}
          </button>
        )}
      </div>
      {!dbReady && <p role="alert" className="mt-3 rounded-lg bg-warn-bg p-3 text-sm text-warn">The website database is not configured, so settings cannot be saved here.</p>}
      {dbReady && !encryptionReady && <p role="alert" className="mt-3 rounded-lg bg-warn-bg p-3 text-sm text-warn">Set <code>SETTINGS_ENCRYPTION_KEY</code> (32+ characters) on the server first; it stores the key encrypted. You can still check the details.</p>}

      <form className="mt-5 grid gap-4 lg:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void call("save"); }}>
        <div>
          <label htmlFor="pz-env" className="label">Environment</label>
          <select id="pz-env" className="select" value={environment} onChange={(e) => { const v = e.target.value as "SANDBOX" | "PROD"; setEnvironment(v); if (v === "SANDBOX") setTestMode("on"); }}>
            <option value="SANDBOX">Sandbox (test payments, api.payzypay.xyz)</option>
            <option value="PROD">Production (real money, api.payzy.lk)</option>
          </select>
          {environment === "PROD" && <p className="mt-1 text-xs text-warn">Production needs the production shop ID, secret key and test-mode value from Payzy (probably &quot;off&quot;; confirm with them).</p>}
        </div>
        <div>
          <label htmlFor="pz-shop" className="label">Shop ID</label>
          <input id="pz-shop" className="input font-mono" value={shopId} onChange={(e) => setShopId(e.target.value)} autoComplete="off" spellCheck={false} />
        </div>
        <div>
          <label htmlFor="pz-key" className="label">Secret key</label>
          <input id="pz-key" type="password" className="input font-mono" value={secretKey} onChange={(e) => setSecretKey(e.target.value)} placeholder={hasSaved ? "Saved. Paste a new key only to replace it." : "$2b$12$..."} autoComplete="new-password" spellCheck={false} />
          <p className="mt-1 text-xs text-muted">{hasSaved ? "Leave blank to keep the saved one." : "Required."} Paste it exactly as given (no escaping needed here). Stored encrypted, never shown again.</p>
        </div>
        <div>
          <label htmlFor="pz-test" className="label">Test mode value</label>
          <input id="pz-test" className="input font-mono" value={testMode} onChange={(e) => setTestMode(e.target.value)} autoComplete="off" spellCheck={false} />
          <p className="mt-1 text-xs text-muted">&quot;on&quot; in the sandbox.</p>
        </div>
        <div className="lg:col-span-2">
          <label htmlFor="pz-app" className="label">Public site URL (Payzy sends customers back here)</label>
          <input id="pz-app" className="input" value={appUrl} onChange={(e) => setAppUrl(e.target.value)} placeholder="https://valta.lk" autoComplete="off" spellCheck={false} />
          <p className="mt-1 text-xs text-muted">Must be a public https address. In testing use a tunnel URL (ngrok or cloudflared).</p>
        </div>
        <label className="flex items-start gap-2 text-sm lg:col-span-2">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand-600" checked={legacy} onChange={(e) => setLegacy(e.target.checked)} />
          <span>Use the legacy request signing from Payzy&apos;s sample (<code>x_version1.0</code>). Only switch this on if the sandbox rejects requests with a signature error.</span>
        </label>
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
