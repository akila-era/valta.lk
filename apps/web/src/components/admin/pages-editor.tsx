"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ExternalLink, Loader2, Plus } from "lucide-react";

type Page = { title: string; intro: string; body: string; custom: boolean };
type Pages = Record<string, Page>;

const HELP = "Formatting: ## Heading, ### Smaller heading, - list item, **bold**, [link text](/page or https://…). A blank line starts a new paragraph.";

/**
 * Admin (Content, Pages): the site's text pages (About, policies, warranty, wholesale intro) and custom pages such as
 * giveaway terms. A built-in page keeps its original text until it is saved here; "Use the built-in text" undoes that.
 */
export function PagesEditor({ initial, builtIn }: { initial: Pages; builtIn: Record<string, { title: string; path: string }> }) {
  const router = useRouter();
  const [pages, setPages] = useState<Pages>(initial);
  const slugs = [...Object.keys(builtIn), ...Object.keys(pages).filter((s) => !builtIn[s])];
  const [slug, setSlug] = useState(slugs[0]);
  const current: Page = pages[slug] ?? { title: builtIn[slug]?.title ?? "", intro: "", body: "", custom: !builtIn[slug] };
  const [draft, setDraft] = useState<Page>(current);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [newSlug, setNewSlug] = useState("");
  const path = builtIn[slug]?.path ?? `/p/${slug}`;

  const pick = (s: string) => {
    setSlug(s);
    setDraft(pages[s] ?? { title: builtIn[s]?.title ?? "", intro: "", body: "", custom: !builtIn[s] });
    setMsg(null);
  };

  async function save(next: Pages, done: string) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/content/pages", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value: next }) });
      const out = await res.json().catch(() => null);
      if (!res.ok) setMsg({ ok: false, text: out?.error?.message ?? "Could not save." });
      else {
        setPages(next);
        setMsg({ ok: true, text: done });
        router.refresh();
      }
    } catch {
      setMsg({ ok: false, text: "Could not reach the server." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <div className="space-y-4">
        <ul className="space-y-1 text-sm" aria-label="Pages">
          {slugs.map((s) => (
            <li key={s}>
              <button
                type="button"
                onClick={() => pick(s)}
                aria-current={s === slug ? "true" : undefined}
                className={`flex w-full items-center justify-between rounded-control px-3 py-2 text-left ${s === slug ? "bg-ink text-white" : "hover:bg-surface"}`}
              >
                <span className="truncate">{pages[s]?.title || builtIn[s]?.title || s}</span>
                <span className={`ml-2 shrink-0 text-[11px] ${s === slug ? "text-white/70" : "text-muted"}`}>{builtIn[s] ? (pages[s] ? "edited" : "built-in") : "custom"}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="rounded-card border border-border p-3 text-sm">
          <label className="label" htmlFor="new-page">New page address</label>
          <div className="flex gap-2">
            <input id="new-page" className="input min-w-0 flex-1 font-mono" placeholder="giveaway-terms" value={newSlug} onChange={(e) => setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} maxLength={60} />
            <button
              type="button"
              className="btn-secondary min-h-10 px-3"
              disabled={!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(newSlug) || Boolean(pages[newSlug] || builtIn[newSlug])}
              onClick={() => {
                const p = { title: "", intro: "", body: "", custom: true };
                setPages((x) => ({ ...x, [newSlug]: p }));
                setSlug(newSlug);
                setDraft(p);
                setNewSlug("");
              }}
            >
              <Plus className="h-4 w-4" aria-hidden /> Add page
            </button>
          </div>
          <p className="mt-1 text-xs text-muted">The page opens at /p/&lt;address&gt;.</p>
        </div>
      </div>

      <div className="space-y-4 text-sm">
        <a href={path} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-ink hover:underline">
          {path} <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
        <div>
          <label className="label" htmlFor="page-title">Title</label>
          <input id="page-title" className="input" maxLength={100} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="page-intro">Short intro (optional)</label>
          <input id="page-intro" className="input" maxLength={300} value={draft.intro} onChange={(e) => setDraft({ ...draft, intro: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="page-body">Text</label>
          <textarea id="page-body" rows={18} className="input min-h-80 py-2 font-mono text-[13px]" value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
          <p className="mt-1 text-xs text-muted">{HELP}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <button
            type="button"
            disabled={busy || !draft.title.trim()}
            className="btn-primary min-h-11 min-w-28"
            onClick={() => void save({ ...pages, [slug]: { ...draft, custom: !builtIn[slug] } }, "Saved. The page shows it within about 15 seconds.")}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null} Save
          </button>
          {pages[slug] ? (
            <button
              type="button"
              disabled={busy}
              className="text-sm font-semibold text-muted hover:text-danger hover:underline"
              onClick={() => {
                const { [slug]: _removed, ...rest } = pages;
                void _removed;
                void save(rest, builtIn[slug] ? "Back to the built-in text." : "Page deleted.").then(() => {
                  if (!builtIn[slug]) pick(Object.keys(builtIn)[0]);
                  else setDraft({ title: builtIn[slug].title, intro: "", body: "", custom: false });
                });
              }}
            >
              {builtIn[slug] ? "Use the built-in text" : "Delete page"}
            </button>
          ) : null}
          {msg ? <p role="status" className={msg.ok ? "text-success" : "text-danger"}>{msg.text}</p> : null}
        </div>
      </div>
    </div>
  );
}
