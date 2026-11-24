"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * One brand's colour (Admin, Brands): its brand page and its tile in "Explore our brands" use it. "Default" goes back
 * to the brand's usual colour (or the one it was given automatically).
 */
export function BrandColorControl({ brand, color, custom }: { brand: string; color: string; custom: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(color);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(next: string | null) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/brands/color", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brand, color: next }) });
      if (!res.ok) {
        const out = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(out?.error?.message ?? "Could not save the colour.");
      } else {
        router.refresh();
      }
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="color"
        aria-label={`Colour for ${brand}`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-8 w-10 cursor-pointer rounded border border-border bg-bg p-0.5"
      />
      <span className="font-mono text-xs text-muted">{value}</span>
      {value.toLowerCase() !== color.toLowerCase() ? (
        <button type="button" disabled={busy} onClick={() => void save(value)} className="btn-primary min-h-8 px-3 text-xs">Save</button>
      ) : null}
      {custom ? (
        <button type="button" disabled={busy} onClick={() => void save(null)} className="text-xs font-semibold text-muted hover:text-ink hover:underline">Default</button>
      ) : null}
      {error ? <p role="alert" className="w-full text-xs text-danger">{error}</p> : null}
    </div>
  );
}
