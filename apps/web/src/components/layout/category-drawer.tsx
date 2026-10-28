"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Flame, LayoutGrid, Search, X } from "lucide-react";
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
  { href: "/products", label: "All Products" },
  { href: "/brands", label: "Shop by Brand" },
  { href: "/#new-arrivals", label: "New Arrivals" },
  { href: "/track-order", label: "Track Order" },
  { href: "/wishlist", label: "Wishlist" },
  { href: "/cart", label: "Cart" },
  { href: "/about", label: "About Us" },
  { href: "/contact", label: "Contact Us" },
  { href: "/shipping-policy", label: "Shipping Policy" },
  { href: "/returns-policy", label: "Returns Policy" },
];

/** One flat drawer row: full width, 50px tall, divider underneath. */
const ROW = "flex min-h-[50px] flex-1 items-center gap-3 px-5 text-sm font-medium text-ink transition-colors hover:bg-surface hover:text-brand-600";

/**
 * "All Categories" drawer, used on every screen size (layout modelled on ugreen.lk): a white full-height panel from the
 * left with Close, a product search, "All categories" / "Menu" tabs, and flat category rows. A category with
 * sub-categories has its own › button that slides in a second level with a Back row. Escape, the overlay or choosing a
 * link closes it; focus is trapped while open and returns to the opener afterwards.
 */
export function CategoryDrawer({ open, onClose, categories, hasDeals, initialTab = "categories" }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<"categories" | "menu">(initialTab);
  const [level, setLevel] = useState<string | null>(null); // slug of the category whose sub-categories are shown
  const [term, setTerm] = useState("");
  const panel = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);
  const returnTo = useRef<string | null>(null); // the › button to refocus after Back
  const id = useId();

  // Focus management, Escape to close, scroll lock and a simple focus trap while open.
  useEffect(() => {
    if (!open) return;
    restoreFocus.current = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setLevel(null);
        returnTo.current = null;
        return onClose();
      }
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

  // Moving between levels keeps keyboard focus in a sensible place: Back on the way in, the › button on the way out.
  useEffect(() => {
    if (!open) return;
    if (level) panel.current?.querySelector<HTMLElement>("[data-back]")?.focus();
    else if (returnTo.current) panel.current?.querySelector<HTMLElement>(`[data-sub-toggle="${returnTo.current}"]`)?.focus();
  }, [level, open]);

  if (!open || typeof document === "undefined") return null;

  // Every way of closing starts the next opening fresh: top level, focus on Close.
  const close = () => {
    setLevel(null);
    returnTo.current = null;
    onClose();
  };
  const current = level ? categories.find((c) => c.slug === level) : null;

  const tabBtn = (t: "categories" | "menu", label: string) => (
    <button
      type="button"
      role="tab"
      id={`${id}-${t}-tab`}
      aria-selected={tab === t}
      aria-controls={`${id}-${t}`}
      onClick={() => setTab(t)}
      className={`relative flex-1 py-4 text-[13px] font-semibold uppercase tracking-wide transition-colors ${
        tab === t ? "bg-bg text-ink after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-brand-500" : "bg-surface text-muted hover:text-ink"
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
        onClick={close}
        className="absolute inset-0 animate-[fade-in_0.2s_ease-out] bg-black/60"
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Browse VOLTA.LK"
        className="absolute inset-y-0 left-0 flex w-[86%] max-w-[340px] animate-[slide-in_0.25s_cubic-bezier(0.2,0.7,0.2,1)] flex-col bg-bg text-ink shadow-[8px_0_40px_-12px_rgb(0_0_0/0.35)]"
      >
        {/* Close */}
        <div className="flex h-16 shrink-0 items-center justify-end border-b border-border px-4">
          <button
            type="button"
            onClick={close}
            aria-label="Close menu"
            data-autofocus
            className="inline-flex min-h-10 items-center gap-1.5 rounded-control px-2 text-[15px] font-medium text-ink transition-colors hover:text-brand-600"
          >
            <X className="h-5 w-5" aria-hidden /> Close
          </button>
        </div>

        {/* Search */}
        <form
          role="search"
          aria-label="Search from the menu"
          className="shrink-0 border-b border-border"
          onSubmit={(e) => {
            e.preventDefault();
            const q = term.trim();
            if (!q) return;
            close();
            router.push(`/search?q=${encodeURIComponent(q)}`);
          }}
        >
          <label htmlFor={`${id}-q`} className="sr-only">Search for products</label>
          <div className="relative flex items-center">
            <input
              id={`${id}-q`}
              type="search"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Search for products"
              maxLength={100}
              className="h-[70px] w-full bg-bg pl-5 pr-14 text-sm text-ink outline-none placeholder:font-medium placeholder:text-ink/60 focus-visible:bg-surface"
            />
            <button type="submit" aria-label="Search" className="absolute right-2 flex h-11 w-11 items-center justify-center text-ink transition-colors hover:text-brand-600">
              <Search className="h-5 w-5" aria-hidden />
            </button>
          </div>
        </form>

        {/* Tabs */}
        <div role="tablist" aria-label="Navigation" className="flex shrink-0 border-b border-border">
          {tabBtn("categories", "All categories")}
          {tabBtn("menu", "Menu")}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {tab === "categories" ? (
            <div id={`${id}-categories`} role="tabpanel" aria-labelledby={`${id}-categories-tab`}>
              {current ? (
                // Second level: Back, the whole category, then its sub-categories. Slides in from the right.
                <ul key={current.slug} aria-label={`${current.name} sub-categories`} className="animate-[slide-in-right_0.22s_cubic-bezier(0.2,0.7,0.2,1)]">
                  <li className="flex border-b border-border">
                    <button type="button" data-back onClick={() => setLevel(null)} className={`${ROW} font-semibold`}>
                      <ChevronLeft className="h-4 w-4 text-muted" aria-hidden /> Back
                    </button>
                  </li>
                  <li className="flex border-b border-border">
                    <Link href={`/categories/${current.slug}`} onClick={close} className={`${ROW} font-semibold`}>
                      <LayoutGrid className="h-[18px] w-[18px] text-brand-500" strokeWidth={1.75} aria-hidden /> All {current.name}
                    </Link>
                  </li>
                  {current.subs.map((s) => {
                    const SubIcon = categoryIcon(s.name);
                    return (
                      <li key={s.slug} className="flex border-b border-border">
                        <Link href={`/categories/${current.slug}?sub=${s.slug}`} onClick={close} className={ROW}>
                          <SubIcon className="h-[18px] w-[18px] text-muted" strokeWidth={1.75} aria-hidden /> {s.name}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <ul aria-label="Categories">
                  {hasDeals && (
                    <li className="flex border-b border-border">
                      <Link href="/products?sale=1" onClick={close} className={`${ROW} font-semibold text-brand-600`}>
                        <Flame className="h-[18px] w-[18px] fill-brand-500 text-brand-500" strokeWidth={1.75} aria-hidden /> Hot Deals
                      </Link>
                    </li>
                  )}
                  {categories.map((c) => {
                    const Icon = categoryIcon(c.name);
                    return (
                      <li key={c.slug} className="flex border-b border-border">
                        <Link href={`/categories/${c.slug}`} onClick={close} className={ROW}>
                          <Icon className="h-[18px] w-[18px] text-muted" strokeWidth={1.75} aria-hidden /> {c.name}
                        </Link>
                        {c.subs.length > 0 && (
                          <button
                            type="button"
                            data-sub-toggle={c.slug}
                            onClick={() => {
                              returnTo.current = c.slug;
                              setLevel(c.slug);
                            }}
                            aria-expanded={false}
                            aria-label={`Show ${c.name} sub-categories`}
                            className="flex w-[50px] shrink-0 items-center justify-center border-l border-border text-ink transition-colors hover:bg-surface hover:text-brand-600"
                          >
                            <ChevronRight className="h-4 w-4" aria-hidden />
                          </button>
                        )}
                      </li>
                    );
                  })}
                  {categories.length === 0 && <li className="px-5 py-6 text-sm text-muted">Categories are unavailable right now.</li>}
                  <li className="flex border-b border-border">
                    <Link href="/products" onClick={close} className={`${ROW} font-semibold`}>
                      <LayoutGrid className="h-[18px] w-[18px] text-brand-500" strokeWidth={1.75} aria-hidden /> All Products
                    </Link>
                  </li>
                </ul>
              )}
            </div>
          ) : (
            <ul id={`${id}-menu`} role="tabpanel" aria-labelledby={`${id}-menu-tab`}>
              {MENU_LINKS.map((l) => (
                <li key={l.href} className="flex border-b border-border">
                  <Link href={l.href} onClick={close} className={`${ROW} justify-between`}>
                    {l.label}
                    <ChevronRight className="h-4 w-4 text-muted/60" aria-hidden />
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
