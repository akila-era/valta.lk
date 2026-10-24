"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { effectivePrice } from "@/lib/erp/product-utils";
import { formatLkr } from "@/lib/utils/money";
import { CatalogueImage } from "@/components/products/catalogue-image";

interface Suggestion {
  id: string;
  slug: string;
  name: string;
  brand?: string | null;
  sku?: string | null;
  specs?: { Model?: string };
  price: number;
  salePrice?: number | null;
  images?: string[];
}

/**
 * Search combobox. Works without JavaScript (plain GET form to /search); with JavaScript it suggests real
 * products from the catalogue API as the shopper types.
 */
export function SearchBox({ autoFocus, size = "md", initialQuery = "" }: { autoFocus?: boolean; size?: "md" | "lg"; initialQuery?: string }) {
  const router = useRouter();
  const listId = useId();
  const [q, setQ] = useState(initialQuery);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const [armed, setArmed] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!armed) return;
    const term = q.trim();
    if (term.length < 2) return;
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/store/products?q=${encodeURIComponent(term)}&pageSize=5`, { signal: ctl.signal });
        if (!res.ok) throw new Error();
        const data = (await res.json()) as { items: Suggestion[] };
        setItems(data.items);
        setActive(-1);
        setOpen(true);
      } catch (e) {
        if ((e as Error)?.name !== "AbortError") {
          setItems([]);
          setOpen(false);
        }
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q, armed]);

  function clear() {
    setQ("");
    setItems([]);
    setOpen(false);
    setActive(-1);
    setArmed(false);
  }

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const term = q.trim();
  const visible = open && term.length >= 2;
  const total = items.length + 1; // the final option is "see all results"

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") return setOpen(false);
    if (!visible) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % total);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a <= 0 ? total - 1 : a - 1));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      setOpen(false);
      router.push(active < items.length ? `/products/${items[active].slug}` : `/search?q=${encodeURIComponent(term)}`);
    }
  }

  return (
    <div ref={wrap} className="relative">
      <form action="/search" role="search" onSubmit={() => setOpen(false)}>
        <label htmlFor={`${listId}-input`} className="sr-only">
          Search products
        </label>
        <input
          id={`${listId}-input`}
          name="q"
          type="search"
          value={q}
          onChange={(e) => {
            setArmed(true);
            setQ(e.target.value);
            if (e.target.value.trim().length < 2) {
              setItems([]);
              setOpen(false);
            }
          }}
          onFocus={() => {
            // The search page autofocuses with the query already shown; open suggestions only once the shopper edits it.
            if (q.trim().length >= 2 && q !== initialQuery) setArmed(true);
            if (items.length) setOpen(true);
          }}
          onKeyDown={onKeyDown}
          placeholder={size === "lg" ? "Search for mobile phones, accessories, electronics..." : "Search name, brand or model"}
          maxLength={100}
          autoFocus={autoFocus}
          autoComplete="off"
          role="combobox"
          aria-expanded={visible}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={visible && active >= 0 ? `${listId}-opt-${active}` : undefined}
          className={`input [&::-webkit-search-cancel-button]:appearance-none ${size === "lg" ? "min-h-12 rounded-full border-border bg-surface/90 py-2.5 pl-11 pr-24 text-[15px] focus:border-brand-500 focus:bg-bg" : "pl-11 pr-16"}`}
        />
        {size === "lg" && <Search className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted" strokeWidth={1.75} aria-hidden />}
        {size === "lg" ? (
          <button type="submit" className="absolute bottom-1.5 right-1.5 top-1.5 flex w-12 items-center justify-center rounded-full bg-brand-500 text-on-brand transition-colors hover:bg-brand-600 hover:text-white" aria-label="Search">
            <Search className="h-[18px] w-[18px]" strokeWidth={2.5} aria-hidden />
          </button>
        ) : (
          <button type="submit" className="absolute left-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:text-ink" aria-label="Search">
            <Search className="h-4 w-4" aria-hidden />
          </button>
        )}
        {q && (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear search"
            className={`absolute top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:text-ink ${size === "lg" ? "right-[3.25rem]" : "right-1"}`}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
        {loading && <Loader2 className={`absolute top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted ${size === "lg" ? "right-[3.75rem]" : "right-10"}`} aria-hidden />}
      </form>

      {visible && (
        <ul id={listId} role="listbox" aria-label="Search suggestions" className="absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-border bg-bg py-1 text-ink shadow-overlay">
          {items.length === 0 && !loading && <li role="presentation" className="px-4 py-3 text-sm text-muted">No matching products</li>}
          {items.map((s, i) => (
            <li key={s.id} role="option" id={`${listId}-opt-${i}`} aria-selected={active === i}>
              <Link
                href={`/products/${s.slug}`}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 px-3 py-2 text-sm ${active === i ? "bg-brand-50" : "hover:bg-surface"}`}
              >
                <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-border bg-surface">
                  <CatalogueImage src={s.images?.[0]} alt="" sizes="44px" padding="p-1" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{s.name}</span>
                  {(s.brand || s.specs?.Model || s.sku) && (
                    <span className="block truncate text-xs text-muted">{[s.brand, s.specs?.Model, s.sku].filter(Boolean).join(" · ")}</span>
                  )}
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-display font-semibold tabular-nums text-ink">{formatLkr(effectivePrice(s))}</span>
                  {effectivePrice(s) < s.price && (
                    <span className="block text-xs text-muted">
                      <span className="sr-only">Regular price</span>
                      <s>{formatLkr(s.price)}</s>
                    </span>
                  )}
                </span>
              </Link>
            </li>
          ))}
          <li role="option" id={`${listId}-opt-${items.length}`} aria-selected={active === items.length} className="border-t border-border">
            <Link
              href={`/search?q=${encodeURIComponent(term)}`}
              onClick={() => setOpen(false)}
              className={`block px-4 py-2.5 text-sm font-semibold text-brand-600 ${active === items.length ? "bg-brand-50" : "hover:bg-surface"}`}
            >
              See all results for “{term}”
            </Link>
          </li>
        </ul>
      )}
    </div>
  );
}
