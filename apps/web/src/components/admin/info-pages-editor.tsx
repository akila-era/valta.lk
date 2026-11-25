"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowDown, ArrowUp, ExternalLink, Plus, RotateCcw, Save, Trash2 } from "lucide-react";

export interface EditorSection {
  heading: string;
  body: string;
}
export interface EditorPage {
  slug: string;
  path: string;
  label: string;
  custom: boolean;
  title: string;
  intro: string;
  sections: EditorSection[];
}

/** Edit the text of the website's info pages. Saving replaces the default text; "Use default text" brings it back. */
export function InfoPagesEditor({ pages }: { pages: EditorPage[] }) {
  const router = useRouter();
  const [slug, setSlug] = useState(pages[0]?.slug ?? "");
  const [drafts, setDrafts] = useState<Record<string, EditorPage>>(() => Object.fromEntries(pages.map((p) => [p.slug, p])));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const page = drafts[slug];
  if (!page) return null;
  const isFaq = slug === "faq";

  const set = (patch: Partial<EditorPage>) => setDrafts((d) => ({ ...d, [slug]: { ...d[slug], ...patch } }));
  const setSection = (i: number, patch: Partial<EditorSection>) => set({ sections: page.sections.map((s, n) => (n === i ? { ...s, ...patch } : s)) });
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= page.sections.length) return;
    const next = [...page.sections];
    [next[i], next[j]] = [next[j], next[i]];
    set({ sections: next });
  };

  async function call(method: string, body: unknown, done: string) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/info-pages", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setMsg({ ok: false, text: data?.error?.message ?? "Could not save." });
        return false;
      }
      setMsg({ ok: true, text: done });
      router.refresh();
      return true;
    } catch {
      setMsg({ ok: false, text: "Could not reach the server." });
      return false;
    } finally {
      setBusy(false);
    }
  }

  const save = () => call("PUT", { slug, title: page.title, intro: page.intro, sections: page.sections }, "Saved. The page is live now.").then((ok) => ok && set({ custom: true }));
  const reset = async () => {
    if (!window.confirm(`Go back to the default text of "${page.label}"? Your edits will be lost.`)) return;
    if (await call("DELETE", { slug }, "Back to the default text.")) router.refresh();
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        Edit the text customers read on each page. Blank line = new paragraph. Start lines with <code className="rounded bg-surface px-1">- </code> for bullets or <code className="rounded bg-surface px-1">1. </code> for steps. Use{" "}
        <code className="rounded bg-surface px-1">**bold**</code> and <code className="rounded bg-surface px-1">[link text](/contact)</code> for links. Only publish terms the business has approved: return periods, warranty and legal text are your decision.
      </p>

      <div role="tablist" aria-label="Pages" className="flex flex-wrap gap-2">
        {pages.map((p) => (
          <button
            key={p.slug}
            role="tab"
            type="button"
            aria-selected={p.slug === slug}
            onClick={() => {
              setSlug(p.slug);
              setMsg(null);
            }}
            className={`min-h-10 rounded-full border px-4 text-sm font-semibold transition-colors ${p.slug === slug ? "border-ink bg-ink text-white" : "border-border hover:border-ink"}`}
          >
            {p.label}
            {drafts[p.slug].custom && <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-brand-500 align-middle" title="Edited" />}
          </button>
        ))}
      </div>

      <div className="space-y-4 rounded-lg border border-border p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted">{page.custom ? "Showing your edited text." : "Showing the default text. Save to make it yours."}</p>
          <Link href={page.path} target="_blank" className="inline-flex items-center gap-1.5 text-sm font-semibold hover:underline">
            View page <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
        <div>
          <label htmlFor="ip-title" className="label">Page title</label>
          <input id="ip-title" className="input" value={page.title} onChange={(e) => set({ title: e.target.value })} maxLength={80} />
        </div>
        <div>
          <label htmlFor="ip-intro" className="label">Short intro under the title</label>
          <textarea id="ip-intro" className="textarea min-h-20" value={page.intro} onChange={(e) => set({ intro: e.target.value })} maxLength={300} />
        </div>

        <h3 className="pt-2 text-base font-semibold">{isFaq ? "Questions and answers" : "Sections"}</h3>
        <ul className="space-y-3">
          {page.sections.map((s, i) => (
            <li key={i} className="rounded-lg border border-border bg-surface/50 p-3 sm:p-4">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <label htmlFor={`ip-h-${i}`} className="label">{isFaq ? "Question" : "Heading"}</label>
                  <input id={`ip-h-${i}`} className="input" value={s.heading} onChange={(e) => setSection(i, { heading: e.target.value })} maxLength={100} />
                </div>
                <div className="flex shrink-0 gap-0.5 pt-6">
                  <button type="button" className="btn-ghost min-h-11 min-w-11 px-2" aria-label={`Move section ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                    <ArrowUp className="h-4 w-4" aria-hidden />
                  </button>
                  <button type="button" className="btn-ghost min-h-11 min-w-11 px-2" aria-label={`Move section ${i + 1} down`} disabled={i === page.sections.length - 1} onClick={() => move(i, 1)}>
                    <ArrowDown className="h-4 w-4" aria-hidden />
                  </button>
                  <button type="button" className="btn-ghost min-h-11 min-w-11 px-2 text-danger" aria-label={`Delete section ${i + 1}`} disabled={page.sections.length <= 1} onClick={() => window.confirm("Delete this section?") && set({ sections: page.sections.filter((_, n) => n !== i) })}>
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              </div>
              <label htmlFor={`ip-b-${i}`} className="label mt-3">{isFaq ? "Answer" : "Text"}</label>
              <textarea id={`ip-b-${i}`} className="textarea min-h-32" value={s.body} onChange={(e) => setSection(i, { body: e.target.value })} maxLength={4000} />
            </li>
          ))}
        </ul>
        <button type="button" className="btn-secondary" disabled={page.sections.length >= 14} onClick={() => set({ sections: [...page.sections, { heading: "", body: "" }] })}>
          <Plus className="h-4 w-4" aria-hidden /> {isFaq ? "Add question" : "Add section"}
        </button>
      </div>

      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={`rounded-lg p-3 text-sm ${msg.ok ? "bg-success-bg text-success" : "bg-danger-bg text-danger"}`}>
          {msg.text}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-primary" disabled={busy} onClick={save}>
          <Save className="h-4 w-4" aria-hidden /> Save page
        </button>
        {page.custom && (
          <button type="button" className="btn-secondary" disabled={busy} onClick={reset}>
            <RotateCcw className="h-4 w-4" aria-hidden /> Use default text
          </button>
        )}
      </div>
    </div>
  );
}
