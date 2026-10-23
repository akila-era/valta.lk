import Link from "next/link";
import { redirect } from "next/navigation";
import { X } from "lucide-react";
import { listProducts, type ProductQuery, type SortKey } from "@/lib/erp/catalogue";
import { Pagination } from "@/components/ui/chrome";
import { EmptyState, ErpUnavailable } from "@/components/ui/states";
import { FilterPanel } from "./filter-panel";
import { ProductGrid } from "./product-card";

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
}

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
    pageSize: 12,
  };
}

function href(base: string, params: RawParams, patch: Partial<RawParams>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...params, ...patch })) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}

function ActiveFilters({ basePath, params, query, categories, filtered, fixedCategory }: {
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
          <Link href={chip.href} className="group/chip inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border bg-surface pl-3 pr-2 text-sm font-medium text-ink transition-colors hover:border-ink">
            {chip.label}
            <X className="h-3.5 w-3.5 text-muted group-hover/chip:text-ink" aria-hidden />
            <span className="sr-only">, remove filter</span>
          </Link>
        </li>
      ))}
      {chips.length > 1 && (
        <li>
          <Link href={fixedCategory ? basePath : "/products"} className="inline-flex min-h-9 items-center rounded-full px-2 text-sm font-semibold text-brand-600 hover:underline">
            Clear all
          </Link>
        </li>
      )}
    </ul>
  );
}

export async function CatalogueView({ basePath, params, fixedCategory, showCategories = true }: { basePath: string; params: RawParams; fixedCategory?: string; showCategories?: boolean }) {
  const query = parseParams(params, fixedCategory);
  let result;
  try {
    result = await listProducts(query);
  } catch {
    return <ErpUnavailable retryHref={href(basePath, params, {})} />;
  }
  // A page past the end is served as the last page; send the shopper to that URL so the address bar and pager agree.
  if (query.page !== result.page) redirect(href(basePath, params, { page: result.page > 1 ? String(result.page) : "" }));
  const filtered = Boolean(query.sub || query.q || query.brand || query.minPrice || query.maxPrice || query.inStockOnly || query.onSale || (!fixedCategory && query.category));
  const brandValue = result.brands.find((b) => b.name.toLowerCase() === (query.brand ?? "").toLowerCase())?.name ?? "";

  return (
    <div className="grid min-w-0 gap-8 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <FilterPanel active={filtered}>
        <form action={basePath} method="get" className="space-y-5">
          {query.q && <input type="hidden" name="q" value={query.q} />}
          {query.onSale && <input type="hidden" name="sale" value="1" />}
          {query.sub && <input type="hidden" name="sub" value={query.sub} />}
          {!fixedCategory && query.category && <input type="hidden" name="category" value={query.category} />}
          {result.brands.length > 0 && (
            <div>
              <label htmlFor="brand" className="label">Brand</label>
              <select id="brand" name="brand" defaultValue={brandValue} className="select">
                <option value="">All brands</option>
                {result.brands.map((b) => (
                  <option key={b.name} value={b.name}>{b.name} ({b.count})</option>
                ))}
              </select>
            </div>
          )}
          <input type="hidden" name="sort" value={query.sort} />
          <fieldset>
            <legend className="label">Price (LKR)</legend>
            <div className="flex gap-2">
              <input aria-label="Minimum price" name="min" inputMode="numeric" placeholder="Min" defaultValue={params.min} className="input" />
              <input aria-label="Maximum price" name="max" inputMode="numeric" placeholder="Max" defaultValue={params.max} className="input" />
            </div>
          </fieldset>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" name="stock" value="1" defaultChecked={query.inStockOnly} className="check" />
            Available items only
          </label>
          <button className="btn-primary w-full" type="submit">Apply filters</button>
          {filtered && <Link href={fixedCategory ? basePath : "/products"} className="btn-secondary w-full">Clear all</Link>}
        </form>

        {showCategories && result.categories.length > 0 && (
          <nav aria-label="Filter by category" className="mt-8">
            <h2 className="label">Categories</h2>
            <ul className="space-y-1 text-sm">
              {result.categories.map((c) => (
                <li key={c.slug}>
                  <Link
                    href={`/categories/${c.slug}`}
                    aria-current={fixedCategory === c.slug ? "page" : undefined}
                    className={`flex justify-between rounded-lg px-3 py-2 hover:bg-surface ${fixedCategory === c.slug ? "bg-brand-50 font-semibold text-brand-700" : ""}`}
                  >
                    <span>{c.name}</span>
                    <span className="text-muted">{c.count}</span>
                  </Link>
                  {fixedCategory === c.slug && c.subs.length > 0 && (
                    <ul className="ml-3 mt-1 space-y-1 border-l border-border pl-2">
                      {c.subs.map((sc) => (
                        <li key={sc.slug}>
                          <Link
                            href={`/categories/${c.slug}?sub=${sc.slug}`}
                            aria-current={query.sub === sc.slug ? "page" : undefined}
                            className={`flex justify-between rounded-lg px-3 py-1.5 hover:bg-surface ${query.sub === sc.slug ? "font-semibold text-brand-700" : "text-ink/80"}`}
                          >
                            <span>{sc.name}</span>
                            <span className="text-muted">{sc.count}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        )}
      </FilterPanel>

      <section aria-label="Products" className="min-w-0">
        <div className="mb-4 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="type-meta" role="status">
            {result.total} {result.total === 1 ? "product" : "products"}
            {query.q ? ` for “${query.q}”` : ""}
          </p>
          <nav aria-label="Sort" className="min-w-0 max-w-full overflow-x-auto">
            <ul className="flex w-max gap-0.5 rounded-xl bg-surface p-1">
              {SORTS.map((s) => {
                const on = query.sort === s.value;
                return (
                  <li key={s.value}>
                    <Link
                      href={href(basePath, params, { sort: s.value === "newest" ? "" : s.value, page: "" })}
                      aria-current={on ? "page" : undefined}
                      className={`inline-flex min-h-9 items-center rounded-lg px-3 text-sm font-semibold transition-colors ${on ? "bg-bg text-ink shadow-card ring-1 ring-border" : "text-muted hover:text-ink"}`}
                    >
                      {s.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
        <ActiveFilters basePath={basePath} params={params} query={query} categories={result.categories} filtered={filtered} fixedCategory={fixedCategory} />
        {result.items.length === 0 ? (
          <>
            <EmptyState title="No products found" action={{ href: fixedCategory ? basePath : "/products", label: filtered ? "Clear filters" : "Browse all products" }}>
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
                      <Link href={`/categories/${c.slug}`} className="btn-secondary">{c.name}</Link>
                    </li>
                  ))}
                </ul>
              </nav>
            )}
          </>
        ) : (
          <ProductGrid products={result.items} />
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
