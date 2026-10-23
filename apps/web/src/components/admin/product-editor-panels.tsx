"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Check, CircleCheck, Database, ExternalLink, Eye, Smartphone } from "lucide-react";
import { BADGE_LABELS, type ContentDoc } from "@/lib/content/schema";
import { htmlToText } from "@/lib/content/sanitize";

export interface ErpInfo {
  id: string;
  name: string;
  sku: string;
  brand: string;
  category: string;
  price: string;
  stock: string;
  availability: "in" | "low" | "out";
  lastSynced: string;
  connected: boolean;
  image?: string;
}

const AVAIL = {
  in: { label: "In stock", cls: "text-success", dot: "bg-success" },
  low: { label: "Low stock", cls: "text-warn", dot: "bg-warn" },
  out: { label: "Out of stock", cls: "text-danger", dot: "bg-danger" },
} as const;

export function CardHeader({ icon: Icon, title, hint }: { icon: typeof Eye; title: string; hint?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <Icon className="h-5 w-5 text-brand-600" aria-hidden />
        <h2 className="text-base font-semibold">{title}</h2>
      </div>
      {hint}
    </div>
  );
}

/** Accessible on/off switch (a real button with role="switch"). */
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors motion-reduce:transition-none ${checked ? "bg-brand-500" : "bg-border"}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left] motion-reduce:transition-none ${checked ? "left-[1.375rem]" : "left-0.5"}`} />
    </button>
  );
}

const Row = ({ k, children }: { k: string; children: React.ReactNode }) => (
  <div className="grid grid-cols-[7.5rem_1fr] items-start gap-3 py-2.5 text-sm"><dt className="text-muted">{k}</dt><dd className="min-w-0 break-words font-semibold">{children}</dd></div>
);

export function ErpPanel({ erp }: { erp: ErpInfo }) {
  const a = AVAIL[erp.availability];
  return (
    <section className="card p-5" aria-labelledby="erp-h">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Database className="h-5 w-5 text-brand-600" aria-hidden />
          <h2 id="erp-h" className="text-base font-semibold">ERP Product Information</h2>
        </div>
        <span className="badge bg-surface text-ink">Read only</span>
      </div>
      <dl className="divide-y divide-border">
        <Row k="ERP Product ID"><span className="break-all font-mono text-xs">{erp.id}</span></Row>
        <Row k="Product Name (ERP)">{erp.name}</Row>
        <Row k="SKU">{erp.sku}</Row>
        <Row k="Brand">{erp.brand}</Row>
        <Row k="Category">{erp.category}</Row>
        <Row k="ERP Price">{erp.price}</Row>
        <Row k="Stock">{erp.stock}</Row>
        <Row k="Availability"><span className={`inline-flex items-center gap-1.5 ${a.cls}`}><span className={`h-2 w-2 rounded-full ${a.dot}`} aria-hidden />{a.label}</span></Row>
        <Row k="Last Synced">{erp.lastSynced}</Row>
        <Row k="ERP Status">
          <span className={`inline-flex items-center gap-1.5 ${erp.connected ? "text-success" : "text-danger"}`}>
            <span className={`h-2 w-2 rounded-full ${erp.connected ? "bg-success" : "bg-danger"}`} aria-hidden />{erp.connected ? "Connected" : "Unreachable"}
          </span>
        </Row>
      </dl>
    </section>
  );
}

export function QuickPreview({ doc, urls, erp, previewHref }: { doc: ContentDoc; urls: Record<string, string>; erp: ErpInfo; previewHref: string }) {
  const [sel, setSel] = useState(0);
  const images = doc.gallery.length ? doc.gallery.map((g) => ({ src: urls[g.id] ?? `/api/media/${g.id}`, alt: g.alt })) : erp.image ? [{ src: erp.image, alt: "" }] : [];
  const main = images[Math.min(sel, Math.max(0, images.length - 1))];
  const a = AVAIL[erp.availability];
  const badges = [...doc.badges.map((b) => BADGE_LABELS[b]), ...(doc.promoLabel ? [doc.promoLabel] : [])];
  const title = doc.displayTitle || erp.name;
  return (
    <section className="card p-5" aria-labelledby="qp-h">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <Eye className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden />
          <div>
            <h2 id="qp-h" className="text-base font-semibold">Quick Preview</h2>
            <p className="text-sm text-muted">How your product will appear on the storefront. Updates as you type, including unsaved changes.</p>
          </div>
        </div>
        <Link href={previewHref} target="_blank" rel="noopener" className="btn-secondary min-h-10 shrink-0"><ExternalLink className="h-4 w-4" aria-hidden /> Open Preview</Link>
      </div>
      <div className="grid gap-5 sm:grid-cols-[4.5rem_minmax(0,1fr)] lg:grid-cols-[4.5rem_minmax(0,16rem)_minmax(0,1fr)]">
        <ul className="order-2 flex gap-2 overflow-x-auto sm:order-1 sm:flex-col" aria-label="Preview images">
          {images.map((img, i) => (
            <li key={`${img.src}${i}`} className="shrink-0">
              <button type="button" onClick={() => setSel(i)} aria-label={`Preview image ${i + 1}`} aria-current={i === sel} className={`relative block h-[4.5rem] w-[4.5rem] overflow-hidden rounded-lg border bg-surface ${i === sel ? "border-brand-500 ring-1 ring-brand-500" : "border-border"}`}>
                <Image src={img.src} alt="" fill sizes="72px" className="object-contain p-1" unoptimized />
              </button>
            </li>
          ))}
        </ul>
        <div className="relative order-1 aspect-square overflow-hidden rounded-xl border border-border bg-surface sm:order-2">
          {main ? <Image src={main.src} alt={main.alt || title} fill sizes="260px" className="object-contain p-3" unoptimized /> : <Smartphone className="m-auto h-full w-12 text-muted" aria-hidden />}
          <div className="absolute right-2 top-2 flex flex-col items-end gap-1.5">
            {badges.slice(0, 3).map((b) => <span key={b} className="badge whitespace-nowrap bg-brand-500 text-ink">{b}</span>)}
          </div>
          <span className={`badge absolute bottom-2 left-2 whitespace-nowrap ${erp.availability === "out" ? "bg-danger text-white" : "bg-success text-white"}`}>{a.label}</span>
        </div>
        <div className="order-3 min-w-0 sm:col-span-2 lg:col-span-1">
          <h3 className="text-lg font-bold leading-snug">{title}</h3>
          {doc.subtitle && <p className="mt-1 text-sm text-muted">{doc.subtitle}</p>}
          <p className={`mt-2 flex items-center gap-1.5 text-sm font-semibold ${a.cls}`}><Check className="h-4 w-4" aria-hidden />{a.label}</p>
          <p className="mt-1 text-base font-bold">{erp.price}</p>
          {doc.shortDescription && <p className="mt-2 text-sm text-muted">{doc.shortDescription}</p>}
          {doc.features.length > 0 ? (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
              {doc.features.slice(0, 6).map((f, i) => <li key={i}>{f.title}</li>)}
              {doc.features.length > 6 && <li className="list-none text-muted">+ {doc.features.length - 6} more</li>}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted">No features added yet.</p>
          )}
        </div>
      </div>
    </section>
  );
}

export type TabId = "basics" | "images" | "description" | "features" | "specs" | "delivery" | "seo" | "related";

/** What counts as "done" for each section, computed from the current editor state (not hard-coded). */
export function completion(doc: ContentDoc): { id: TabId; label: string; done: boolean; detail?: string }[] {
  const warranty = doc.warranty;
  const delivery = doc.delivery;
  return [
    { id: "basics", label: "Basic information", done: Boolean(doc.shortDescription || doc.subtitle || doc.displayTitle) },
    { id: "images", label: "Product images", done: doc.gallery.length > 0, detail: `${doc.gallery.length}/8` },
    { id: "description", label: "Description", done: htmlToText(doc.descriptionHtml).length > 0 },
    { id: "features", label: "Features", done: doc.features.length > 0, detail: String(doc.features.length) },
    { id: "specs", label: "Specifications", done: doc.specs.length > 0, detail: String(doc.specs.length) },
    { id: "delivery", label: "Delivery & warranty", done: Boolean(warranty.duration || warranty.description || warranty.terms || warranty.provider || warranty.notes || delivery.estimate || delivery.pickup || delivery.notes) },
    { id: "seo", label: "SEO information", done: Boolean(doc.seo.title || doc.seo.description) },
    { id: "related", label: "Related products", done: doc.related.length > 0, detail: String(doc.related.length) },
  ];
}

export function CompletionCard({ doc, onGo }: { doc: ContentDoc; onGo: (t: TabId) => void }) {
  const items = completion(doc);
  const pct = Math.round((items.filter((i) => i.done).length / items.length) * 100);
  return (
    <section className="card p-5" aria-labelledby="pc-h">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <CircleCheck className="h-5 w-5 text-success" aria-hidden />
          <h2 id="pc-h" className="text-base font-semibold">Product Completion</h2>
        </div>
        <span className="text-sm font-bold text-success" data-testid="completion-pct">{pct}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Product content completion">
        <div className="h-full rounded-full bg-success transition-[width] motion-reduce:transition-none" style={{ width: `${pct}%` }} />
      </div>
      <ul className="mt-4 space-y-2.5 text-sm">
        {items.map((i) => (
          <li key={i.id} className="flex items-center gap-2.5" data-done={i.done}>
            {i.done ? <CircleCheck className="h-[18px] w-[18px] shrink-0 text-success" aria-label="Done" /> : <span className="h-[18px] w-[18px] shrink-0 rounded-full border-2 border-border" aria-label="Not done" />}
            <span className={i.done ? "" : "text-muted"}>{i.label}{i.done && i.detail ? ` (${i.detail})` : ""}</span>
            {!i.done && <button type="button" onClick={() => onGo(i.id)} className="ml-auto rounded-md border border-brand-500/50 px-3 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50">Add</button>}
          </li>
        ))}
      </ul>
    </section>
  );
}
