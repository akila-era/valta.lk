"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** One category's short line for the homepage range tiles (Admin, Categories). Empty + Save removes it. */
export function CategoryTaglineControl({ slug, name, tagline }: { slug: string; name: string; tagline: string }) {
  const router = useRouter();
  const [value, setValue] = useState(tagline);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/categories/tagline", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug, tagline: value }) });
      if (!res.ok) {
        const out = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(out?.error?.message ?? "Could not save.");
      } else router.refresh();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-w-52 flex-wrap items-center gap-2">
      <input
        aria-label={`Short line for ${name}`}
        value={value}
        maxLength={40}
        placeholder="e.g. Power Up Fast"
        onChange={(e) => setValue(e.target.value)}
        className="input min-h-8 min-w-0 flex-1 py-1 text-xs"
      />
      {value.trim() !== tagline ? (
        <button type="button" disabled={busy} onClick={() => void save()} className="btn-primary min-h-8 px-3 text-xs">Save</button>
      ) : null}
      {error ? <p role="alert" className="w-full text-xs text-danger">{error}</p> : null}
    </div>
  );
}
