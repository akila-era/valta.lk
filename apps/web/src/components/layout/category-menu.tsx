"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { ChevronRight, Flame } from "lucide-react";
import { categoryIcon } from "@/components/ui/category-icon";
import type { DrawerCategory } from "./category-drawer";

/**
 * Desktop "All Categories" menu under the category bar: Hot Deals and the catalogue's categories (with icons) on the
 * left, the hovered or focused category's sub-categories as a grid on the right (the first category's until one is
 * hovered). Escape, a click outside or choosing a link closes it, and
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
  // Like a large store's category menu: the categories down the left, the hovered (or first) category's
  // sub-categories as a grid on the right.
  const current = categories.find((c) => c.slug === active && c.subs.length > 0) ?? categories.find((c) => c.subs.length > 0);

  return (
    <div className="container-wide relative h-0">
      <div
        ref={panel}
        id={id}
        role="region"
        aria-label="All categories"
        className="absolute left-3 top-1 z-50 flex animate-[fade-in_0.15s_ease-out] overflow-hidden rounded-card border border-border bg-bg text-ink shadow-overlay sm:left-4 lg:left-6"
      >
        <ul className="w-72 border-r border-border py-2">
          {hasDeals && (
            <li>
              <Link href="/products?sale=1" onClick={onClose} className="mx-2 mb-1 flex min-h-11 items-center gap-3 rounded-control bg-brand-500 px-3 text-sm font-bold text-on-brand hover:bg-ink hover:text-white">
                <Flame className="h-4 w-4" aria-hidden /> Hot Deals
              </Link>
            </li>
          )}
          {categories.map((c) => {
            const Icon = categoryIcon(c.name);
            const on = current?.slug === c.slug;
            return (
              <li key={c.slug} onMouseEnter={() => setActive(c.slug)} onFocus={() => setActive(c.slug)}>
                <Link
                  href={`/categories/${c.slug}`}
                  onClick={onClose}
                  className={`mx-2 flex min-h-11 items-center gap-3 rounded-control px-2 text-sm font-semibold transition-colors ${on ? "bg-ink text-white" : "hover:bg-surface"}`}
                >
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${on ? "bg-brand-500 text-on-brand" : "bg-surface text-ink"}`}>
                    <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  </span>
                  <span className="flex-1">{c.name}</span>
                  {c.subs.length ? <ChevronRight className={`h-4 w-4 ${on ? "text-brand-500" : "text-muted"}`} aria-hidden /> : null}
                </Link>
              </li>
            );
          })}
          {categories.length === 0 && <li className="px-4 py-3 text-sm text-muted">Categories are unavailable right now.</li>}
          <li className="mx-2 mt-2 grid grid-cols-2 gap-2 border-t border-border pt-2">
            <Link href="/products" onClick={onClose} className="flex min-h-10 items-center justify-center rounded-control border border-ink/20 px-2 text-xs font-bold hover:border-ink hover:bg-ink hover:text-white">
              All products
            </Link>
            <Link href="/brands" onClick={onClose} className="flex min-h-10 items-center justify-center rounded-control border border-ink/20 px-2 text-xs font-bold hover:border-ink hover:bg-ink hover:text-white">
              Shop by brand
            </Link>
          </li>
        </ul>
        {current ? (
          <div className="w-[26rem] p-5">
            <div className="mb-3 flex items-center justify-between gap-4 border-b border-border pb-3">
              <p className="font-display text-lg font-extrabold">{current.name}</p>
              <Link href={`/categories/${current.slug}`} onClick={onClose} className="inline-flex min-h-8 items-center gap-1 text-xs font-bold hover:underline">
                View all <ChevronRight className="h-3.5 w-3.5 text-brand-500" aria-hidden />
              </Link>
            </div>
            <ul className="grid grid-cols-2 gap-2">
              {current.subs.map((s) => {
                const SubIcon = categoryIcon(s.name);
                return (
                  <li key={s.slug}>
                    <Link href={`/categories/${current.slug}?sub=${s.slug}`} onClick={onClose} className="group flex min-h-11 items-center gap-2.5 rounded-control border border-border px-2.5 text-[13px] font-semibold transition-colors hover:border-brand-500">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface text-ink transition-colors group-hover:bg-brand-500 group-hover:text-on-brand">
                        <SubIcon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                      </span>
                      {s.name}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
