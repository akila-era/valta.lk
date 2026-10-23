"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ClipboardList, ExternalLink, Eye, FileText, Globe, ImageIcon, Layers, Link2, ListChecks, Loader2, MoreVertical, Plus, Search, Star, Tag, Trash2, Truck, Upload, X, type LucideIcon } from "lucide-react";
import { BADGES, BADGE_LABELS, FEATURE_ICONS, type ContentDoc } from "@/lib/content/schema";
import { CardHeader, CompletionCard, ErpPanel, QuickPreview, Switch, type ErpInfo, type TabId } from "./product-editor-panels";
import { RichText } from "./rich-text";

const TABS: readonly [TabId, string, LucideIcon, string][] = [
  ["basics", "Basics", ClipboardList, "Website Presentation"],
  ["images", "Images", ImageIcon, "Product Images"],
  ["description", "Description", FileText, "Product Description"],
  ["features", "Features", Star, "Key Features"],
  ["specs", "Specifications", ListChecks, "Technical Specifications"],
  ["delivery", "Delivery & Warranty", Truck, "Delivery & Warranty"],
  ["seo", "SEO", Globe, "Search & Social Sharing"],
  ["related", "Related Products", Link2, "Related Products"],
];
type Tab = TabId;

const SPEC_GROUPS = ["General", "Performance", "Connectivity", "Power", "Compatibility", "Dimensions", "Warranty"];
const MAX_IMAGES = 8;
const MAX_BYTES = 2 * 1024 * 1024;

interface RelatedInfo { id: string; name: string; sku: string | null }
interface Props {
  productId: string;
  slug: string;
  erpName: string;
  erpImage?: string;
  initialDoc: ContentDoc;
  initialVersion: number;
  initialPublished: ContentDoc | null;
  publishedAt: string | null;
  related: RelatedInfo[];
  erp: ErpInfo;
  sku: string;
  lastSaved: string | null;
}

const field = "input";
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function move<T>(list: T[], i: number, d: -1 | 1): T[] {
  const j = i + d;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

const Counter = ({ value, max }: { value: string; max: number }) => <p className="mt-1 text-right text-xs text-muted">{value.length} / {max}</p>;

export function ProductEditor(p: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("basics");
  const [doc, setDoc] = useState<ContentDoc>(p.initialDoc);
  const [saved, setSaved] = useState<ContentDoc>(p.initialDoc);
  const [version, setVersion] = useState(p.initialVersion);
  const [published, setPublished] = useState<ContentDoc | null>(p.initialPublished);
  const [lastSaved, setLastSaved] = useState(p.lastSaved);
  const moreRef = useRef<HTMLDetailsElement>(null);
  const [busy, setBusy] = useState<null | "save" | "publish" | "unpublish" | "discard">(null);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; issues?: string[]; conflict?: boolean } | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>(() => Object.fromEntries(p.initialDoc.gallery.map((g) => [g.id, `/api/media/${g.id}`])));
  const [names, setNames] = useState<Record<string, RelatedInfo>>(() => Object.fromEntries(p.related.map((r) => [r.id, r])));
  const [q, setQ] = useState("");
  const [results, setResults] = useState<RelatedInfo[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const thumb = doc.gallery[0] ? (urls[doc.gallery[0].id] ?? `/api/media/${doc.gallery[0].id}`) : p.erp.image;
  const dirty = !same(doc, saved);
  const live = published !== null;
  const unpublishedChanges = !live || !same(published, saved) || dirty;
  const set = <K extends keyof ContentDoc>(k: K, v: ContentDoc[K]) => setDoc((d) => ({ ...d, [k]: v }));

  async function call(url: string, method: string, body: unknown) {
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    return { res, data };
  }

  async function save(): Promise<ContentDoc | null> {
    setBusy("save");
    setMsg(null);
    try {
      const { res, data } = await call(`/api/admin/products/${p.productId}/content`, "PUT", { version, doc });
      if (!res.ok) {
        setMsg({ ok: false, text: data.error?.message ?? "Could not save.", issues: data.error?.issues, conflict: res.status === 409 });
        return null;
      }
      setVersion(data.version);
      setDoc(data.draft);
      setSaved(data.draft);
      setLastSaved(`${new Date().toLocaleString("en-LK", { dateStyle: "medium", timeStyle: "short" })} by you`);
      setMsg({ ok: true, text: "Draft saved. Customers will not see it until you publish." });
      return data.draft as ContentDoc;
    } catch {
      setMsg({ ok: false, text: "Could not reach the server. Check your connection and try again." });
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function act(action: "publish" | "unpublish" | "discard") {
    if (action === "discard" && !window.confirm("Throw away your draft and go back to the published content?")) return;
    if (action === "unpublish" && !window.confirm("Take this content off the storefront? The product will show only its plain ERP details until you publish again.")) return;
    let toPublish = saved;
    if (action === "publish" && dirty) {
      const d = await save();
      if (!d) return;
      toPublish = d;
    }
    setBusy(action);
    setMsg(null);
    try {
      const { res, data } = await call(`/api/admin/products/${p.productId}/publish`, "POST", { action });
      if (!res.ok) {
        setMsg({ ok: false, text: data.error?.message ?? "That did not work." });
        return;
      }
      if (action === "discard") {
        window.location.reload();
        return;
      }
      setPublished(action === "publish" ? toPublish : null);
      setMsg({ ok: true, text: action === "publish" ? "Published. The product page now shows this content." : "Unpublished. The product page shows the plain ERP details." });
      router.refresh();
    } catch {
      setMsg({ ok: false, text: "Could not reach the server. Check your connection and try again." });
    } finally {
      setBusy(null);
    }
  }

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setMsg(null);
    let count = doc.gallery.length;
    const added: ContentDoc["gallery"] = [];
    for (const file of Array.from(files)) {
      if (count >= MAX_IMAGES) { setMsg({ ok: false, text: `A product can have at most ${MAX_IMAGES} images.` }); break; }
      if (file.size > MAX_BYTES) { setMsg({ ok: false, text: `${file.name} is larger than 2 MB.` }); continue; }
      const fd = new FormData();
      fd.append("file", file);
      try {
        const res = await fetch(`/api/admin/products/${p.productId}/images`, { method: "POST", body: fd });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { setMsg({ ok: false, text: data.error?.message ?? `Could not upload ${file.name}.` }); continue; }
        setUrls((u) => ({ ...u, [data.id]: data.url }));
        added.push({ id: data.id, alt: "", caption: "" });
        count++;
      } catch {
        setMsg({ ok: false, text: "Could not reach the server. Check your connection and try again." });
        break;
      }
    }
    if (added.length) setDoc((d) => ({ ...d, gallery: [...d.gallery, ...added] }));
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function search(value: string) {
    setQ(value);
    if (value.trim().length < 2) return setResults(null);
    try {
      const res = await fetch(`/api/admin/products/search?q=${encodeURIComponent(value.trim())}`);
      const data = await res.json();
      setResults((data.items ?? []).filter((r: RelatedInfo) => r.id !== p.productId && !doc.related.includes(r.id)));
    } catch {
      setResults([]);
    }
  }

  const update = <T,>(list: T[], i: number, patch: Partial<T>) => list.map((x, k) => (k === i ? { ...x, ...patch } : x));
  const rowBtn = "btn-ghost h-9 min-h-0 w-9 px-0";

  return (
    <div className="min-w-0">
      {/* header: thumbnail, name, identity badges, actions */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4 xl:flex-nowrap">
        <div className="flex min-w-0 flex-1 items-start gap-4">
          <span className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-border bg-bg">
            {thumb ? <Image src={thumb} alt="" fill sizes="80px" className="object-contain p-1.5" unoptimized /> : <Layers className="m-auto h-full w-8 text-muted" aria-hidden />}
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-bold leading-snug sm:text-2xl">{p.erp.name}</h1>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span className="badge border border-border bg-bg text-ink">SKU: {p.sku}</span>
              <span className="badge border border-border bg-bg text-ink">ERP ID: <span className="ml-1 font-mono">{p.productId}</span></span>
              <span className="badge bg-surface text-ink">ERP Product</span>
              {live ? <span className="badge border border-success/30 bg-success-bg text-success">Published</span> : <span className="badge border border-border bg-bg text-muted">Draft</span>}
              {live && unpublishedChanges && <span className="badge bg-warn-bg text-warn">Unpublished changes</span>}
              {dirty && <span className="badge bg-brand-50 text-brand-700">Unsaved edits</span>}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 xl:shrink-0">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Link href={`/products/${p.slug}`} target="_blank" rel="noopener" className="btn-secondary min-h-10 px-3 text-[13px]"><ExternalLink className="h-4 w-4" aria-hidden /> View on Storefront</Link>
            <Link href={`/products/${p.slug}?preview=1`} target="_blank" rel="noopener" className="btn-secondary min-h-10 px-3 text-[13px]"><Eye className="h-4 w-4" aria-hidden /> Preview</Link>
            <details ref={moreRef} className="relative">
              <summary role="button" className="btn-secondary min-h-10 cursor-pointer list-none px-2.5" aria-label="More actions"><MoreVertical className="h-4 w-4" aria-hidden /></summary>
              <div role="menu" className="card absolute right-0 z-20 mt-2 w-56 p-1.5 shadow-card">
                <button type="button" role="menuitem" className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm hover:bg-surface disabled:opacity-40" disabled={!live || busy !== null} onClick={() => { moreRef.current?.removeAttribute("open"); void act("unpublish"); }}>Unpublish</button>
                <button type="button" role="menuitem" className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm hover:bg-surface disabled:opacity-40" disabled={!(version > 0 && !dirty && unpublishedChanges) || busy !== null} onClick={() => { moreRef.current?.removeAttribute("open"); void act("discard"); }}>Discard draft</button>
              </div>
            </details>
            <button type="button" className="btn-secondary min-h-10 px-4" disabled={!dirty || busy !== null} onClick={() => void save()}>{busy === "save" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Save Draft</button>
            <button type="button" className="btn-primary min-h-10 px-4" disabled={busy !== null || (!dirty && live && !unpublishedChanges) || (!dirty && version === 0)} onClick={() => void act("publish")}>{busy === "publish" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} {live ? "Update Published" : "Publish"}</button>
          </div>
          <p className="text-xs text-muted">
            {lastSaved ? `Last saved: ${lastSaved}. ` : "Nothing saved yet. "}
            <span data-testid="version">Version {version}.</span>
            {live && p.publishedAt ? ` Live since ${new Date(p.publishedAt).toLocaleString("en-LK", { dateStyle: "medium", timeStyle: "short" })}.` : ""}
          </p>
        </div>
      </div>
      {dirty && <p className="mb-3 text-xs text-muted">The storefront Preview shows the last saved draft; the Quick Preview below shows your current edits.</p>}
      {msg && (
        <div role={msg.ok ? "status" : "alert"} className={`mb-5 rounded-xl border p-4 text-sm ${msg.ok ? "border-success/30 bg-success-bg text-success" : "border-danger/30 bg-danger-bg text-danger"}`}>
          <p className="font-semibold">{msg.text}</p>
          {msg.issues && msg.issues.length > 0 && <ul className="mt-2 list-disc pl-5">{msg.issues.map((i) => <li key={i}>{i}</li>)}</ul>}
          {msg.conflict && <button type="button" className="btn-secondary mt-3 min-h-9" onClick={() => window.location.reload()}>Reload the latest version</button>}
        </div>
      )}

      {/* section tabs */}
      <div role="tablist" aria-label="Product content sections" className="card mb-5 flex gap-1 overflow-x-auto p-1.5">
        {TABS.map(([id, label, Icon]) => (
          <button key={id} role="tab" type="button" id={`tab-${id}`} aria-selected={tab === id} aria-controls={`panel-${id}`} onClick={() => setTab(id)}
            className={`flex min-h-10 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3.5 text-sm font-semibold transition-colors motion-reduce:transition-none ${tab === id ? "bg-brand-500 text-ink" : "text-muted hover:bg-surface hover:text-ink"}`}>
            <Icon className="h-4 w-4 shrink-0" aria-hidden />{label}
          </button>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className={tab === "basics" ? "min-w-0" : "card min-w-0 p-5"}>
        {tab !== "basics" && <CardHeader icon={TABS.find((t) => t[0] === tab)![2]} title={TABS.find((t) => t[0] === tab)![3]} />}
        {tab === "basics" && (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_17.5rem]">
            <section className="card p-5" aria-label="Website presentation">
              <CardHeader icon={Tag} title="Website Presentation" />
              <div className="space-y-5">
                <p className="rounded-lg bg-surface p-3 text-sm text-muted">The product name in the cart and on orders is always the ERP name: <strong className="text-ink">{p.erpName}</strong>. The display title only changes the heading on the product page.</p>
                <Field id="displayTitle" label="Website display title" hint="Leave empty to use the ERP name.">
                  <input id="displayTitle" className={field} maxLength={150} value={doc.displayTitle} onChange={(e) => set("displayTitle", e.target.value)} />
                  <Counter value={doc.displayTitle} max={150} />
                </Field>
                <Field id="subtitle" label="Subtitle">
                  <input id="subtitle" className={field} maxLength={150} value={doc.subtitle} onChange={(e) => set("subtitle", e.target.value)} />
                  <Counter value={doc.subtitle} max={150} />
                </Field>
                <Field id="short" label="Short description" hint="One or two sentences shown under the title.">
                  <textarea id="short" className="input h-auto py-2" rows={4} maxLength={300} value={doc.shortDescription} onChange={(e) => set("shortDescription", e.target.value)} />
                  <Counter value={doc.shortDescription} max={300} />
                </Field>
              </div>
            </section>
            <div className="space-y-5">
              <section className="card p-5" aria-label="Display labels">
                <CardHeader icon={Tag} title="Display Labels" />
                <ul className="space-y-4">
                  {BADGES.map((b) => (
                    <li key={b} className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">{BADGE_LABELS[b]}</p>
                        <p className="text-xs text-muted">{b === "new" ? "Show a New label on the product page" : "Mark as a featured product"}</p>
                      </div>
                      <Switch label={BADGE_LABELS[b]} checked={doc.badges.includes(b)} onChange={(on) => set("badges", on ? [...doc.badges, b] : doc.badges.filter((x) => x !== b))} />
                    </li>
                  ))}
                </ul>
                <div className="mt-5">
                  <label htmlFor="promo" className="label">Promotional label</label>
                  <input id="promo" className={field} maxLength={30} placeholder="Example: Limited Offer" value={doc.promoLabel} onChange={(e) => set("promoLabel", e.target.value)} />
                  <Counter value={doc.promoLabel} max={30} />
                </div>
                <p className="mt-2 text-xs text-muted">Stock and sale prices always come from the ERP. There is no Best Seller label because no reliable sales ranking exists.</p>
              </section>
              <section className="card p-5" aria-label="Publication status">
                <CardHeader icon={Eye} title="Publication Status" />
                <div role="radiogroup" aria-label="Publication status" className="space-y-3">
                  {([
                    ["published", "Published", "Visible on the storefront", live],
                    ["draft", "Draft", "Saved but not visible to customers", !live],
                  ] as const).map(([val, label, hint, on]) => (
                    <button key={val} type="button" role="radio" aria-checked={on} disabled={busy !== null}
                      onClick={() => { if (on) return; void act(val === "published" ? "publish" : "unpublish"); }}
                      className="flex w-full items-start gap-3 rounded-lg p-1 text-left hover:bg-surface disabled:opacity-60">
                      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${on ? "border-brand-500" : "border-border"}`}>{on && <span className="h-2.5 w-2.5 rounded-full bg-brand-500" />}</span>
                      <span><span className="block text-sm font-semibold">{label}</span><span className="block text-xs text-muted">{hint}</span></span>
                    </button>
                  ))}
                </div>
                <p className="mt-3 text-xs text-muted">Choosing Published saves your edits and publishes them. Choosing Draft takes the page off the storefront; your content is kept.</p>
              </section>
            </div>
          </div>
        )}

        {tab === "images" && (
          <div>
            <p className="text-sm text-muted">JPEG, PNG or WebP, up to 2 MB each, at most {MAX_IMAGES}. The first image is the main one. Without website images the ERP image is shown.</p>
            {doc.gallery.length === 0 ? (
              <div className="mt-4 flex items-center gap-4 rounded-lg border border-dashed border-border p-4 text-sm text-muted">
                {p.erpImage && <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md bg-surface"><Image src={p.erpImage} alt="" fill sizes="64px" className="object-contain p-1" unoptimized /></span>}
                <span>{p.erpImage ? "Showing the ERP image. Upload your own to replace it." : "No image yet. Upload one below."}</span>
              </div>
            ) : (
              <ul className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(12.5rem,1fr))] gap-4" data-testid="image-list">
                {doc.gallery.map((g, i) => (
                  <li key={g.id} className="min-w-0 rounded-lg border border-border p-3">
                    <span className="relative block aspect-square overflow-hidden rounded-md bg-surface">
                      <Image src={urls[g.id] ?? `/api/media/${g.id}`} alt={g.alt || `Product image ${i + 1}`} fill sizes="260px" className="object-contain p-2" unoptimized />
                      {i === 0 && <span className="badge absolute left-2 top-2 bg-brand-500 text-ink">Main</span>}
                    </span>
                    <div className="mt-3 space-y-2">
                      <label className="sr-only" htmlFor={`alt-${i}`}>Alt text for image {i + 1}</label>
                      <input id={`alt-${i}`} className={`${field} min-h-9`} placeholder="Alt text (describe the image)" maxLength={150} value={g.alt} onChange={(e) => set("gallery", update(doc.gallery, i, { alt: e.target.value }))} />
                      <label className="sr-only" htmlFor={`cap-${i}`}>Caption for image {i + 1}</label>
                      <input id={`cap-${i}`} className={`${field} min-h-9`} placeholder="Caption (optional)" maxLength={200} value={g.caption} onChange={(e) => set("gallery", update(doc.gallery, i, { caption: e.target.value }))} />
                    </div>
                    <div className="mt-2 flex items-center gap-1">
                      <button type="button" className={rowBtn} aria-label={`Move image ${i + 1} earlier`} disabled={i === 0} onClick={() => set("gallery", move(doc.gallery, i, -1))}><ArrowLeft className="h-4 w-4" aria-hidden /></button>
                      <button type="button" className={rowBtn} aria-label={`Move image ${i + 1} later`} disabled={i === doc.gallery.length - 1} onClick={() => set("gallery", move(doc.gallery, i, 1))}><ArrowRight className="h-4 w-4" aria-hidden /></button>
                      {i > 0 && <button type="button" className="btn-ghost h-9 min-h-0 gap-1 whitespace-nowrap px-2 text-xs" onClick={() => set("gallery", [g, ...doc.gallery.filter((_, k) => k !== i)])}><Star className="h-3.5 w-3.5" aria-hidden /> Make main</button>}
                      <button type="button" className={`${rowBtn} ml-auto text-danger`} aria-label={`Remove image ${i + 1}`} onClick={() => set("gallery", doc.gallery.filter((_, k) => k !== i))}><Trash2 className="h-4 w-4" aria-hidden /></button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4">
              <label htmlFor="img-file" className="btn-secondary cursor-pointer">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Upload className="h-4 w-4" aria-hidden />} {uploading ? "Uploading…" : "Upload images"}
              </label>
              <input ref={fileRef} id="img-file" type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" disabled={uploading || doc.gallery.length >= MAX_IMAGES} onChange={(e) => upload(e.target.files)} />
              <p className="mt-2 text-xs text-muted">Uploads are stored right away but only join the product page after you save and publish. ERP images are never deleted.</p>
            </div>
          </div>
        )}

        {tab === "description" && (
          <div>
            <p className="mb-3 text-sm text-muted">Shown under the product on the store. Use headings, short paragraphs and lists. Pasted text is inserted as plain text; unsafe HTML is always removed.</p>
            <RichText label="Product description" value={doc.descriptionHtml} onChange={(html) => set("descriptionHtml", html)} />
            <p className="mt-2 text-xs text-muted">Empty = the description from the ERP is shown instead.</p>
          </div>
        )}

        {tab === "features" && (
          <div>
            <p className="text-sm text-muted">Key features shown as a checklist next to the buy box. Order is the display order.</p>
            {doc.features.length > 0 && (
              <div className="mt-4 hidden gap-2 px-3 text-xs font-semibold uppercase tracking-wide text-muted lg:grid lg:grid-cols-[1fr_2fr_9rem_auto]" aria-hidden>
                <span>Title</span><span>Description</span><span>Icon</span><span className="w-[7.5rem]" />
              </div>
            )}
            <ul className="mt-2 space-y-3">
              {doc.features.map((f, i) => (
                <li key={i} className="grid gap-2 rounded-lg border border-border p-3 lg:grid-cols-[1fr_2fr_9rem_auto]">
                  <input aria-label={`Feature ${i + 1} title`} className={`${field} min-h-10`} placeholder="Title" maxLength={80} value={f.title} onChange={(e) => set("features", update(doc.features, i, { title: e.target.value }))} />
                  <input aria-label={`Feature ${i + 1} description`} className={`${field} min-h-10`} placeholder="Description (optional)" maxLength={300} value={f.description} onChange={(e) => set("features", update(doc.features, i, { description: e.target.value }))} />
                  <select aria-label={`Feature ${i + 1} icon`} className={`${field} min-h-10`} value={f.icon} onChange={(e) => set("features", update(doc.features, i, { icon: e.target.value }))}>
                    <option value="">Tick</option>
                    {FEATURE_ICONS.filter((k) => k !== "check").map((k) => <option key={k} value={k}>{k[0].toUpperCase() + k.slice(1)}</option>)}
                  </select>
                  <div className="flex">
                    <button type="button" className={rowBtn} aria-label={`Move feature ${i + 1} up`} disabled={i === 0} onClick={() => set("features", move(doc.features, i, -1))}><ArrowUp className="h-4 w-4" aria-hidden /></button>
                    <button type="button" className={rowBtn} aria-label={`Move feature ${i + 1} down`} disabled={i === doc.features.length - 1} onClick={() => set("features", move(doc.features, i, 1))}><ArrowDown className="h-4 w-4" aria-hidden /></button>
                    <button type="button" className={`${rowBtn} text-danger`} aria-label={`Remove feature ${i + 1}`} onClick={() => set("features", doc.features.filter((_, k) => k !== i))}><Trash2 className="h-4 w-4" aria-hidden /></button>
                  </div>
                </li>
              ))}
            </ul>
            <button type="button" className="btn-secondary mt-4" disabled={doc.features.length >= 20} onClick={() => set("features", [...doc.features, { title: "", description: "", icon: "" }])}><Plus className="h-4 w-4" aria-hidden /> Add feature</button>
          </div>
        )}

        {tab === "specs" && (
          <div>
            <p className="text-sm text-muted">Technical specifications grouped on the product page. The ERP&apos;s own attributes are shown too and cannot be edited here.</p>
            <datalist id="spec-groups">{SPEC_GROUPS.map((g) => <option key={g} value={g} />)}</datalist>
            {doc.specs.length > 0 && (
              <div className="mt-4 hidden gap-2 px-3 text-xs font-semibold uppercase tracking-wide text-muted lg:grid lg:grid-cols-[10rem_1fr_1.5fr_6rem_auto]" aria-hidden>
                <span>Group</span><span>Name</span><span>Value</span><span>Unit</span><span className="w-[7.5rem]" />
              </div>
            )}
            <ul className="mt-2 space-y-3">
              {doc.specs.map((s, i) => (
                <li key={i} className="grid gap-2 rounded-lg border border-border p-3 lg:grid-cols-[10rem_1fr_1.5fr_6rem_auto]">
                  <input aria-label={`Specification ${i + 1} group`} list="spec-groups" className={`${field} min-h-10`} placeholder="Group" maxLength={40} value={s.group} onChange={(e) => set("specs", update(doc.specs, i, { group: e.target.value }))} />
                  <input aria-label={`Specification ${i + 1} name`} className={`${field} min-h-10`} placeholder="Name" maxLength={60} value={s.name} onChange={(e) => set("specs", update(doc.specs, i, { name: e.target.value }))} />
                  <input aria-label={`Specification ${i + 1} value`} className={`${field} min-h-10`} placeholder="Value" maxLength={200} value={s.value} onChange={(e) => set("specs", update(doc.specs, i, { value: e.target.value }))} />
                  <input aria-label={`Specification ${i + 1} unit`} className={`${field} min-h-10`} placeholder="Unit" maxLength={20} value={s.unit} onChange={(e) => set("specs", update(doc.specs, i, { unit: e.target.value }))} />
                  <div className="flex">
                    <button type="button" className={rowBtn} aria-label={`Move specification ${i + 1} up`} disabled={i === 0} onClick={() => set("specs", move(doc.specs, i, -1))}><ArrowUp className="h-4 w-4" aria-hidden /></button>
                    <button type="button" className={rowBtn} aria-label={`Move specification ${i + 1} down`} disabled={i === doc.specs.length - 1} onClick={() => set("specs", move(doc.specs, i, 1))}><ArrowDown className="h-4 w-4" aria-hidden /></button>
                    <button type="button" className={`${rowBtn} text-danger`} aria-label={`Remove specification ${i + 1}`} onClick={() => set("specs", doc.specs.filter((_, k) => k !== i))}><Trash2 className="h-4 w-4" aria-hidden /></button>
                  </div>
                </li>
              ))}
            </ul>
            <button type="button" className="btn-secondary mt-4" disabled={doc.specs.length >= 100} onClick={() => set("specs", [...doc.specs, { group: doc.specs.at(-1)?.group ?? "General", name: "", value: "", unit: "" }])}><Plus className="h-4 w-4" aria-hidden /> Add specification</button>
          </div>
        )}

        {tab === "delivery" && (
          <div className="grid gap-8 lg:grid-cols-2">
            <section aria-labelledby="warr-h" className="space-y-4">
              <h2 id="warr-h" className="text-base font-semibold">Warranty</h2>
              <p className="text-xs text-muted">Shown in its own section. The ERP warranty (if any) still appears in the specifications.</p>
              <Field id="w-dur" label="Duration"><input id="w-dur" className={field} maxLength={60} placeholder="e.g. 12 months" value={doc.warranty.duration} onChange={(e) => set("warranty", { ...doc.warranty, duration: e.target.value })} /></Field>
              <Field id="w-prov" label="Warranty provider"><input id="w-prov" className={field} maxLength={80} value={doc.warranty.provider} onChange={(e) => set("warranty", { ...doc.warranty, provider: e.target.value })} /></Field>
              <Field id="w-desc" label="Description"><input id="w-desc" className={field} maxLength={300} value={doc.warranty.description} onChange={(e) => set("warranty", { ...doc.warranty, description: e.target.value })} /></Field>
              <Field id="w-terms" label="Terms"><textarea id="w-terms" className="input h-auto py-2" rows={4} maxLength={2000} value={doc.warranty.terms} onChange={(e) => set("warranty", { ...doc.warranty, terms: e.target.value })} /></Field>
              <Field id="w-notes" label="Additional notes"><input id="w-notes" className={field} maxLength={300} value={doc.warranty.notes} onChange={(e) => set("warranty", { ...doc.warranty, notes: e.target.value })} /></Field>
            </section>
            <section aria-labelledby="del-h" className="space-y-4">
              <h2 id="del-h" className="text-base font-semibold">Delivery &amp; pickup</h2>
              <p className="text-xs text-muted">The delivery fee shown is always the live ERP delivery charge. Do not type a fee here.</p>
              <Field id="d-est" label="Estimated delivery time"><input id="d-est" className={field} maxLength={120} placeholder="e.g. 2-4 working days" value={doc.delivery.estimate} onChange={(e) => set("delivery", { ...doc.delivery, estimate: e.target.value })} /></Field>
              <Field id="d-notes" label="Delivery notes"><textarea id="d-notes" className="input h-auto py-2" rows={3} maxLength={500} value={doc.delivery.notes} onChange={(e) => set("delivery", { ...doc.delivery, notes: e.target.value })} /></Field>
              <Field id="d-pick" label="Store pickup instructions" hint="Leave empty if this product cannot be collected from a store."><textarea id="d-pick" className="input h-auto py-2" rows={3} maxLength={500} value={doc.delivery.pickup} onChange={(e) => set("delivery", { ...doc.delivery, pickup: e.target.value })} /></Field>
              <div className="rounded-lg bg-surface p-3 text-xs text-muted"><strong className="text-ink">Payment offers:</strong> not editable. No online payment gateway or installment provider is connected, so there are no offers to show. Prices and checkout stay controlled by the ERP.</div>
            </section>
          </div>
        )}

        {tab === "seo" && (
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="lg:col-span-2 rounded-lg bg-surface p-3 text-sm text-muted">Page address (URL): <code className="text-ink">/products/{p.slug}</code>. It is built from the ERP and cannot be changed here, so existing links keep working.</div>
            <Field id="seo-title" label="SEO title" hint="Shown in search results. Empty = display title or ERP name."><input id="seo-title" className={field} maxLength={70} value={doc.seo.title} onChange={(e) => set("seo", { ...doc.seo, title: e.target.value })} /></Field>
            <Field id="seo-desc" label="Meta description" hint="Up to 160 characters."><textarea id="seo-desc" className="input h-auto py-2" rows={3} maxLength={160} value={doc.seo.description} onChange={(e) => set("seo", { ...doc.seo, description: e.target.value })} /></Field>
            <Field id="seo-og" label="Social sharing image" hint="Choose one of this product's website images.">
              <select id="seo-og" className={field} value={doc.seo.ogImageId ?? ""} onChange={(e) => set("seo", { ...doc.seo, ogImageId: e.target.value || null })}>
                <option value="">Use the main product image</option>
                {doc.gallery.map((g, i) => <option key={g.id} value={g.id}>Image {i + 1}{g.alt ? ` · ${g.alt}` : ""}</option>)}
              </select>
            </Field>
            <label className="flex items-start gap-2 self-end text-sm">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--color-brand-500)]" checked={doc.seo.noindex} onChange={(e) => set("seo", { ...doc.seo, noindex: e.target.checked })} />
              <span><span className="font-semibold">Hide from search engines</span><span className="block text-xs text-muted">Adds a noindex instruction to this product page.</span></span>
            </label>
          </div>
        )}

        {tab === "related" && (
          <div>
            <p className="text-sm text-muted">Choose up to 8 products to show under this one. Leave empty to show products from the same category.</p>
            <ul className="mt-4 space-y-2">
              {doc.related.map((id, i) => (
                <li key={id} className="flex items-center gap-2 rounded-lg border border-border p-2 text-sm">
                  <span className="min-w-0 flex-1 truncate font-medium">{names[id]?.name ?? id}<span className="ml-2 font-mono text-xs font-normal text-muted">{names[id]?.sku ?? id}</span></span>
                  <button type="button" className={rowBtn} aria-label={`Move related product ${i + 1} up`} disabled={i === 0} onClick={() => set("related", move(doc.related, i, -1))}><ArrowUp className="h-4 w-4" aria-hidden /></button>
                  <button type="button" className={rowBtn} aria-label={`Move related product ${i + 1} down`} disabled={i === doc.related.length - 1} onClick={() => set("related", move(doc.related, i, 1))}><ArrowDown className="h-4 w-4" aria-hidden /></button>
                  <button type="button" className={`${rowBtn} text-danger`} aria-label={`Remove ${names[id]?.name ?? id}`} onClick={() => set("related", doc.related.filter((x) => x !== id))}><X className="h-4 w-4" aria-hidden /></button>
                </li>
              ))}
            </ul>
            {doc.related.length < 8 && (
              <div className="mt-4 max-w-lg">
                <label htmlFor="rel-q" className="label">Add a product</label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
                  <input id="rel-q" className={`${field} pl-9`} placeholder="Search by name, SKU or ERP ID" value={q} onChange={(e) => search(e.target.value)} autoComplete="off" />
                </div>
                {results && (
                  <ul className="mt-2 divide-y divide-border rounded-lg border border-border" aria-label="Search results">
                    {results.length === 0 ? <li className="p-3 text-sm text-muted">No matching products.</li> : results.map((r) => (
                      <li key={r.id}>
                        <button type="button" className="flex w-full items-center justify-between gap-3 p-3 text-left text-sm hover:bg-surface" onClick={() => { setNames((n) => ({ ...n, [r.id]: r })); set("related", [...doc.related, r.id]); setQ(""); setResults(null); }}>
                          <span className="font-medium">{r.name}</span><span className="font-mono text-xs text-muted">{r.sku ?? r.id}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      <aside className="min-w-0"><ErpPanel erp={p.erp} /></aside>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <QuickPreview doc={doc} urls={urls} erp={p.erp} previewHref={`/products/${p.slug}?preview=1`} />
        <CompletionCard doc={doc} onGo={(t) => { setTab(t); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
      </div>
    </div>
  );
}
