"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Layers, Loader2, Search, Tag, X } from "lucide-react";
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

interface BrandHit {
  name: string;
  count: number;
}

interface CategoryHit {
  slug: string;
  name: string;
  count: number;
}

/** One selectable row in the list, in the order the arrow keys move through them. */
interface Option {
  key: string;
  href: string;
}

const MAX_GROUP = 2;

/** Catalogue names that contain what was typed, names that start with it first. Real brands and categories only. */
function matching<T extends { name: string }>(list: T[] | undefined, term: string): T[] {
  const t = term.toLowerCase();
  return (list ?? [])
    .filter((x) => x.name.toLowerCase().includes(t))
    .sort((a, b) => Number(b.name.toLowerCase().startsWith(t)) - Number(a.name.toLowerCase().startsWith(t)) || a.name.localeCompare(b.name))
    .slice(0, MAX_GROUP);
}

/**
 * Search combobox. Works without JavaScript (plain GET form to /search); with JavaScript it suggests real brands,
 * categories and products from the catalogue API as the shopper types.
 */
export function SearchBox({ autoFocus, size = "md", initialQuery = "" }: { autoFocus?: boolean; size?: "md" | "lg"; initialQuery?: string }) {
  const router = useRouter();
  const listId = useId();
  const [q, setQ] = useState(initialQuery);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [brands, setBrands] = useState<BrandHit[]>([]);
  const [cats, setCats] = useState<CategoryHit[]>([]);
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
        // The same response already lists every brand and category in the catalogue, so no extra request is needed.
        const data = (await res.json()) as { items: Suggestion[]; brands?: BrandHit[]; categories?: CategoryHit[] };
        setItems(data.items);
        setBrands(matching(data.brands, term));
        setCats(matching(data.categories, term));
        setActive(-1);
        setOpen(true);
      } catch (e) {
        if ((e as Error)?.name !== "AbortError") {
          setItems([]);
          setBrands([]);
          setCats([]);
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

  function reset() {
    setItems([]);
    setBrands([]);
    setCats([]);
    setOpen(false);
  }

  function clear() {
    setQ("");
    reset();
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
  const hasHits = items.length + brands.length + cats.length > 0;

  // Rows in display order: brands, categories, products, then "see all results".
  const options: Option[] = [
    ...brands.map((b) => ({ key: `b-${b.name}`, href: `/products?brand=${encodeURIComponent(b.name)}` })),
    ...cats.map((c) => ({ key: `c-${c.slug}`, href: `/categories/${c.slug}` })),
    ...items.map((s) => ({ key: `p-${s.id}`, href: `/products/${s.slug}` })),
    { key: "all", href: `/search?q=${encodeURIComponent(term)}` },
  ];
  const total = options.length;
  const optId = (i: number) => `${listId}-opt-${i}`;
  const rowClass = (i: number) => `flex items-center gap-3 px-3 py-2 text-sm ${active === i ? "bg-brand-50" : "hover:bg-surface"}`;
  const heading = "px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted";

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
      router.push(options[active].href);
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
            if (e.target.value.trim().length < 2) reset();
          }}
          onFocus={() => {
            if (q.trim().length >= 2) setArmed(true);
            if (items.length || brands.length || cats.length) setOpen(true);
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
          aria-activedescendant={visible && active >= 0 ? optId(active) : undefined}
          className={`input [&::-webkit-search-cancel-button]:appearance-none ${size === "lg" ? "min-h-12 rounded-full border-transparent bg-surface pl-12 pr-28 text-base md:text-[15px]" : "pl-11 pr-16"}`}
        />
        {size === "lg" && <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" strokeWidth={1.75} aria-hidden />}
        {size === "lg" ? (
          <button type="submit" className="absolute bottom-1 right-1 top-1 flex w-14 items-center justify-center rounded-full bg-brand-500 text-on-brand transition-colors hover:bg-brand-400" aria-label="Search">
            <Search className="h-5 w-5" strokeWidth={2.5} aria-hidden />
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
            className={`absolute top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:text-ink ${size === "lg" ? "right-[3.25rem]" : "right-0"}`}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
        {loading && <Loader2 className={`absolute top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted ${size === "lg" ? "right-[4.5rem]" : "right-10"}`} aria-hidden />}
      </form>

      {visible && (
        <ul id={listId} role="listbox" aria-label="Search suggestions" className="absolute inset-x-0 top-full z-50 mt-2 max-h-[min(32rem,70vh)] overflow-y-auto rounded-2xl border border-border bg-bg py-1 shadow-overlay">
          {!hasHits && !loading && <li role="presentation" className="px-4 py-3 text-sm text-muted">No matching products, brands or categories</li>}

          {brands.length > 0 && (
            <li role="presentation">
              <p aria-hidden className={heading}>Brands</p>
              <ul role="group" aria-label="Brands">
                {brands.map((b, n) => {
                  const i = n;
                  return (
                    <li key={options[i].key} role="presentation">
                      <Link href={options[i].href} role="option" id={optId(i)} aria-selected={active === i} tabIndex={-1} onClick={() => setOpen(false)} className={rowClass(i)}>
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-surface text-muted"><Tag className="h-5 w-5" aria-hidden /></span>
                        <span className="min-w-0 flex-1 truncate font-medium">{b.name}</span>
                        <span className="shrink-0 text-xs text-muted">{b.count} {b.count === 1 ? "product" : "products"}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </li>
          )}

          {cats.length > 0 && (
            <li role="presentation">
              <p aria-hidden className={heading}>Categories</p>
              <ul role="group" aria-label="Categories">
                {cats.map((c, n) => {
                  const i = brands.length + n;
                  return (
                    <li key={options[i].key} role="presentation">
                      <Link href={options[i].href} role="option" id={optId(i)} aria-selected={active === i} tabIndex={-1} onClick={() => setOpen(false)} className={rowClass(i)}>
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-surface text-muted"><Layers className="h-5 w-5" aria-hidden /></span>
                        <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
                        <span className="shrink-0 text-xs text-muted">{c.count} {c.count === 1 ? "product" : "products"}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </li>
          )}

          {items.length > 0 && (
            <li role="presentation">
              {(brands.length > 0 || cats.length > 0) && <p aria-hidden className={heading}>Products</p>}
              <ul role="group" aria-label="Products">
                {items.map((s, n) => {
                  const i = brands.length + cats.length + n;
                  return (
                    <li key={s.id} role="presentation">
                      <Link
                        href={`/products/${s.slug}`}
                        role="option"
                        id={optId(i)}
                        aria-selected={active === i}
                        tabIndex={-1} /* combobox pattern: focus stays in the input and options are reached with the arrow keys */
                        onClick={() => setOpen(false)}
                        className={rowClass(i)}
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
                          <span className="block font-semibold tabular-nums text-brand-600">{formatLkr(effectivePrice(s))}</span>
                          {effectivePrice(s) < s.price && (
                            <span className="block text-xs text-muted">
                              <span className="sr-only">Regular price</span>
                              <s>{formatLkr(s.price)}</s>
                            </span>
                          )}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </li>
          )}

          <li role="presentation" className="border-t border-border">
            <Link
              href={options[total - 1].href}
              role="option"
              id={optId(total - 1)}
              aria-selected={active === total - 1}
              tabIndex={-1}
              onClick={() => setOpen(false)}
              className={`block px-4 py-2.5 text-sm font-semibold text-brand-600 ${active === total - 1 ? "bg-brand-50" : "hover:bg-surface"}`}
            >
              See all results for “{term}”
            </Link>
          </li>
        </ul>
      )}
    </div>
  );
}
