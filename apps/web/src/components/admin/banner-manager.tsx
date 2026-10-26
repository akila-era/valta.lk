"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ImageIcon, Pencil, Plus, Trash2 } from "lucide-react";

export interface BannerRow {
  id: string;
  placement: "CARDS" | "WIDE";
  eyebrow: string;
  headline: string;
  text: string;
  ctaLabel: string;
  href: string;
  active: boolean;
  sortOrder: number;
  imageUrl: string | null;
}

const blank: Omit<BannerRow, "id" | "imageUrl"> = { placement: "CARDS", eyebrow: "", headline: "", text: "", ctaLabel: "Shop now", href: "/products", active: true, sortOrder: 0 };

/** Create, edit, reorder, hide and delete the homepage promo banners. The server re-validates everything. */
export function BannerManager({ rows, max, shown }: { rows: BannerRow[]; max: number; shown: number }) {
  const router = useRouter();
  const [editing, setEditing] = useState<BannerRow | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(url: string, init: RequestInit): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, init);
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(body?.error?.message ?? "Could not save.");
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError("Could not reach the server.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function remove(r: BannerRow) {
    if (!window.confirm(`Delete the banner "${r.headline}"?`)) return;
    await call(`/api/admin/banners/${r.id}`, { method: "DELETE" });
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          <b>Promo cards</b>: the first {shown} active ones show on the homepage as a row of offer tiles under &quot;Shop by Category&quot;, in order; with none active the row is left out. <b>Wide banner</b>: full-width pictures after the first product collection on the homepage; with several active, they slide automatically (up to 5, in order).
        </p>
        {editing === null && (
          <button type="button" className="btn-primary" disabled={rows.length >= max} onClick={() => { setError(null); setEditing("new"); }}>
            <Plus className="h-4 w-4" aria-hidden /> Add banner
          </button>
        )}
      </div>
      {rows.length >= max && editing === null && <p className="mb-3 text-xs text-muted">You have reached the limit of {max} banners. Delete one to add another.</p>}
      {error && editing === null && <p role="alert" className="mb-3 text-sm text-danger">{error}</p>}

      {editing !== null && (
        <BannerForm
          key={editing === "new" ? "new" : editing.id}
          initial={editing === "new" ? null : editing}
          busy={busy}
          error={error}
          onCancel={() => { setError(null); setEditing(null); }}
          onSubmit={async (fd) => {
            const ok = await call(editing === "new" ? "/api/admin/banners" : `/api/admin/banners/${editing.id}`, { method: editing === "new" ? "POST" : "PUT", body: fd });
            if (ok) setEditing(null);
          }}
        />
      )}

      {rows.length === 0 && editing === null ? (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted">No banners yet. Add one to replace the automatic homepage banners.</p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {rows.map((r) => (
            <li key={r.id} className="card overflow-hidden">
              <div className="relative flex h-36 items-center justify-center bg-surface">
                {r.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- staff-uploaded picture from our own route
                  <img src={r.imageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex flex-col items-center gap-1 text-xs text-muted"><ImageIcon className="h-6 w-6" aria-hidden />Stock photo</span>
                )}
                <span className={`badge absolute left-3 top-3 ${r.active ? "bg-success-bg text-success" : "bg-surface text-muted ring-1 ring-border"}`}>{r.active ? "Shown" : "Hidden"} · {r.placement === "WIDE" ? "Wide banner" : "Promo card"}</span>
                <span className="badge absolute right-3 top-3 bg-bg text-ink ring-1 ring-border">Order {r.sortOrder}</span>
              </div>
              <div className="p-4">
                {r.eyebrow && <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">{r.eyebrow}</p>}
                <p className="mt-0.5 font-semibold">{r.headline}</p>
                {r.text && <p className="mt-1 text-sm text-muted">{r.text}</p>}
                {r.placement === "WIDE" ? (
                  <p className="mt-2 text-xs text-muted">Link: <span className="font-mono">{r.href || "none"}</span></p>
                ) : (
                  <p className="mt-2 text-xs text-muted">Button: <b className="text-ink">{r.ctaLabel}</b> → <span className="font-mono">{r.href}</span></p>
                )}
                <div className="mt-3 flex gap-2">
                  <button type="button" className="btn-secondary min-h-9 px-3 text-xs" disabled={busy} onClick={() => { setError(null); setEditing(r); }}><Pencil className="h-3.5 w-3.5" aria-hidden /> Edit</button>
                  <button type="button" className="btn-ghost min-h-9 px-3 text-xs text-danger" disabled={busy} onClick={() => void remove(r)}><Trash2 className="h-3.5 w-3.5" aria-hidden /> Delete</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BannerForm({ initial, busy, error, onCancel, onSubmit }: { initial: BannerRow | null; busy: boolean; error: string | null; onCancel: () => void; onSubmit: (fd: FormData) => void | Promise<void> }) {
  const v = initial ?? { ...blank, id: "", imageUrl: null as string | null };
  const fileRef = useRef<HTMLInputElement>(null);
  const [placement, setPlacement] = useState<"CARDS" | "WIDE">(v.placement);
  const wide = placement === "WIDE";
  const [preview, setPreview] = useState<string | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const shownImage = preview ?? (removeImage ? null : v.imageUrl);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("active", (e.currentTarget.elements.namedItem("active") as HTMLInputElement).checked ? "1" : "0");
    if (removeImage && !preview) fd.set("removeImage", "1");
    if (wide && !preview && (removeImage || !v.imageUrl)) return window.alert("A wide banner needs a picture.");
    void onSubmit(fd);
  }

  return (
    <form onSubmit={submit} className="card mb-5 grid gap-4 p-5 lg:grid-cols-[18rem_1fr]">
      <fieldset className="lg:col-span-2">
        <legend className="label">Banner type</legend>
        <div className="flex flex-wrap gap-2">
          {([["CARDS", "Promo card (picture + text + button)"], ["WIDE", "Wide banner (full-width picture, slides)"]] as const).map(([val, text]) => (
            <label key={val} className={`cursor-pointer rounded-lg border px-3 py-2 text-sm font-medium ${placement === val ? "border-brand-500 bg-brand-50 text-brand-700" : "border-border"}`}>
              <input type="radio" name="placement" value={val} checked={placement === val} onChange={() => setPlacement(val)} className="sr-only" /> {text}
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <p className="label">Picture{wide ? " (required)" : ""}</p>
        <div className={`relative flex items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-surface ${wide ? "aspect-[21/8]" : "aspect-[4/3]"}`}>
          {shownImage ? (
            // eslint-disable-next-line @next/next/no-img-element -- local preview / staff-uploaded picture
            <img src={shownImage} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="px-4 text-center text-xs text-muted">{wide ? "No picture yet." : "No picture. The stock photo is used."}</span>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          name="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          id="banner-file"
          onChange={(e) => {
            const f = e.target.files?.[0];
            setRemoveImage(false);
            setPreview(f ? URL.createObjectURL(f) : null);
          }}
        />
        <div className="mt-2 flex flex-wrap gap-2">
          <label htmlFor="banner-file" className="btn-secondary min-h-9 cursor-pointer px-3 text-xs">{shownImage ? "Replace" : "Choose picture"}</label>
          {shownImage && (
            <button type="button" className="btn-ghost min-h-9 px-3 text-xs text-danger" onClick={() => { setPreview(null); setRemoveImage(true); if (fileRef.current) fileRef.current.value = ""; }}>Remove</button>
          )}
        </div>
        <p className="mt-2 text-xs text-muted">{wide ? "JPEG, PNG or WebP, up to 2 MB. About 1600 × 600 px, wide, works best." : "JPEG, PNG or WebP, up to 2 MB. A wide or square photo works best."}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {!wide && <div><label className="label" htmlFor="b-eyebrow">Small label (optional)</label><input id="b-eyebrow" name="eyebrow" className="input" maxLength={40} defaultValue={v.eyebrow} placeholder="New arrivals" /></div>}
        <div className={wide ? "sm:col-span-2" : ""}><label className="label" htmlFor="b-headline">{wide ? "Description (read by screen readers)" : "Headline"}</label><input id="b-headline" name="headline" className="input" required minLength={3} maxLength={80} defaultValue={v.headline} placeholder="The latest smartphones" /></div>
        {!wide && <div className="sm:col-span-2"><label className="label" htmlFor="b-text">Text (optional)</label><input id="b-text" name="text" className="input" maxLength={160} defaultValue={v.text} placeholder="Browse the range and compare prices in LKR." /></div>}
        {!wide && <div><label className="label" htmlFor="b-cta">Button label</label><input id="b-cta" name="ctaLabel" className="input" required minLength={2} maxLength={30} defaultValue={v.ctaLabel} /></div>}
        <div className={wide ? "sm:col-span-2" : ""}><label className="label" htmlFor="b-href">{wide ? "Link when clicked (optional)" : "Button link"}</label><input id="b-href" name="href" className="input font-mono" required={!wide} defaultValue={v.href} placeholder="/categories/mobile-phones" /><p className="mt-1 text-xs text-muted">A page on this site, starting with /</p></div>
        <div><label className="label" htmlFor="b-order">Order (smaller shows first)</label><input id="b-order" name="sortOrder" type="number" min={0} max={999} className="input" defaultValue={v.sortOrder} /></div>
        <label className="flex items-center gap-2 self-end pb-3 text-sm font-medium"><input type="checkbox" name="active" defaultChecked={v.active} className="h-4 w-4 accent-[var(--color-brand-500)]" /> Show on the homepage</label>
        {error && <p role="alert" className="text-sm text-danger sm:col-span-2">{error}</p>}
        <div className="flex gap-2 sm:col-span-2">
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? "Saving…" : initial ? "Save changes" : "Add banner"}</button>
          <button type="button" className="btn-secondary" disabled={busy} onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </form>
  );
}
