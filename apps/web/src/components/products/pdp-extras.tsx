"use client";

import Link from "next/link";
import { useState } from "react";
import { BadgeCheck, Banknote, Check, Headset, Link2, MessageCircle, Truck } from "lucide-react";

/** SKU, category and brand under the buy buttons, as small links. Only the facts the product really has. */
export function ProductMeta({ sku, brand, category, sub }: { sku?: string | null; brand?: string | null; category?: { slug: string; name: string } | null; sub?: { slug: string; name: string } | null }) {
  const rows: { label: string; node: React.ReactNode }[] = [
    sku ? { label: "SKU", node: <span className="font-medium text-ink">{sku}</span> } : null,
    category
      ? {
          label: "Category",
          node: (
            <span>
              <Link href={`/categories/${category.slug}`} className="font-medium text-ink hover:text-brand-600 hover:underline">{category.name}</Link>
              {sub && (
                <>
                  {", "}
                  <Link href={`/categories/${category.slug}?sub=${sub.slug}`} className="font-medium text-ink hover:text-brand-600 hover:underline">{sub.name}</Link>
                </>
              )}
            </span>
          ),
        }
      : null,
    brand ? { label: "Brand", node: <Link href={`/products?brand=${encodeURIComponent(brand)}`} className="font-medium text-ink hover:text-brand-600 hover:underline">{brand}</Link> } : null,
  ].filter(Boolean) as { label: string; node: React.ReactNode }[];
  if (!rows.length) return null;
  return (
    <dl className="mt-6 space-y-1.5 border-t border-border pt-5 text-[15px]">
      {rows.map((r) => (
        <div key={r.label} className="flex gap-2">
          <dt className="w-20 shrink-0 text-muted">{r.label}:</dt>
          <dd className="min-w-0">{r.node}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Share this product: WhatsApp, Facebook, or copy the link. */
export function ShareRow({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const enc = encodeURIComponent;
  const btn = "flex h-10 w-10 items-center justify-center rounded-full border border-border text-ink/80 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-500 hover:bg-brand-500 hover:text-on-brand motion-reduce:transition-none motion-reduce:hover:translate-y-0";
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Copy this link", url);
    }
  }
  return (
    <div className="mt-5 flex flex-wrap items-center gap-2">
      <span className="mr-1 text-[15px] text-muted">Share:</span>
      <a href={`https://wa.me/?text=${enc(`${title} ${url}`)}`} target="_blank" rel="noopener noreferrer" className={btn} aria-label="Share on WhatsApp (opens in a new tab)">
        <MessageCircle className="h-[18px] w-[18px]" aria-hidden />
      </a>
      <a href={`https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`} target="_blank" rel="noopener noreferrer" className={btn} aria-label="Share on Facebook (opens in a new tab)">
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M14.5 8.5H17V5h-2.5A3.5 3.5 0 0 0 11 8.5V11H8.5v3.5H11V21h3.5v-6.5H17l.5-3.5h-3V8.8c0-.2.1-.3.3-.3z" />
        </svg>
      </a>
      <button type="button" onClick={copy} className={btn} aria-label={copied ? "Link copied" : "Copy link"}>
        {copied ? <Check className="h-[18px] w-[18px]" aria-hidden /> : <Link2 className="h-[18px] w-[18px]" aria-hidden />}
      </button>
      <span role="status" className="text-[13px] text-success">{copied ? "Link copied" : ""}</span>
    </div>
  );
}

/** A row of four store promises under the product details. Only things the store really does. */
export function PdpTrust({ cod }: { cod: boolean }) {
  const items = [
    { icon: BadgeCheck, title: "Genuine products", text: "From the brands we sell" },
    cod ? { icon: Banknote, title: "Cash on delivery", text: "Pay when it arrives" } : null,
    { icon: Truck, title: "Island-wide delivery", text: "Track your order online" },
    { icon: Headset, title: "Friendly support", text: "Here to help with any question" },
  ].filter(Boolean) as { icon: typeof Truck; title: string; text: string }[];
  return (
    <ul className={`mt-12 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 ${items.length === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
      {items.map(({ icon: Icon, title, text }) => (
        <li key={title} className="flex items-center gap-3.5 bg-white p-4 sm:p-5">
          <Icon className="h-8 w-8 shrink-0 text-brand-600" strokeWidth={1.5} aria-hidden />
          <span>
            <span className="block text-[15px] font-semibold text-ink">{title}</span>
            <span className="block text-[13px] text-muted">{text}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
