import Link from "next/link";
import { Search } from "lucide-react";
import { parseSize } from "@/lib/admin/paging";
import { filterProducts } from "@/lib/admin/product-filter";
import { isLow, isOut } from "@/lib/admin/stats";
import type { ErpProduct } from "@/lib/erp/types";
import { ProductTable } from "./product-table";
import { Pager } from "./ui";

export interface StockListParams {
  q?: string;
  stock?: string;
  page?: string;
  size?: string;
}

/**
 * Search + (optional) Low/Out pills + product table + footer, shared by the stock pages.
 * `products` is the already-narrowed set for the page (for example only out-of-stock items).
 */
export function StockList({ products, basePath, sp, pills, noun = "products", emptyText }: {
  products: ErpProduct[]; basePath: string; sp: StockListParams; pills?: boolean; noun?: string; emptyText?: string;
}) {
  const q = sp.q?.trim().slice(0, 60) || undefined;
  const stock = pills && (sp.stock === "low" || sp.stock === "out") ? sp.stock : "";
  const list = filterProducts(products, { q, stock }).sort((a, b) => a.purchasableQuantity - b.purchasableQuantity || a.name.localeCompare(b.name));
  const size = parseSize(sp.size);
  const pageCount = Math.max(1, Math.ceil(list.length / size));
  const page = Math.min(pageCount, Math.max(1, Number(sp.page) || 1));
  const url = (o: { stock?: string; page?: number }) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    const s = "stock" in o ? o.stock : stock;
    if (s) p.set("stock", s);
    if (size !== 25) p.set("size", String(size));
    if (o.page && o.page > 1) p.set("page", String(o.page));
    return `${basePath}${p.size ? `?${p}` : ""}`;
  };
  const low = products.filter((p) => isLow(p)).length;
  const out = products.filter((p) => isOut(p)).length;
  const filtered = Boolean(q || stock);

  return (
    <>
      <form action={basePath} method="get" role="search" className="card mb-5 flex flex-wrap items-center gap-3 p-4">
        {stock && <input type="hidden" name="stock" value={stock} />}
        {size !== 25 && <input type="hidden" name="size" value={size} />}
        <div className="relative min-w-[14rem] flex-1">
          <label htmlFor="s-q" className="sr-only">Search products by name, SKU or brand</label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <input id="s-q" name="q" defaultValue={q} maxLength={60} placeholder="Search product name, SKU, brand…" className="input min-h-10 bg-surface pl-9" />
        </div>
        {pills && (
          <nav aria-label="Stock filter" className="flex flex-wrap gap-1 text-sm">
            {[["", `All (${low + out})`], ["low", `Low Stock (${low})`], ["out", `Out of Stock (${out})`]].map(([v, l]) => {
              const on = stock === v;
              return <Link key={v} href={url({ stock: v, page: 1 })} aria-current={on ? "true" : undefined} className={`inline-flex min-h-10 items-center rounded-lg border px-3 font-medium ${on ? "border-ink bg-ink text-white" : "border-border bg-bg hover:border-ink"}`}>{l}</Link>;
            })}
          </nav>
        )}
        <button className="btn-primary min-h-10" type="submit">Apply</button>
        {filtered && <Link href={basePath} className="text-sm font-semibold text-brand-600 hover:underline">Reset</Link>}
      </form>
      <p className="mb-3 text-sm text-muted" role="status">{list.length} {list.length === 1 ? noun.replace(/s$/, "") : noun}{filtered ? " match" : ""}</p>
      {list.length === 0 && !filtered && emptyText ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted">{emptyText}</p>
      ) : (
        <ProductTable products={list.slice((page - 1) * size, page * size)} label={noun} />
      )}
      <Pager page={page} pageCount={pageCount} href={(n) => url({ page: n })} total={list.length} pageSize={size} noun={list.length === 1 ? noun.replace(/s$/, "") : noun} />
    </>
  );
}
