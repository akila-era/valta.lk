"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BadgeCheck, BadgePercent, Boxes, ChevronRight, Loader2, Search, X } from "lucide-react";
import { formatLkr } from "@/lib/utils/money";
import { categoryIcon } from "@/components/ui/category-icon";

export interface DrawerCategory {
  slug: string;
  name: string;
  subs: { slug: string; name: string }[];
}

type Hit = { slug: string; name: string; sku?: string; brand?: string | null; price?: number | null; salePrice?: number | null };

interface Props {
  open: boolean;
  onClose: () => void;
  categories: DrawerCategory[];
  hasDeals: boolean;
  hasBrands?: boolean;
  initialTab?: "categories" | "menu";
}

const MENU_LINKS = [
  { href: "/", label: "Home" },
  { href: "/products", label: "All products" },
  { href: "/#products", label: "New arrivals" },
  { href: "/track-order", label: "Track order" },
  { href: "/wishlist", label: "Wishlist" },
  { href: "/cart", label: "Cart" },
  { href: "/about", label: "About us" },
  { href: "/contact", label: "Contact us" },
  { href: "/shipping-policy", label: "Shipping policy" },
  { href: "/returns-policy", label: "Returns policy" },
];

/**
 * Off-canvas navigation drawer (left side): search, an "All categories" tab with expandable sub-categories,
 * and a "Menu" tab with site pages. Used by the desktop "All Categories" button and the mobile menu button.
 */
export function CategoryDrawer({ open, onClose, categories, hasDeals, hasBrands = false, initialTab = "categories" }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<"categories" | "menu">(initialTab);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [term, setTerm] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [searching, setSearching] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);
  const id = useId();
  const q = term.trim();

  // Live results while typing: the catalogue search matches product name, SKU, brand and category.
  useEffect(() => {
    if (!open || q.length < 2) return;
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/store/products?q=${encodeURIComponent(q)}&pageSize=8`, { signal: ctl.signal });
        if (!res.ok) throw new Error();
        const data = (await res.json()) as { items?: Hit[] };
        setHits(data.items ?? []);
      } catch (e) {
        if ((e as Error)?.name !== "AbortError") setHits([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q, open]);

  // Focus management, Escape to close, scroll lock and a simple focus trap while open.
  useEffect(() => {
    if (!open) return;
    restoreFocus.current = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return onClose();
      if (e.key !== "Tab" || !panel.current) return;
      const f = panel.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])');
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      restoreFocus.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const row = "flex min-h-[3.25rem] flex-1 items-center gap-3.5 px-5 text-[15px] font-medium text-ink hover:bg-surface hover:text-brand-600";
  const tabBtn = (t: "categories" | "menu", label: string) => (
    <button
      type="button"
      role="tab"
      id={`${id}-${t}-tab`}
      aria-selected={tab === t}
      aria-controls={`${id}-${t}`}
      onClick={() => setTab(t)}
      className={`flex-1 border-b-2 py-4 text-[13px] font-bold uppercase tracking-wide transition-colors ${
        tab === t ? "border-brand-500 bg-surface text-ink" : "border-transparent bg-bg text-muted hover:text-ink"
      }`}
    >
      {label}
    </button>
  );

  // Portal to <body>: the sticky header uses backdrop-filter, which would otherwise clip a fixed-position drawer.
  return createPortal(
    <div className="fixed inset-0 z-[60]" role="presentation">
      <button type="button" aria-label="Close menu overlay" tabIndex={-1} onClick={onClose} className="absolute inset-0 animate-[fade-in_0.2s_ease-out] bg-ink/50" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Browse VOLTA.LK"
        className="absolute inset-y-0 left-0 flex w-[88%] max-w-[22rem] animate-[slide-in_0.25s_cubic-bezier(0.2,0.7,0.2,1)] flex-col bg-bg shadow-2xl"
      >
        <div className="flex items-center justify-end border-b border-border px-5 py-4">
          <button type="button" onClick={onClose} className="inline-flex min-h-10 items-center gap-2 text-[15px] font-medium hover:text-brand-600" data-autofocus>
            <X className="h-5 w-5" aria-hidden /> Close
          </button>
        </div>

        <form
          role="search"
          className="relative border-b border-border"
          onSubmit={(e) => {
            e.preventDefault();
            const q = term.trim();
            if (!q) return;
            onClose();
            router.push(`/search?q=${encodeURIComponent(q)}`);
          }}
        >
          <label htmlFor={`${id}-q`} className="sr-only">Search for products</label>
          <input
            id={`${id}-q`}
            type="search"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search name, SKU or brand"
            maxLength={100}
            className="h-16 w-full bg-bg pl-5 pr-14 text-[15px] outline-none placeholder:text-muted focus-visible:bg-surface"
          />
          <button type="submit" aria-label="Search" className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center text-muted hover:text-ink">
            <Search className="h-5 w-5" aria-hidden />
          </button>
        </form>

        <div role="tablist" aria-label="Navigation" className="flex">
          {tabBtn("categories", "All categories")}
          {tabBtn("menu", "Menu")}
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain">
          {q.length >= 2 ? (
            <div role="region" aria-label="Search results" aria-live="polite">
              {searching && <p className="flex items-center gap-2 px-5 py-4 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Searching…</p>}
              {!searching && hits.length === 0 && <p className="px-5 py-6 text-sm text-muted">No products found for &ldquo;{q}&rdquo;. Try a name, SKU or brand.</p>}
              <ul>
                {hits.map((h) => (
                  <li key={h.slug} className="border-b border-border">
                    <Link href={`/products/${encodeURIComponent(h.slug)}`} onClick={onClose} className="flex min-h-14 items-center justify-between gap-3 px-5 py-2.5 hover:bg-surface">
                      <span className="min-w-0">
                        <span className="block truncate text-[15px] font-medium text-ink">{h.name}</span>
                        <span className="block truncate text-xs text-muted">{[h.brand, h.sku].filter(Boolean).join(" · ")}</span>
                      </span>
                      {typeof (h.salePrice ?? h.price) === "number" && <span className="shrink-0 text-sm font-semibold tabular-nums">{formatLkr((h.salePrice ?? h.price) as number)}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
              {hits.length > 0 && (
                <Link href={`/search?q=${encodeURIComponent(q)}`} onClick={onClose} className="flex min-h-12 items-center justify-between px-5 text-sm font-semibold text-brand-600 hover:bg-surface">
                  See all results <ChevronRight className="h-4 w-4" aria-hidden />
                </Link>
              )}
            </div>
          ) : tab === "categories" ? (
            <ul id={`${id}-categories`} role="tabpanel" aria-labelledby={`${id}-categories-tab`}>
              <li className="flex border-b border-border">
                <Link href="/wholesale" onClick={onClose} className={`${row} font-semibold text-brand-600`}>
                  <Boxes className="h-5 w-5 shrink-0" aria-hidden />
                  Apply Wholesale
                </Link>
              </li>
              {hasBrands && (
                <li className="flex border-b border-border">
                  <Link href="/brands" onClick={onClose} className={`${row} font-semibold text-brand-600`}>
                    <BadgeCheck className="h-5 w-5 shrink-0" aria-hidden />
                    Brands
                  </Link>
                </li>
              )}
              {hasDeals && (
                <li className="flex border-b border-border">
                  <Link href="/products?sale=1" onClick={onClose} className={`${row} font-semibold text-brand-600`}>
                    <BadgePercent className="h-5 w-5 shrink-0" aria-hidden />
                    Deals
                  </Link>
                </li>
              )}
              {categories.map((c) => {
                const Icon = categoryIcon(c.name);
                const isOpen = expanded === c.slug;
                const subId = `${id}-sub-${c.slug}`;
                return (
                  <li key={c.slug} className="border-b border-border">
                    <div className="flex">
                      <Link href={`/categories/${c.slug}`} onClick={onClose} className={row}>
                        <Icon className="h-5 w-5 shrink-0 text-muted" aria-hidden />
                        {c.name}
                      </Link>
                      {c.subs.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setExpanded(isOpen ? null : c.slug)}
                          aria-expanded={isOpen}
                          aria-controls={subId}
                          aria-label={`${isOpen ? "Hide" : "Show"} ${c.name} sub-categories`}
                          className="flex w-14 shrink-0 items-center justify-center border-l border-border text-muted hover:bg-surface hover:text-ink"
                        >
                          <ChevronRight className={`h-5 w-5 transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`} aria-hidden />
                        </button>
                      )}
                    </div>
                    {isOpen && (
                      <ul id={subId} className="bg-surface pb-2">
                        <li>
                          <Link href={`/categories/${c.slug}`} onClick={onClose} className="block px-5 py-2.5 pl-[3.6rem] text-sm font-semibold hover:text-brand-600">
                            All {c.name}
                          </Link>
                        </li>
                        {c.subs.map((s) => (
                          <li key={s.slug}>
                            <Link href={`/categories/${c.slug}?sub=${s.slug}`} onClick={onClose} className="block px-5 py-2.5 pl-[3.6rem] text-sm hover:text-brand-600">
                              {s.name}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
              {categories.length === 0 && <li className="px-5 py-6 text-sm text-muted">Categories are unavailable right now.</li>}
            </ul>
          ) : (
            <ul id={`${id}-menu`} role="tabpanel" aria-labelledby={`${id}-menu-tab`}>
              {MENU_LINKS.map((l) => (
                <li key={l.href} className="flex border-b border-border">
                  <Link href={l.href} onClick={onClose} className={row}>{l.label}</Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
