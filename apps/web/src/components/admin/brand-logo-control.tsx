"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Trash2, Upload } from "lucide-react";

/** Upload, replace or remove one brand's storefront logo. The server re-checks type, size, brand and admin session. */
export function BrandLogoControl({ brand, logo }: { brand: string; logo?: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(init: RequestInit) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/brands/logo", init);
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(body?.error?.message ?? "Could not save the logo.");
      } else {
        router.refresh();
      }
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  function onPick(file: File | undefined) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return setError("Logos must be smaller than 2 MB.");
    const form = new FormData();
    form.set("brand", brand);
    form.set("file", file);
    void send({ method: "POST", body: form });
  }

  return (
    <div className="min-w-[11rem]">
      <div className="flex items-center gap-2">
        <span className="flex h-10 w-20 shrink-0 items-center justify-center rounded-md border border-border bg-bg">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- staff-uploaded logo from our own route
            <img src={logo} alt={`${brand} logo`} className="max-h-8 max-w-[4.5rem] object-contain" />
          ) : (
            <span className="text-[11px] text-muted">No logo</span>
          )}
        </span>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" id={`logo-${brand}`} aria-label={`Upload logo for ${brand}`} disabled={busy} onChange={(e) => onPick(e.target.files?.[0])} />
        <label htmlFor={`logo-${brand}`} className={`btn-secondary min-h-9 cursor-pointer px-3 text-xs ${busy ? "pointer-events-none opacity-50" : ""}`}>
          <Upload className="h-3.5 w-3.5" aria-hidden /> {logo ? "Replace" : "Upload"}
        </label>
        {logo && (
          <button type="button" disabled={busy} aria-label={`Remove logo for ${brand}`} onClick={() => void send({ method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brand }) })} className="btn-ghost h-9 min-h-0 w-9 px-0 text-danger">
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>
      {error && <p role="alert" className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
