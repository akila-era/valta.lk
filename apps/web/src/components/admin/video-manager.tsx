"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Eye, EyeOff, Plus, Trash2 } from "lucide-react";

export interface VideoRow {
  id: string;
  videoId: string;
  title: string;
  channel: string;
  active: boolean;
}

/** Add, hide and delete the YouTube videos shown at the bottom of the homepage. The server re-validates every link. */
export function VideoManager({ rows, max }: { rows: VideoRow[]; max: number }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [channel, setChannel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(method: string, body: unknown): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/videos", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
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
    if (await call("POST", { url, title, channel: channel || undefined })) {
      setUrl("");
      setTitle("");
      setChannel("");
    }
  }

  const full = rows.length >= max;
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        Paste a YouTube link, give it a title, and it appears in the video section at the bottom of the homepage (up to {max}). The video only loads when a visitor presses play.
      </p>
      <form onSubmit={add} className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-[2fr_2fr_1fr_auto] sm:items-end">
        <div>
          <label htmlFor="v-url" className="label">YouTube link</label>
          <input id="v-url" className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=..." required disabled={full || busy} />
        </div>
        <div>
          <label htmlFor="v-title" className="label">Title</label>
          <input id="v-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Unboxing our latest arrivals" maxLength={100} required disabled={full || busy} />
        </div>
        <div>
          <label htmlFor="v-channel" className="label">Channel (optional)</label>
          <input id="v-channel" className="input" value={channel} onChange={(e) => setChannel(e.target.value)} maxLength={60} disabled={full || busy} />
        </div>
        <button type="submit" className="btn-primary" disabled={full || busy}>
          <Plus className="h-4 w-4" aria-hidden /> Add
        </button>
      </form>
      {full && <p className="text-sm text-warn">You have {max} videos, the most the homepage shows. Delete one to add another.</p>}
      {error && <p role="alert" className="rounded-lg bg-danger-bg p-3 text-sm text-danger">{error}</p>}
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted">No videos yet. The video section stays hidden until you add one.</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 p-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- YouTube thumbnail */}
              <img src={`https://i.ytimg.com/vi/${r.videoId}/mqdefault.jpg`} alt="" width={128} height={72} loading="lazy" className="h-[4.5rem] w-32 shrink-0 rounded-md object-cover" />
              <div className="min-w-0 flex-1">
                <p className={`truncate font-medium ${r.active ? "" : "text-muted line-through"}`}>{r.title}</p>
                <p className="truncate text-xs text-muted">
                  {r.channel || "No channel"} ·{" "}
                  <a className="underline" href={`https://www.youtube.com/watch?v=${r.videoId}`} target="_blank" rel="noopener noreferrer">
                    Open on YouTube
                  </a>
                </p>
              </div>
              <button type="button" className="btn-ghost min-h-11 min-w-11 px-2" aria-label={r.active ? `Hide ${r.title}` : `Show ${r.title}`} disabled={busy} onClick={() => call("PATCH", { id: r.id, active: !r.active })}>
                {r.active ? <Eye className="h-4 w-4" aria-hidden /> : <EyeOff className="h-4 w-4" aria-hidden />}
              </button>
              <button
                type="button"
                className="btn-ghost min-h-11 min-w-11 px-2 text-danger"
                aria-label={`Delete ${r.title}`}
                disabled={busy}
                onClick={() => window.confirm(`Delete the video "${r.title}"?`) && call("DELETE", { id: r.id })}
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
