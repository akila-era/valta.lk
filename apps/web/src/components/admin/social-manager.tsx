"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Eye, EyeOff, Plus, Trash2 } from "lucide-react";

export interface SocialRow {
  id: string;
  platform: string;
  url: string;
  caption: string;
  active: boolean;
}

/** Add, hide and delete the Instagram / TikTok posts shown on the homepage. The server re-validates every link. */
export function SocialManager({ rows, max }: { rows: SocialRow[]; max: number }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(method: string, body: unknown): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/social", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(data?.error?.message ?? "Could not save.");
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

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (await call("POST", { url, caption: caption || undefined })) {
      setUrl("");
      setCaption("");
    }
  }

  const full = rows.length >= max;
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        Open an Instagram post or reel, or a TikTok video, copy its link and paste it here (up to {max}). On the homepage each post shows as a card and loads Instagram or TikTok only when a visitor presses play. Set your profile links with
        SITE_SOCIAL_INSTAGRAM and SITE_SOCIAL_TIKTOK to show the follow buttons.
      </p>
      <form onSubmit={add} className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-[3fr_2fr_auto] sm:items-end">
        <div>
          <label htmlFor="s-url" className="label">Post link</label>
          <input id="s-url" className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.instagram.com/p/... or https://www.tiktok.com/@name/video/..." required disabled={full || busy} />
        </div>
        <div>
          <label htmlFor="s-cap" className="label">Short caption (optional)</label>
          <input id="s-cap" className="input" value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={100} disabled={full || busy} />
        </div>
        <button type="submit" className="btn-primary" disabled={full || busy}>
          <Plus className="h-4 w-4" aria-hidden /> Add
        </button>
      </form>
      {full && <p className="text-sm text-warn">You have {max} posts, the most the homepage shows. Delete one to add another.</p>}
      {error && <p role="alert" className="rounded-lg bg-danger-bg p-3 text-sm text-danger">{error}</p>}
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted">No posts yet. The social section stays hidden until you add one.</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 p-3">
              <span className="w-24 shrink-0 rounded-md bg-surface px-2 py-1 text-center text-xs font-semibold capitalize">{r.platform}</span>
              <div className="min-w-0 flex-1">
                <p className={`truncate font-medium ${r.active ? "" : "text-muted line-through"}`}>{r.caption}</p>
                <p className="truncate text-xs text-muted">
                  <a className="underline" href={r.url} target="_blank" rel="noopener noreferrer">{r.url}</a>
                </p>
              </div>
              <button type="button" className="btn-ghost min-h-11 min-w-11 px-2" aria-label={r.active ? `Hide ${r.caption}` : `Show ${r.caption}`} disabled={busy} onClick={() => call("PATCH", { id: r.id, active: !r.active })}>
                {r.active ? <Eye className="h-4 w-4" aria-hidden /> : <EyeOff className="h-4 w-4" aria-hidden />}
              </button>
              <button
                type="button"
                className="btn-ghost min-h-11 min-w-11 px-2 text-danger"
                aria-label={`Delete ${r.caption}`}
                disabled={busy}
                onClick={() => window.confirm(`Delete "${r.caption}"?`) && call("DELETE", { id: r.id })}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
