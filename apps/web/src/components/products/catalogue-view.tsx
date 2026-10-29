import Link from "next/link";
import { redirect } from "next/navigation";
import { LayoutGrid, List, X } from "lucide-react";
import { listProducts, type ProductQuery, type SortKey } from "@/lib/erp/catalogue";
import { Pagination } from "@/components/ui/chrome";
import { EmptyState, ErpUnavailable } from "@/components/ui/states";
import { FilterPanel } from "./filter-panel";
import { ProductGrid } from "./product-grid";

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
  /** "list" shows one product per row; anything else is the grid. */
  view?: string;
  /** Products per page: one of PER_PAGE (default 15). */
  per?: string;
}

/** Page sizes offered ("Show 15 / 30 / 45"): whole rows of the five-column grid. */
const PER_PAGE = [15, 30, 45] as const;

const SORTS: { value: SortKey; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
  { value: "name", label: "Name" },
];

const num = (v?: string) => (v && /^\d{1,9}(\.\d{1,2})?$/.test(v) ? Number(v) : undefined);

export function parseParams(p: RawParams, fixedCategory?: string): ProductQuery {
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
    pageSize: PER_PAGE.find((n) => String(n) === p.per) ?? PER_PAGE[0],
  };
}

function href(base: string, params: RawParams, patch: Partial<RawParams>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...params, ...patch })) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}

function ActiveFilters({
  basePath,
  params,
  query,
  categories,
  filtered,
  fixedCategory,
}: {
  basePath: string;
  params: RawParams;
  query: ProductQuery;
  categories: { slug: string; name: string; subs: { slug: string; name: string }[] }[];
  filtered: boolean;
  fixedCategory?: string;
}) {
  if (!filtered) return null;
  const drop = (patch: Partial<RawParams>) => href(basePath, params, { ...patch, page: "" });
  const subName = categories.find((c) => c.slug === query.category)?.subs.find((s) => s.slug === query.sub)?.name;
  const chips: { label: string; href: string }[] = [];
  if (query.q) chips.push({ label: `“${query.q}”`, href: drop({ q: "" }) });
  if (!fixedCategory && query.category) {
    const name = categories.find((c) => c.slug === query.category)?.name ?? query.category;
    chips.push({ label: name, href: drop({ category: "", sub: "" }) });
  }
  if (query.sub) chips.push({ label: subName ?? query.sub, href: drop({ sub: "" }) });
  if (query.brand) chips.push({ label: query.brand, href: drop({ brand: "" }) });
  if (query.minPrice != null) chips.push({ label: `Min ${params.min}`, href: drop({ min: "" }) });
  if (query.maxPrice != null) chips.push({ label: `Max ${params.max}`, href: drop({ max: "" }) });
  if (query.inStockOnly) chips.push({ label: "Available only", href: drop({ stock: "" }) });
  if (query.onSale) chips.push({ label: "On sale", href: drop({ sale: "" }) });
  if (!chips.length) return null;

  return (
    <ul className="mb-4 flex flex-wrap items-center gap-2" aria-label="Selected filters">
      {chips.map((chip) => (
        <li key={chip.label}>
          <Link
            href={chip.href}
            className="group/chip inline-flex min-h-8 items-center gap-1.5 rounded-full border border-border bg-white px-3 text-xs font-semibold text-ink shadow-xs transition-colors hover:border-brand-500 hover:text-brand-600"
          >
            {chip.label}
            <X className="h-3 w-3 text-muted group-hover/chip:text-brand-600" aria-hidden />
            <span className="sr-only">, remove filter</span>
          </Link>
        </li>
      ))}
      {chips.length > 1 && (
        <li>
          <Link
            href={fixedCategory ? basePath : "/products"}
            className="inline-flex min-h-8 items-center rounded-full px-2 text-xs font-bold text-brand-600 hover:underline"
          >
            Clear all
          </Link>
        </li>
      )}
    </ul>
  );
}

export async function CatalogueView({
  basePath,
  params,
  fixedCategory,
  showCategories = true,
}: {
  basePath: string;
  params: RawParams;
  fixedCategory?: string;
  showCategories?: boolean;
}) {
  const query = parseParams(params, fixedCategory);
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
  const brandValue = result.brands.find((b) => b.name.toLowerCase() === (query.brand ?? "").toLowerCase())?.name ?? "";

  return (
    <div className="grid min-w-0 gap-5 lg:grid-cols-[236px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)]">
      {/* Sticky Filter Sidebar on Desktop, Drawer on Mobile */}
      <FilterPanel active={filtered}>
        <form action={basePath} method="get" className="space-y-3">
          {query.q && <input type="hidden" name="q" value={query.q} />}
          {/* Applying filters keeps the chosen order and layout. */}
          {query.sort !== "newest" && <input type="hidden" name="sort" value={query.sort} />}
          {params.view === "list" && <input type="hidden" name="view" value="list" />}
          {query.pageSize !== PER_PAGE[0] && <input type="hidden" name="per" value={query.pageSize} />}
          {query.sub && <input type="hidden" name="sub" value={query.sub} />}
          {!fixedCategory && query.category && <input type="hidden" name="category" value={query.category} />}

          {/* Brand select */}
          {result.brands.length > 0 && (
            <div>
              <label htmlFor="brand" className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-ink">
                Brand
              </label>
              <select
                id="brand"
                name="brand"
                defaultValue={brandValue}
                className="h-9 w-full rounded-xl border border-border/80 bg-bg px-2.5 text-xs font-medium text-ink transition-colors focus:border-brand-500 focus:bg-white"
              >
                <option value="">All brands</option>
                {result.brands.map((b) => (
                  <option key={b.name} value={b.name}>
                    {b.name} ({b.count})
                  </option>
                ))}
              </select>
            </div>
          )}

          <input type="hidden" name="sort" value={query.sort} />

          {/* Price range */}
          <fieldset>
            <legend className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-ink">
              Price (LKR)
            </legend>
            <div className="flex gap-2">
              <input
                aria-label="Minimum price"
                name="min"
                inputMode="numeric"
                placeholder="Min"
                defaultValue={params.min}
                className="h-9 w-full rounded-xl border border-border/80 bg-bg px-2.5 text-xs text-ink placeholder:text-muted transition-colors focus:border-brand-500 focus:bg-white"
              />
              <input
                aria-label="Maximum price"
                name="max"
                inputMode="numeric"
                placeholder="Max"
                defaultValue={params.max}
                className="h-9 w-full rounded-xl border border-border/80 bg-bg px-2.5 text-xs text-ink placeholder:text-muted transition-colors focus:border-brand-500 focus:bg-white"
              />
            </div>
          </fieldset>

          {/* Stock status */}
          <fieldset className="space-y-1">
          <legend className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-ink">Stock status</legend>
          <label className="flex cursor-pointer items-center gap-2 py-0.5 text-xs font-medium text-ink pointer-coarse:min-h-10">
            <input type="checkbox" name="sale" value="1" defaultChecked={query.onSale} className="h-3.5 w-3.5 rounded border-border accent-brand-500 pointer-coarse:h-5 pointer-coarse:w-5" />
            On sale only
          </label>
          <label className="flex cursor-pointer items-center gap-2 py-0.5 text-xs font-medium text-ink pointer-coarse:min-h-10">
            <input
              type="checkbox"
              name="stock"
              value="1"
              defaultChecked={query.inStockOnly}
              className="h-3.5 w-3.5 rounded border-border accent-brand-500 pointer-coarse:h-5 pointer-coarse:w-5"
            />
            Available items only
          </label>
          </fieldset>

          {/* Apply button */}
          <button
            className="btn-primary w-full rounded-full py-2 text-xs font-bold uppercase tracking-wider shadow-soft hover:shadow-lift transition-all"
            type="submit"
          >
            Apply filters
          </button>

          {filtered && (
            <Link
              href={fixedCategory ? basePath : "/products"}
              className="btn-secondary block w-full rounded-full py-1.5 text-center text-xs font-semibold"
            >
              Clear all
            </Link>
          )}
        </form>

        {/* Categories list in sidebar */}
        {showCategories && result.categories.length > 0 && (
          <nav aria-label="Filter by category" className="mt-4 border-t border-border/80 pt-3.5">
            <h2 className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-ink">Categories</h2>
            <ul className="space-y-0.5 text-xs">
              {result.categories.map((c) => {
                const isCurrent = fixedCategory === c.slug;
                return (
                  <li key={c.slug}>
                    <Link
                      href={`/categories/${c.slug}`}
                      aria-current={isCurrent ? "page" : undefined}
                      className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 pointer-coarse:py-2.5 text-xs transition-colors ${
                        isCurrent
                          ? "bg-brand-50 font-bold text-brand-700"
                          : "font-medium text-ink/80 hover:bg-surface hover:text-brand-600"
                      }`}
                    >
                      <span className="truncate pr-1">{c.name}</span>
                      <span className={`shrink-0 text-[11px] ${isCurrent ? "font-bold text-brand-600" : "text-muted"}`}>
                        {c.count}
                      </span>
                    </Link>

                    {isCurrent && c.subs.length > 0 && (
                      <ul className="my-0.5 ml-2.5 space-y-0.5 border-l-2 border-brand-500 pl-2">
                        {c.subs.map((sc) => {
                          const isSub = query.sub === sc.slug;
                          return (
                            <li key={sc.slug}>
                              <Link
                                href={`/categories/${c.slug}?sub=${sc.slug}`}
                                aria-current={isSub ? "page" : undefined}
                                className={`flex items-center justify-between rounded-md px-2 py-1 pointer-coarse:py-2 text-xs transition-colors ${
                                  isSub
                                    ? "bg-brand-50/80 font-bold text-brand-700"
                                    : "text-muted hover:bg-surface hover:text-brand-600"
                                }`}
                              >
                                <span className="truncate pr-1">{sc.name}</span>
                                <span className="shrink-0 text-[11px] text-muted">{sc.count}</span>
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </nav>
        )}
      </FilterPanel>

      {/* Main product area */}
      <section aria-label="Products" className="min-w-0">
        {/* Controls Bar: Count on left, Sort pills + View icons on right (matching screenshot) */}
        <div className="mb-4 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold text-muted" role="status">
            {result.total === 0
              ? "No products"
              : `Showing ${(result.page - 1) * query.pageSize! + 1}–${Math.min(result.page * query.pageSize!, result.total)} of ${result.total} ${result.total === 1 ? "result" : "results"}`}
            {query.q ? ` for “${query.q}”` : ""}
          </p>

          <div className="flex flex-wrap items-center gap-2">
            {/* Sort pills */}
            <nav aria-label="Sort" className="min-w-0 max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <ul className="flex w-max items-center gap-1 rounded-full border border-border/80 bg-surface/80 p-1">
                {SORTS.map((s) => {
                  const on = query.sort === s.value;
                  return (
                    <li key={s.value}>
                      <Link
                        href={href(basePath, params, { sort: s.value === "newest" ? "" : s.value, page: "" })}
                        aria-current={on ? "page" : undefined}
                        className={`inline-flex min-h-8 items-center whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                          on
                            ? "bg-brand-500 font-bold text-on-brand shadow-neon"
                            : "text-muted hover:text-brand-600"
                        }`}
                      >
                        {s.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>

            {/* Products per page */}
            <nav aria-label="Products per page" className="hidden items-center gap-1 text-xs font-semibold text-muted md:flex">
              <span className="mr-1">Show:</span>
              {PER_PAGE.map((n) => {
                const on = query.pageSize === n;
                return (
                  <Link
                    key={n}
                    href={href(basePath, params, { per: n === PER_PAGE[0] ? "" : String(n), page: "" })}
                    aria-current={on ? "true" : undefined}
                    aria-label={`Show ${n} per page`}
                    scroll={false}
                    className={`flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 pointer-coarse:h-10 pointer-coarse:min-w-10 tabular-nums transition-colors ${on ? "bg-ink text-white" : "hover:text-brand-600"}`}
                  >
                    {n}
                  </Link>
                );
              })}
            </nav>

            {/* Grid / list layout, kept in the URL (?view=list) so it survives sorting, filters and paging. */}
            <nav aria-label="Layout" className="hidden items-center gap-1 rounded-full border border-border/80 bg-surface/80 p-1 sm:flex">
              {([["grid", "Grid view", LayoutGrid], ["list", "List view", List]] as const).map(([v, label, Icon]) => {
                const on = (params.view === "list" ? "list" : "grid") === v;
                return (
                  <Link
                    key={v}
                    href={href(basePath, params, { view: v === "list" ? "list" : "" })}
                    aria-label={label}
                    aria-current={on ? "true" : undefined}
                    scroll={false}
                    className={`flex h-7 w-7 items-center justify-center rounded-full pointer-coarse:h-10 pointer-coarse:w-10 transition-colors ${on ? "bg-brand-500 text-on-brand shadow-neon" : "text-muted hover:text-brand-600"}`}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Active filter chips */}
        <ActiveFilters
          basePath={basePath}
          params={params}
          query={query}
          categories={result.categories}
          filtered={filtered}
          fixedCategory={fixedCategory}
        />

        {/* Products or Empty state */}
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
                      <Link href={`/categories/${c.slug}`} className="btn-secondary rounded-full px-4 text-xs font-semibold">
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
            <ProductGrid products={result.items} columns={5} layout={params.view === "list" ? "list" : "grid"} />
          </>
        )}

        {/* Pagination */}
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
