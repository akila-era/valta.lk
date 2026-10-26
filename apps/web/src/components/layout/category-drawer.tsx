"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, Flame, Search, X } from "lucide-react";
import { categoryIcon } from "@/components/ui/category-icon";
import { Wordmark } from "./wordmark";

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
  { href: "/products", label: "All Products" },
  { href: "/#new-arrivals", label: "New Arrivals" },
  { href: "/track-order", label: "Track Order" },
  { href: "/wishlist", label: "Wishlist" },
  { href: "/cart", label: "Cart" },
  { href: "/about", label: "About Us" },
  { href: "/contact", label: "Contact Us" },
  { href: "/shipping-policy", label: "Shipping Policy" },
  { href: "/returns-policy", label: "Returns Policy" },
];

/**
 * Phone navigation drawer (left side): search, an "All categories" tab with expandable sub-categories, and a "Menu"
 * tab with site pages, in the store's white and orange theme.
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

  const tabBtn = (t: "categories" | "menu", label: string) => (
    <button
      type="button"
      role="tab"
      id={`${id}-${t}-tab`}
      aria-selected={tab === t}
      aria-controls={`${id}-${t}`}
      onClick={() => setTab(t)}
      className={`relative flex-1 py-3 text-xs font-bold uppercase tracking-wide transition-colors ${
        tab === t
          ? "text-brand-600 after:absolute after:inset-x-6 after:bottom-0 after:h-[3px] after:rounded-t-full after:bg-brand-500 after:shadow-[0_0_8px_rgb(255_92_0/0.7)]"
          : "text-muted hover:text-ink"
      }`}
    >
      {label}
    </button>
  );

  return createPortal(
    <div className="fixed inset-0 z-[60]" role="presentation">
      <button
        type="button"
        aria-label="Close menu overlay"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 animate-[fade-in_0.2s_ease-out] bg-black/50 backdrop-blur-xs"
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Browse VOLTA.LK"
        className="absolute inset-y-0 left-0 flex w-[86%] max-w-[20rem] animate-[slide-in_0.25s_cubic-bezier(0.2,0.7,0.2,1)] flex-col bg-bg text-ink shadow-[0_20px_60px_-15px_rgba(27,23,20,0.35)]"
      >
        {/* Orange header band with the wordmark and the close button */}
        <div className="flex items-center justify-between bg-brand-500 px-4 py-3 text-on-brand">
          <Wordmark className="text-[1.4rem] [&_.text-brand-500]:text-white" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="flex h-9 w-9 items-center justify-center rounded-control bg-white/90 text-ink transition-colors hover:bg-white focus-visible:outline-ink"
            data-autofocus
          >
            <X className="h-4.5 w-4.5" aria-hidden />
          </button>
        </div>

        {/* Search input in a pill container */}
        <form
          role="search"
          className="px-4 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            const q = term.trim();
            if (!q) return;
            onClose();
            router.push(`/search?q=${encodeURIComponent(q)}`);
          }}
        >
          <label htmlFor={`${id}-q`} className="sr-only">Search for products</label>
          <div className="relative flex items-center">
            <Search className="pointer-events-none absolute left-3.5 h-4 w-4 text-muted" aria-hidden />
            <input
              id={`${id}-q`}
              type="search"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Search products..."
              maxLength={100}
              className="h-10 w-full rounded-control border-2 border-brand-500 bg-bg pl-10 pr-10 text-[13.5px] outline-none transition-colors placeholder:text-muted focus-visible:ring-2 focus-visible:ring-brand-500/30"
            />
            {term ? (
              <button
                type="button"
                onClick={() => setTerm("")}
                aria-label="Clear search"
                className="absolute right-3 text-muted hover:text-ink"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : (
              <button
                type="submit"
                aria-label="Search"
                className="absolute right-1 flex h-8 w-8 items-center justify-center rounded-control bg-brand-500 text-on-brand transition-colors hover:bg-brand-hover"
              >
                <Search className="h-3.5 w-3.5" aria-hidden />
              </button>
            )}
          </div>
        </form>

        {/* Underlined tabs */}
        <div role="tablist" aria-label="Navigation" className="mb-1 border-b border-border">
          <div className="flex">
            {tabBtn("categories", "All Categories")}
            {tabBtn("menu", "Menu")}
          </div>
        </div>

        {/* Content list */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-1">
          {tab === "categories" ? (
            <ul id={`${id}-categories`} role="tabpanel" aria-labelledby={`${id}-categories-tab`} className="space-y-1">
              {hasDeals && (
                <li className="mb-2">
                  <Link
                    href="/products?sale=1"
                    onClick={onClose}
                    className="group flex items-center justify-between rounded-control bg-brand-50 p-2.5 text-[13.5px] font-bold text-brand-700 transition-colors hover:bg-brand-100"
                  >
                    <span className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 items-center justify-center rounded-control bg-brand-500 text-on-brand shadow-neon">
                        <Flame className="h-4 w-4 fill-brand-500/30" strokeWidth={2} aria-hidden />
                      </span>
                      Hot Deals
                    </span>
                    <span className="rounded-sm bg-brand-500 px-2 py-0.5 text-[10.5px] font-extrabold uppercase tracking-wider text-on-brand">
                      Sale
                    </span>
                  </Link>
                </li>
              )}
              {categories.map((c) => {
                const Icon = categoryIcon(c.name);
                const isOpen = expanded === c.slug;
                const subId = `${id}-sub-${c.slug}`;
                return (
                  <li key={c.slug} className="group/item">
                    <div className="flex items-center justify-between rounded-control transition-colors hover:bg-brand-50">
                      <Link
                        href={`/categories/${c.slug}`}
                        onClick={onClose}
                        className="flex flex-1 items-center gap-3 px-2.5 py-2 text-[13.5px] font-medium text-ink transition-colors hover:text-brand-600"
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control border border-border bg-bg text-muted transition-colors group-hover/item:border-brand-500/30 group-hover/item:bg-brand-50 group-hover/item:text-brand-600">
                          <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                        </span>
                        {c.name}
                      </Link>
                      {c.subs.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setExpanded(isOpen ? null : c.slug)}
                          aria-expanded={isOpen}
                          aria-controls={subId}
                          aria-label={`${isOpen ? "Hide" : "Show"} ${c.name} sub-categories`}
                          className="mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-muted transition-colors hover:bg-brand-100/50 hover:text-brand-600"
                        >
                          <ChevronRight className={`h-4 w-4 transition-transform duration-200 ${isOpen ? "rotate-90 text-brand-600" : ""}`} aria-hidden />
                        </button>
                      )}
                    </div>
                    {isOpen && (
                      <ul id={subId} className="my-1.5 ml-5 space-y-0.5 border-l-2 border-brand-500/25 py-1 pl-3">
                        <li>
                          <Link
                            href={`/categories/${c.slug}`}
                            onClick={onClose}
                            className="block rounded-control px-2.5 py-1.5 text-xs font-semibold text-ink/80 transition-colors hover:bg-brand-50 hover:text-brand-600"
                          >
                            All {c.name}
                          </Link>
                        </li>
                        {c.subs.map((s) => (
                          <li key={s.slug}>
                            <Link
                              href={`/categories/${c.slug}?sub=${s.slug}`}
                              onClick={onClose}
                              className="block rounded-control px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-brand-50 hover:text-brand-600"
                            >
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
            <ul id={`${id}-menu`} role="tabpanel" aria-labelledby={`${id}-menu-tab`} className="space-y-0.5">
              {MENU_LINKS.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    onClick={onClose}
                    className="flex items-center justify-between rounded-control px-3 py-2.5 text-[13.5px] font-medium text-ink transition-colors hover:bg-brand-50 hover:text-brand-600"
                  >
                    {l.label}
                    <ChevronRight className="h-4 w-4 text-muted/50" />
                  </Link>
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
