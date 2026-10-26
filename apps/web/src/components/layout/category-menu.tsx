"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { ChevronRight, Flame } from "lucide-react";
import { categoryIcon } from "@/components/ui/category-icon";
import type { DrawerCategory } from "./category-drawer";

/**
 * Desktop "All Categories" dropdown under the category bar: Hot Deals and the catalogue's categories on the left, the
 * hovered or focused category's sub-categories on the right (each category page also lists its sub-categories). Escape, a click outside or choosing a link closes it, and
 * focus goes back to the button that opened it.
 */
export function CategoryMenu({ open, onClose, categories, hasDeals, opener }: {
  open: boolean;
  onClose: () => void;
  categories: DrawerCategory[];
  hasDeals: boolean;
  opener: React.RefObject<HTMLButtonElement | null>;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<string | null>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const button = opener.current;
    panel.current?.querySelector<HTMLElement>("a")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        button?.focus();
      }
    };
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !button?.contains(t)) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDoc);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDoc);
    };
  }, [open, onClose, opener]);

  if (!open) return null;
  const current = categories.find((c) => c.slug === active && c.subs.length > 0);

  return (
    <div className="container-wide relative h-0">
      <div
        ref={panel}
        id={id}
        role="region"
        aria-label="All categories"
        className="absolute left-3 top-0 z-50 flex animate-[fade-in_0.15s_ease-out] overflow-hidden rounded-b-card border border-t-0 border-brand-100 bg-bg text-ink shadow-[0_18px_40px_-16px_rgb(16_24_40/0.35)] sm:left-4 lg:left-6"
        onMouseLeave={() => setActive(null)}
      >
        <ul className="w-64 border-t-[3px] border-brand-500 py-2">
          {hasDeals && (
            <li>
              <Link href="/products?sale=1" onClick={onClose} className="mx-2 mb-1 flex items-center gap-2.5 rounded-control bg-brand-50 px-3 py-2 text-[13px] font-bold text-brand-700 hover:bg-brand-100">
                <Flame className="h-4 w-4 fill-brand-500/30" aria-hidden /> Hot Deals
              </Link>
            </li>
          )}
          {categories.map((c) => {
            const Icon = categoryIcon(c.name);
            const on = active === c.slug;
            return (
              <li key={c.slug} onMouseEnter={() => setActive(c.slug)} onFocus={() => setActive(c.slug)}>
                <Link
                  href={`/categories/${c.slug}`}
                  onClick={onClose}
                  className={`flex items-center gap-3 px-4 py-2 text-[13px] font-semibold transition-colors ${on ? "bg-brand-50 text-brand-600" : "hover:bg-brand-50 hover:text-brand-600"}`}
                >
                  <Icon className={`h-4 w-4 ${on ? "text-brand-600" : "text-muted"}`} strokeWidth={1.75} aria-hidden />
                  <span className="flex-1">{c.name}</span>
                  {c.subs.length ? <ChevronRight className="h-3.5 w-3.5 text-muted" aria-hidden /> : null}
                </Link>
              </li>
            );
          })}
          {categories.length === 0 && <li className="px-4 py-3 text-sm text-muted">Categories are unavailable right now.</li>}
          <li className="mx-2 mt-1 border-t border-border pt-1">
            <Link href="/products" onClick={onClose} className="flex items-center justify-between rounded-control px-2 py-2 text-[13px] font-bold text-brand-600 hover:bg-brand-50">
              View all products <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
            <Link href="/brands" onClick={onClose} className="flex items-center justify-between rounded-control px-2 py-2 text-[13px] font-bold text-brand-600 hover:bg-brand-50">
              Shop by brand <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </li>
        </ul>
        {current ? (
          <div className="w-56 border-l border-t-[3px] border-l-border border-t-brand-500 bg-gradient-to-b from-brand-50/60 to-bg px-2 py-2">
            <p className="px-2 pb-1 pt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-brand-600">{current.name}</p>
            <ul>
              {current.subs.map((s) => (
                <li key={s.slug}>
                  <Link href={`/categories/${current.slug}?sub=${s.slug}`} onClick={onClose} className="block rounded-control px-2 py-1.5 text-[13px] text-ink/80 hover:bg-brand-50 hover:text-brand-600">
                    {s.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
