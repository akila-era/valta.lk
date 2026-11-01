import Link from "next/link";
import { redirect } from "next/navigation";
import { LayoutGrid, List, X } from "lucide-react";
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
  /** "list" shows one product per row; anything else is the grid. */
  view?: string;
  /** Products per page: one of PER_PAGE (default 12). */
  per?: string;
}

/** Page sizes offered ("Show 12 / 24 / 36"): whole rows of the four-column grid. */
const PER_PAGE = [12, 24, 36] as const;

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

  const section = "border-b border-border pb-5 mb-5 last:mb-0 last:border-b-0";
  const sectionTitle = "mb-3 block text-[15px] font-bold uppercase tracking-[0.03em] text-ink";
  const field = "h-10 w-full rounded-control border border-border bg-bg px-3 text-sm text-ink placeholder:text-muted focus:border-brand-500";
  const check = "h-4 w-4 rounded border-border accent-brand-500 pointer-coarse:h-5 pointer-coarse:w-5";

  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-[250px_minmax(0,1fr)] lg:gap-8 xl:grid-cols-[270px_minmax(0,1fr)]">
      <FilterPanel active={filtered}>
        {/* Categories first, as a plain list: the way most shoppers narrow the catalogue. */}
        {showCategories && result.categories.length > 0 && (
          <nav aria-label="Filter by category" className={section}>
            <h2 className={sectionTitle}>Product categories</h2>
            <ul className="space-y-0.5 text-[15px]">
              {result.categories.map((c) => {
                const isCurrent = fixedCategory === c.slug;
                return (
                  <li key={c.slug}>
                    <Link
                      href={`/categories/${c.slug}`}
                      aria-current={isCurrent ? "page" : undefined}
                      className={`flex items-center justify-between gap-2 py-1.5 pointer-coarse:py-2.5 transition-colors ${
                        isCurrent ? "font-semibold text-brand-600" : "text-ink/80 hover:text-brand-600"
                      }`}
                    >
                      <span className="truncate">{c.name}</span>
                      <span className="shrink-0 text-xs text-muted">({c.count})</span>
                    </Link>

                    {isCurrent && c.subs.length > 0 && (
                      <ul className="mb-1 ml-3 space-y-0.5 border-l border-border pl-3 text-sm">
                        {c.subs.map((sc) => {
                          const isSub = query.sub === sc.slug;
                          return (
                            <li key={sc.slug}>
                              <Link
                                href={`/categories/${c.slug}?sub=${sc.slug}`}
                                aria-current={isSub ? "page" : undefined}
                                className={`flex items-center justify-between gap-2 py-1 pointer-coarse:py-2 transition-colors ${
                                  isSub ? "font-semibold text-brand-600" : "text-muted hover:text-brand-600"
                                }`}
                              >
                                <span className="truncate">{sc.name}</span>
                                <span className="shrink-0 text-xs">({sc.count})</span>
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

        <form action={basePath} method="get">
          {query.q && <input type="hidden" name="q" value={query.q} />}
          {/* Applying filters keeps the chosen order and layout. */}
          {params.view === "list" && <input type="hidden" name="view" value="list" />}
          {query.pageSize !== PER_PAGE[0] && <input type="hidden" name="per" value={query.pageSize} />}
          {query.sub && <input type="hidden" name="sub" value={query.sub} />}
          {!fixedCategory && query.category && <input type="hidden" name="category" value={query.category} />}
          <input type="hidden" name="sort" value={query.sort} />

          {result.brands.length > 0 && (
            <div className={section}>
              <label htmlFor="brand" className={sectionTitle}>Brand</label>
              <select id="brand" name="brand" defaultValue={brandValue} className={field}>
                <option value="">All brands</option>
                {result.brands.map((b) => (
                  <option key={b.name} value={b.name}>
                    {b.name} ({b.count})
                  </option>
                ))}
              </select>
            </div>
          )}

          <fieldset className={section}>
            <legend className={sectionTitle}>Price (LKR)</legend>
            <div className="flex items-center gap-2">
              <input aria-label="Minimum price" name="min" inputMode="numeric" placeholder="Min" defaultValue={params.min} className={field} />
              <span className="text-muted" aria-hidden>–</span>
              <input aria-label="Maximum price" name="max" inputMode="numeric" placeholder="Max" defaultValue={params.max} className={field} />
            </div>
          </fieldset>

          <fieldset className={section}>
            <legend className={sectionTitle}>Stock status</legend>
            <label className="flex cursor-pointer items-center gap-2.5 py-1 text-[15px] text-ink/80 pointer-coarse:min-h-10">
              <input type="checkbox" name="stock" value="1" defaultChecked={query.inStockOnly} className={check} />
              In stock
            </label>
            <label className="flex cursor-pointer items-center gap-2.5 py-1 text-[15px] text-ink/80 pointer-coarse:min-h-10">
              <input type="checkbox" name="sale" value="1" defaultChecked={query.onSale} className={check} />
              On sale
            </label>
          </fieldset>

          <button className="btn-primary min-h-11 w-full" type="submit">Apply filters</button>
          {filtered && (
            <Link href={fixedCategory ? basePath : "/products"} className="mt-2 block py-1 text-center text-sm font-semibold text-muted hover:text-ink">
              Clear all filters
            </Link>
          )}
        </form>
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
              <span className="mr-1 font-semibold text-ink">Show:</span>
              {PER_PAGE.map((n, i) => {
                const on = query.pageSize === n;
                return (
                  <span key={n} className="flex items-center gap-1">
                    {i > 0 ? <span aria-hidden>/</span> : null}
                    <Link
                      href={href(basePath, params, { per: n === PER_PAGE[0] ? "" : String(n), page: "" })}
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

            {/* Grid / list layout, kept in the URL (?view=list) so it survives sorting, filters and paging. */}
            <nav aria-label="Layout" className="hidden items-center gap-1 sm:flex">
              {([["grid", "Grid view", LayoutGrid], ["list", "List view", List]] as const).map(([v, label, Icon]) => {
                const on = (params.view === "list" ? "list" : "grid") === v;
                return (
                  <Link
                    key={v}
                    href={href(basePath, params, { view: v === "list" ? "list" : "" })}
                    aria-label={label}
                    aria-current={on ? "true" : undefined}
                    scroll={false}
                    className={`flex h-9 w-9 items-center justify-center rounded-control transition-colors ${on ? "text-ink" : "text-muted/60 hover:text-ink"}`}
                  >
                    <Icon className="h-5 w-5" aria-hidden />
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

        <ActiveFilters
          basePath={basePath}
          params={params}
          query={query}
          categories={result.categories}
          filtered={filtered}
          fixedCategory={fixedCategory}
        />

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
            <ProductGrid products={result.items} columns={4} layout={params.view === "list" ? "list" : "grid"} />
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
