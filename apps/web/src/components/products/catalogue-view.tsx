import Link from "next/link";
import { redirect } from "next/navigation";
import { Check, ChevronDown, List } from "lucide-react";
import { listProducts, type ProductQuery, type SortKey } from "@/lib/erp/catalogue";
import { Pagination } from "@/components/ui/chrome";
import { EmptyState, ErpUnavailable } from "@/components/ui/states";
import { FilterPanel } from "./filter-panel";
import { ProductGrid } from "./product-grid";
import { SortSelect } from "./sort-select";

export interface RawParams {
  q?: string;
  sort?: string;
  page?: string;
  min?: string;
  max?: string;
  stock?: string;
  category?: string;
  sale?: string;
  sub?: string;
  brand?: string;
  /** "list" shows one product per row, "2" / "3" that many per row; anything else is the four-column grid. */
  view?: string;
  /** Products per page: one of PER_PAGE (default 12). */
  per?: string;
}

/** Page sizes offered, as on ugreen.lk ("Show: 9 / 12 / 18 / 24 / 48"); 12 is the default. */
const PER_PAGE = [9, 12, 18, 24, 48] as const;
const DEFAULT_PER = 12;

/** The layouts offered next to "Show", as on ugreen.lk: a list, then grids of 2, 3 and 4 per row (4 is the default). */
const VIEWS = [
  { value: "list", label: "List view", cols: 0 },
  { value: "2", label: "2 columns", cols: 2 },
  { value: "3", label: "3 columns", cols: 3 },
  { value: "", label: "Grid view", cols: 4 },
] as const;

/** A small grid of squares for the layout buttons (cols x cols). */
function GridGlyph({ cols }: { cols: number }) {
  const gap = 1.5;
  const size = (16 - gap * (cols - 1)) / cols;
  return (
    <svg viewBox="0 0 16 16" className="h-[18px] w-[18px]" aria-hidden fill="currentColor">
      {Array.from({ length: cols * cols }, (_, i) => (
        <rect key={i} x={(i % cols) * (size + gap)} y={Math.floor(i / cols) * (size + gap)} width={size} height={size} rx={0.6} />
      ))}
    </svg>
  );
}

const SORTS: { value: SortKey; label: string }[] = [
  { value: "newest", label: "Default sorting" },
  { value: "price-asc", label: "Sort by price: low to high" },
  { value: "price-desc", label: "Sort by price: high to low" },
  { value: "name", label: "Sort by name" },
];

const num = (v?: string) => (v && /^\d{1,9}(\.\d{1,2})?$/.test(v) ? Number(v) : undefined);

export function parseParams(p: RawParams, fixedCategory?: string, fresh = false): ProductQuery {
  const sort = SORTS.some((s) => s.value === p.sort) ? (p.sort as SortKey) : "newest";
  const page = /^\d{1,4}$/.test(p.page ?? "") ? Number(p.page) : 1;
  return {
    q: p.q?.trim().slice(0, 100) || undefined,
    category: fixedCategory ?? (p.category?.slice(0, 100) || undefined),
    sub: p.sub?.slice(0, 100) || undefined,
    brand: p.brand?.trim().slice(0, 80) || undefined,
    sort,
    page,
    minPrice: num(p.min),
    maxPrice: num(p.max),
    inStockOnly: p.stock === "1",
    onSale: p.sale === "1",
    fresh: fresh || undefined,
    pageSize: PER_PAGE.find((n) => String(n) === p.per) ?? DEFAULT_PER,
  };
}

function href(base: string, params: RawParams, patch: Partial<RawParams>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...params, ...patch })) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}

export async function CatalogueView({
  basePath,
  params,
  fixedCategory,
  showCategories = true,
  fresh = false,
}: {
  basePath: string;
  params: RawParams;
  fixedCategory?: string;
  showCategories?: boolean;
  /** Only recently published products (the New Arrivals page). */
  fresh?: boolean;
}) {
  const query = parseParams(params, fixedCategory, fresh);
  let result;
  try {
    result = await listProducts(query);
  } catch {
    return <ErpUnavailable retryHref={href(basePath, params, {})} />;
  }

  // A page past the end is served as the last page; send the shopper to that URL so the address bar and pager agree.
  if (query.page !== result.page) {
    redirect(href(basePath, params, { page: result.page > 1 ? String(result.page) : "" }));
  }

  const filtered = Boolean(
    query.sub ||
      query.q ||
      query.brand ||
      query.minPrice ||
      query.maxPrice ||
      query.inStockOnly ||
      query.onSale ||
      (!fixedCategory && query.category),
  );

  // The filter column as on ugreen.lk: Stock status (a heading that opens and closes) and the category list. Every
  // choice is a link that applies at once: no Apply button, no brand or price boxes, no filter chips.
  const summary = "flex min-h-9 cursor-pointer list-none items-center justify-between gap-3 text-[15px] font-semibold uppercase tracking-[0.02em] text-ink [&::-webkit-details-marker]:hidden";
  const view = VIEWS.find((v) => v.value === (params.view ?? ""))?.value ?? "";
  const stockLinks = [
    { key: "stock" as const, label: "In stock", on: Boolean(query.inStockOnly) },
    { key: "sale" as const, label: "On sale", on: Boolean(query.onSale) },
  ];

  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-[250px_minmax(0,1fr)] lg:gap-10 xl:grid-cols-[270px_minmax(0,1fr)]">
      <FilterPanel active={filtered}>
        <details className="group/f mb-3" open={query.inStockOnly || query.onSale || undefined}>
          <summary className={summary}>
            Stock status <ChevronDown className="h-4 w-4 shrink-0 text-muted transition-transform group-open/f:rotate-180" aria-hidden />
          </summary>
          <ul aria-label="Stock status" className="mb-2 mt-1">
            {stockLinks.map((l) => (
              <li key={l.key}>
                <Link
                  href={href(basePath, params, { [l.key]: l.on ? "" : "1", page: "" })}
                  aria-current={l.on ? "true" : undefined}
                  scroll={false}
                  className={`flex items-center gap-2.5 py-1.5 text-sm transition-colors pointer-coarse:py-2.5 ${l.on ? "font-semibold text-brand-600" : "text-ink/80 hover:text-brand-600"}`}
                >
                  <span aria-hidden className={`flex h-4 w-4 items-center justify-center rounded-[3px] border ${l.on ? "border-brand-500 bg-brand-500 text-on-brand" : "border-border-strong/60"}`}>
                    {l.on ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                  </span>
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </details>

        {showCategories && result.categories.length > 0 && (
          <nav aria-label="Filter by category">
            <h2 className={`${summary} mb-2 cursor-default`}>Product categories</h2>
            <ul className="text-sm">
              {result.categories.map((c) => {
                const isCurrent = fixedCategory === c.slug;
                return (
                  <li key={c.slug} className="relative">
                    <Link
                      href={`/categories/${c.slug}`}
                      aria-current={isCurrent ? "page" : undefined}
                      className={`flex items-center py-2 pr-9 transition-colors pointer-coarse:py-2.5 ${isCurrent ? "font-semibold text-ink" : "text-ink/80 hover:text-brand-600"}`}
                    >
                      <span className="truncate">{c.name}</span>
                    </Link>
                    {c.subs.length > 0 && (
                      // The sub-categories open under a round chevron at the right; open already for the current category.
                      <details className="group/sub" open={isCurrent || undefined}>
                        <summary
                          aria-label={`${c.name} sub-categories`}
                          className="absolute right-0 top-1.5 flex h-6 w-6 cursor-pointer list-none items-center justify-center rounded-full bg-surface text-muted transition-colors hover:bg-ink hover:text-white pointer-coarse:top-2 [&::-webkit-details-marker]:hidden"
                        >
                          <ChevronDown className="h-3.5 w-3.5 transition-transform group-open/sub:rotate-180" aria-hidden />
                        </summary>
                        <ul className="mb-1 ml-2.5">
                          {c.subs.map((sc) => {
                            const isSub = isCurrent && query.sub === sc.slug;
                            return (
                              <li key={sc.slug}>
                                <Link
                                  href={`/categories/${c.slug}?sub=${sc.slug}`}
                                  aria-current={isSub ? "page" : undefined}
                                  className={`block py-2 transition-colors pointer-coarse:py-2.5 ${isSub ? "font-semibold text-brand-600" : "text-ink/75 hover:text-brand-600"}`}
                                >
                                  {sc.name}
                                </Link>
                              </li>
                            );
                          })}
                        </ul>
                      </details>
                    )}
                  </li>
                );
              })}
            </ul>
          </nav>
        )}
      </FilterPanel>

      <section aria-label="Products" className="min-w-0">
        {/* Toolbar: the count on the left; per page, layout and sort on the right. */}
        <div className="mb-5 flex min-w-0 flex-col gap-3 border-b border-border pb-4 md:flex-row md:items-center md:justify-between">
          <p className="text-sm text-muted" role="status">
            {result.total === 0
              ? "No products"
              : `Showing ${(result.page - 1) * query.pageSize! + 1}–${Math.min(result.page * query.pageSize!, result.total)} of ${result.total} ${result.total === 1 ? "result" : "results"}`}
            {query.q ? ` for “${query.q}”` : ""}
          </p>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <nav aria-label="Products per page" className="hidden items-center gap-1 text-sm text-muted md:flex">
              <span className="mr-1 font-bold text-ink">Show :</span>
              {PER_PAGE.map((n, i) => {
                const on = query.pageSize === n;
                return (
                  <span key={n} className="flex items-center gap-1">
                    {i > 0 ? <span aria-hidden>/</span> : null}
                    <Link
                      href={href(basePath, params, { per: n === DEFAULT_PER ? "" : String(n), page: "" })}
                      aria-current={on ? "true" : undefined}
                      aria-label={`Show ${n} per page`}
                      scroll={false}
                      className={`px-1 tabular-nums pointer-coarse:py-2 ${on ? "font-bold text-ink" : "hover:text-ink"}`}
                    >
                      {n}
                    </Link>
                  </span>
                );
              })}
            </nav>

            {/* List, 2, 3 or 4 per row (as on ugreen.lk), kept in the URL (?view=) so it survives sorting, filters and paging. */}
            <nav aria-label="Layout" className="hidden items-center gap-0.5 sm:flex">
              {VIEWS.map((v) => {
                const on = view === v.value;
                return (
                  <Link
                    key={v.label}
                    href={href(basePath, params, { view: v.value })}
                    aria-label={v.label}
                    aria-current={on ? "true" : undefined}
                    scroll={false}
                    className={`flex h-9 w-9 items-center justify-center rounded-control transition-colors ${on ? "text-ink" : "text-muted/50 hover:text-ink"} ${v.cols === 3 ? "max-md:hidden" : v.cols === 4 ? "max-lg:hidden" : ""}`}
                  >
                    {v.cols ? <GridGlyph cols={v.cols} /> : <List className="h-5 w-5" aria-hidden />}
                  </Link>
                );
              })}
            </nav>

            <SortSelect
              current={query.sort ?? "newest"}
              options={SORTS.map((s) => ({ value: s.value, label: s.label, href: href(basePath, params, { sort: s.value === "newest" ? "" : s.value, page: "" }) }))}
            />
          </div>
        </div>
        {result.items.length === 0 ? (
          <>
            <EmptyState
              title="No products found"
              action={{ href: fixedCategory ? basePath : "/products", label: filtered ? "Clear filters" : "Browse all products" }}
            >
              {query.minPrice != null && query.maxPrice != null && query.minPrice > query.maxPrice
                ? "The minimum price is higher than the maximum price. Swap them and try again."
                : filtered
                  ? "Try a different search or adjust your filters."
                  : "Products will appear here once they are available."}
            </EmptyState>

            {query.q && result.categories.length > 0 && (
              <nav aria-label="Browse categories" className="mt-6">
                <h2 className="text-sm font-semibold text-ink">Browse a category</h2>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {result.categories.map((c) => (
                    <li key={c.slug}>
                      <Link href={`/categories/${c.slug}`} className="btn-secondary px-4 text-sm">
                        {c.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            )}
          </>
        ) : (
          <>
            {/* Names the results so the card titles (h3) never follow the page h1 directly. */}
            <h2 className="sr-only">Products</h2>
            <ProductGrid products={result.items} columns={view === "2" ? 2 : view === "3" ? 3 : 4} layout={view === "list" ? "list" : "grid"} />
          </>
        )}

        <Pagination
          page={result.page}
          pageCount={result.pageCount}
          prevHref={result.page > 1 ? href(basePath, params, { page: String(result.page - 1) }) : null}
          nextHref={result.page < result.pageCount ? href(basePath, params, { page: String(result.page + 1) }) : null}
          pageHref={(p) => href(basePath, params, { page: p > 1 ? String(p) : "" })}
        />
      </section>
    </div>
  );
}
