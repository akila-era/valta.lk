import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { AlertTriangle, FolderTree, Layers, Package, Search, Shapes, Tag } from "lucide-react";
import { Empty, ErrorNote, PageHeader, Pager, Stat, Table } from "@/components/admin/ui";
import { adminGate } from "@/lib/admin/gate";
import { parseSize } from "@/lib/admin/paging";
import { catalogue, isLow, isOut } from "@/lib/admin/stats";

export const metadata: Metadata = { title: "Categories" };
export const dynamic = "force-dynamic";

type SP = { q?: string; page?: string; size?: string };
interface Row { name: string; slug: string; count: number; inStock: number; low: number; out: number; image?: string; subs: Map<string, number> }

export default async function CategoriesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const denied = await adminGate("/admin/categories");
  if (denied) return denied;
  const sp = await searchParams;
  const q = sp.q?.trim().slice(0, 60) || undefined;
  const cat = await catalogue();
  if (!cat) return (<><PageHeader title="Categories" /><ErrorNote>The catalogue could not be loaded from the ERP.</ErrorNote></>);

  const map = new Map<string, Row>();
  for (const p of cat.products) {
    if (!p.category) continue;
    const c = map.get(p.category.slug) ?? { name: p.category.name, slug: p.category.slug, count: 0, inStock: 0, low: 0, out: 0, subs: new Map<string, number>() };
    c.count++;
    if (isOut(p)) c.out++;
    else if (isLow(p)) c.low++;
    else c.inStock++;
    c.image ??= p.images[0];
    if (p.subCategory) c.subs.set(p.subCategory.name, (c.subs.get(p.subCategory.name) ?? 0) + 1);
    map.set(p.category.slug, c);
  }
  const all = [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  const needle = q?.toLowerCase();
  const rows = needle ? all.filter((c) => [c.name, c.slug, ...c.subs.keys()].join(" ").toLowerCase().includes(needle)) : all;
  const uncategorised = cat.products.filter((p) => !p.category).length;
  const subTotal = all.reduce((n, c) => n + c.subs.size, 0);

  const size = parseSize(sp.size);
  const pageCount = Math.max(1, Math.ceil(rows.length / size));
  const page = Math.min(pageCount, Math.max(1, Number(sp.page) || 1));
  const href = (n: number) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (size !== 25) p.set("size", String(size));
    if (n > 1) p.set("page", String(n));
    return `/admin/categories${p.size ? `?${p}` : ""}`;
  };

  return (
    <>
      <PageHeader title="Categories" subtitle="Categories come from the ERP product records. To add or rename a category, change it on the products in the ERP." />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={FolderTree} tone="purple" label="Categories" value={all.length} />
        <Stat icon={Layers} tone="blue" label="Sub-categories" value={subTotal} />
        <Stat icon={Package} tone="green" label="Products in a category" value={cat.products.length - uncategorised} href="/admin/products" />
        <Stat icon={AlertTriangle} tone={uncategorised ? "orange" : "grey"} label="Without a category" value={uncategorised} sub={uncategorised ? "not shown on the storefront categories" : "all products are categorised"} />
      </div>

      <form action="/admin/categories" method="get" role="search" className="card mb-5 flex flex-wrap items-center gap-3 p-4">
        {size !== 25 && <input type="hidden" name="size" value={size} />}
        <div className="relative min-w-[14rem] flex-1">
          <label htmlFor="c-q" className="sr-only">Search categories</label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <input id="c-q" name="q" defaultValue={q} maxLength={60} placeholder="Search category or sub-category…" className="input min-h-10 bg-surface pl-9" />
        </div>
        <button className="btn-primary min-h-10" type="submit">Apply</button>
        {q && <Link href="/admin/categories" className="text-sm font-semibold text-brand-600 hover:underline">Reset</Link>}
      </form>

      <p className="mb-3 text-sm text-muted" role="status">{rows.length} {rows.length === 1 ? "category" : "categories"}{q ? " match" : ""}</p>

      {rows.length === 0 ? (
        <Empty>{q ? "No categories match this search." : "No categories yet. Products in the ERP have no category."}</Empty>
      ) : (
        <Table dense label="Categories" min="56rem" head={["Category", "Slug", "Sub-categories", { label: "Products", right: true }, "Stock", { label: "Actions", right: true }]}>
          {rows.slice((page - 1) * size, page * size).map((c) => (
            <tr key={c.slug}>
              <td className="px-3 py-3">
                <div className="flex items-center gap-3">
                  <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md bg-surface">
                    {c.image ? <Image src={c.image} alt="" fill sizes="40px" className="object-contain p-1" /> : <Shapes className="m-auto h-full w-5 text-muted" aria-hidden />}
                  </span>
                  <span className="font-medium">{c.name}</span>
                </div>
              </td>
              <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-muted">{c.slug}</td>
              <td className="px-3 py-3 text-muted">
                {c.subs.size ? (
                  <span className="flex flex-wrap gap-1">
                    {[...c.subs].map(([n, k]) => <span key={n} className="badge bg-surface text-ink"><Tag className="mr-1 h-3 w-3 text-muted" aria-hidden />{n} · {k}</span>)}
                  </span>
                ) : "-"}
              </td>
              <td className="px-3 py-3 text-right font-semibold"><Link className="hover:underline" href={`/admin/products?category=${c.slug}`}>{c.count}</Link></td>
              <td className="px-3 py-3">
                <span className="flex flex-wrap gap-1">
                  {c.inStock > 0 && <span className="badge bg-success-bg text-success">{c.inStock} in stock</span>}
                  {c.low > 0 && <span className="badge bg-warn-bg text-warn">{c.low} low</span>}
                  {c.out > 0 && <span className="badge bg-danger-bg text-danger">{c.out} out</span>}
                </span>
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-right text-sm">
                <Link href={`/admin/products?category=${c.slug}`} className="font-semibold text-brand-600 hover:underline">Products</Link>
                <span className="mx-2 text-border" aria-hidden>|</span>
                <Link href={`/categories/${c.slug}`} target="_blank" rel="noopener" className="text-muted hover:text-ink">View</Link>
              </td>
            </tr>
          ))}
        </Table>
      )}
      <Pager page={page} pageCount={pageCount} href={href} total={rows.length} pageSize={size} noun={rows.length === 1 ? "category" : "categories"} />
    </>
  );
}
