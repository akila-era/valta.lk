"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BadgePercent, ChevronRight, Search, X } from "lucide-react";
import { categoryIcon } from "@/components/ui/category-icon";

export interface DrawerCategory {
  slug: string;
  name: string;
  subs: { slug: string; name: string }[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  categories: DrawerCategory[];
  hasDeals: boolean;
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
export function CategoryDrawer({ open, onClose, categories, hasDeals, initialTab = "categories" }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<"categories" | "menu">(initialTab);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [term, setTerm] = useState("");
  const panel = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);
  const id = useId();

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
        aria-label="Browse VALTA.LK"
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
            placeholder="Search for products"
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
          {tab === "categories" ? (
            <ul id={`${id}-categories`} role="tabpanel" aria-labelledby={`${id}-categories-tab`}>
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
