import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Download, Package, Plus, Search, XCircle } from "lucide-react";
import { ErrorNote, PageHeader, Pager, Stat } from "@/components/admin/ui";
import { ProductTable, type ContentState } from "@/components/admin/product-table";
import { isComplete } from "@/lib/content/schema";
import { listStates } from "@/lib/admin/product-content";
import { getDb } from "@/lib/db";
import { adminGate } from "@/lib/admin/gate";
import { parseSize } from "@/lib/admin/paging";
import { filterProducts } from "@/lib/admin/product-filter";
import { catalogue, isLow, isOut, LOW_STOCK_AT } from "@/lib/admin/stats";

export const metadata: Metadata = { title: "Products" };
export const dynamic = "force-dynamic";

type SP = { q?: string; category?: string; brand?: string; stock?: string; pub?: string; complete?: string; page?: string; size?: string };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const denied = await adminGate("/admin/products");
  if (denied) return denied;
  const sp = await searchParams;
  const q = sp.q?.trim().slice(0, 60) || undefined;
  const cat = await catalogue();
  if (!cat) return (<><PageHeader title="Products" /><ErrorNote>The product catalogue could not be loaded from the ERP. Try again in a minute.</ErrorNote></>);

  const all = cat.products;
  const out = all.filter(isOut).length;
  const low = all.filter(isLow).length;
  const db = getDb();
  const states = db ? await listStates(db).catch(() => null) : null;
  const content = new Map<string, ContentState>();
  for (const p of all) {
    const st = states?.get(p.id);
    content.set(p.id, st
      ? { publication: st.published ? "published" : "draft-only", unpublishedChanges: Boolean(st.published) && JSON.stringify(st.published) !== JSON.stringify(st.draft), complete: isComplete(st.draft), updatedAt: st.updatedAt }
      : { publication: "none", unpublishedChanges: false, complete: false, updatedAt: null });
  }
  const pub = ["published", "draft", "none"].includes(sp.pub ?? "") ? sp.pub : undefined;
  const complete = sp.complete === "yes" || sp.complete === "no" ? sp.complete : undefined;
  const list = filterProducts(all, { q, category: sp.category, brand: sp.brand, stock: sp.stock }).filter((p) => {
    const c = content.get(p.id)!;
    if (pub === "published" && c.publication !== "published") return false;
    if (pub === "draft" && !(c.publication === "draft-only" || c.unpublishedChanges)) return false;
    if (pub === "none" && c.publication !== "none") return false;
    if (complete === "yes" && !c.complete) return false;
    if (complete === "no" && c.complete) return false;
    return true;
  });
  const size = parseSize(sp.size, 10);
  const pageCount = Math.max(1, Math.ceil(list.length / size));
  const page = Math.min(pageCount, Math.max(1, Number(sp.page) || 1));
  const categories = [...new Map(all.filter((p) => p.category).map((p) => [p.category!.slug, p.category!.name])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const brands = [...new Set(all.map((p) => p.brand).filter((b): b is string => Boolean(b)))].sort((a, b) => a.localeCompare(b));

  const url = (o: { stock?: string; page?: number; size?: number }) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (sp.category) p.set("category", sp.category);
    if (sp.brand) p.set("brand", sp.brand);
    if (pub) p.set("pub", pub);
    if (complete) p.set("complete", complete);
    const stock = "stock" in o ? o.stock : sp.stock;
    if (stock) p.set("stock", stock);
    const sz = o.size ?? size;
    if (sz !== 10) p.set("size", String(sz));
    if (o.page && o.page > 1) p.set("page", String(o.page));
    return `/admin/products${p.size ? `?${p}` : ""}`;
  };
  const exportHref = `/api/admin/products/export?${new URLSearchParams({ ...(q ? { q } : {}), ...(sp.category ? { category: sp.category } : {}), ...(sp.brand ? { brand: sp.brand } : {}), ...(sp.stock ? { stock: sp.stock } : {}) })}`;
  const filtered = Boolean(q || sp.category || sp.brand || sp.stock || pub || complete);
  
  return (
    <>
      <PageHeader
        title="Products"
        subtitle="The product catalogue is held by the HEXALYTE ERP. Price, stock and name are edited there; images and descriptions are edited here."
        actions={
          <Link href="/admin/products/new" className="btn-primary"><Plus className="h-4 w-4" aria-hidden /> Add Product</Link>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={Package} tone="purple" label="Total products" value={all.length} href={url({ stock: "", page: 1 })} />
        <Stat icon={CheckCircle2} tone="green" label="In stock" value={all.length - low - out} href={url({ stock: "in", page: 1 })} />
        <Stat icon={AlertTriangle} tone="orange" label="Low stock" value={low} sub={`${LOW_STOCK_AT} or fewer left`} href={url({ stock: "low", page: 1 })} />
        <Stat icon={XCircle} tone="red" label="Out of stock" value={out} href={url({ stock: "out", page: 1 })} />
      </div>

      <form action="/admin/products" method="get" role="search" className="card mb-5 flex flex-wrap items-center gap-3 p-4">
        <input type="hidden" name="stock" value={sp.stock ?? ""} />
        {size !== 10 && <input type="hidden" name="size" value={size} />}
        <div className="relative min-w-[14rem] flex-1">
          <label htmlFor="p-q" className="sr-only">Search products by name, SKU or brand</label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <input id="p-q" name="q" defaultValue={q} maxLength={60} placeholder="Search name, SKU, brand or ERP ID…" className="input min-h-10 bg-surface pl-9" />
        </div>
        <label htmlFor="p-cat" className="sr-only">Category</label>
        <select id="p-cat" name="category" defaultValue={sp.category ?? ""} className="input min-h-10 w-auto">
          <option value="">All categories</option>
          {categories.map(([slug, name]) => <option key={slug} value={slug}>{name}</option>)}
        </select>
        <label htmlFor="p-brand" className="sr-only">Brand</label>
        <select id="p-brand" name="brand" defaultValue={sp.brand ?? ""} className="input min-h-10 w-auto">
          <option value="">All brands</option>
          {brands.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <label htmlFor="p-pub" className="sr-only">Publication status</label>
        <select id="p-pub" name="pub" defaultValue={pub ?? ""} className="input min-h-10 w-auto">
          <option value="">All publication</option>
          <option value="published">Published</option>
          <option value="draft">Has draft changes</option>
          <option value="none">No website content</option>
        </select>
        <label htmlFor="p-complete" className="sr-only">Content completion</label>
        <select id="p-complete" name="complete" defaultValue={complete ?? ""} className="input min-h-10 w-auto">
          <option value="">Any completion</option>
          <option value="yes">Complete</option>
          <option value="no">Incomplete / empty</option>
        </select>
        <nav aria-label="Stock filter" className="flex flex-wrap gap-1 text-sm">
          {[["", "All"], ["in", "In Stock"], ["low", "Low Stock"], ["out", "Out of Stock"]].map(([v, l]) => {
            const on = (sp.stock ?? "") === v;
            return <Link key={v} href={url({ stock: v, page: 1 })} aria-current={on ? "true" : undefined} className={`inline-flex min-h-10 items-center rounded-control border px-3.5 font-semibold transition-colors ${on ? "border-brand-500 bg-brand-500 text-white" : "border-border bg-bg hover:border-brand-500 hover:text-brand-700"}`}>{l}</Link>;
          })}
        </nav>
        <button className="btn-primary min-h-10" type="submit">Apply</button>
        {filtered && <Link href="/admin/products" className="text-sm font-semibold text-brand-600 hover:underline">Reset</Link>}
      </form>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted" role="status">{list.length} {list.length === 1 ? "product" : "products"}{filtered ? " match" : ""}</p>
        <a href={exportHref} className="btn-secondary min-h-10" download><Download className="h-4 w-4" aria-hidden /> Export CSV</a>
      </div>

      <ProductTable products={list.slice((page - 1) * size, page * size)} label="Products" content={content} />

      <Pager page={page} pageCount={pageCount} href={(n) => url({ page: n })} total={list.length} pageSize={size} defaultSize={10} noun={list.length === 1 ? "product" : "products"} />
    </>
  );
}
