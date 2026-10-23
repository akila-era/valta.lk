import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Award, Package, Search, Tag, Trophy } from "lucide-react";
import { Empty, ErrorNote, PageHeader, Pager, Stat, Table } from "@/components/admin/ui";
import { BrandLogoControl } from "@/components/admin/brand-logo-control";
import { adminGate } from "@/lib/admin/gate";
import { parseSize } from "@/lib/admin/paging";
import { catalogue, isLow, isOut } from "@/lib/admin/stats";
import { brandKey, brandLogoMap } from "@/lib/brand-logos";
import { effectivePrice } from "@/lib/erp/product-utils";
import { formatLkr } from "@/lib/utils/money";

export const metadata: Metadata = { title: "Brands" };
export const dynamic = "force-dynamic";

type SP = { q?: string; page?: string; size?: string };
interface Row { name: string; count: number; inStock: number; low: number; out: number; image?: string; categories: Set<string>; min: number; max: number }

export default async function BrandsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const denied = await adminGate("/admin/brands");
  if (denied) return denied;
  const sp = await searchParams;
  const q = sp.q?.trim().slice(0, 60) || undefined;
  const cat = await catalogue();
  if (!cat) return (<><PageHeader title="Brands" /><ErrorNote>The catalogue could not be loaded from the ERP.</ErrorNote></>);

  const logos = await brandLogoMap();
  const map = new Map<string, Row>();
  for (const p of cat.products) {
    const name = p.brand?.trim();
    if (!name) continue;
    const price = effectivePrice(p);
    const b = map.get(name) ?? { name, count: 0, inStock: 0, low: 0, out: 0, categories: new Set<string>(), min: price, max: price };
    b.count++;
    if (isOut(p)) b.out++;
    else if (isLow(p)) b.low++;
    else b.inStock++;
    b.image ??= p.images[0];
    if (p.category) b.categories.add(p.category.name);
    b.min = Math.min(b.min, price);
    b.max = Math.max(b.max, price);
    map.set(name, b);
  }
  const all = [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const needle = q?.toLowerCase();
  const rows = needle ? all.filter((b) => [b.name, ...b.categories].join(" ").toLowerCase().includes(needle)) : all;
  const noBrand = cat.products.filter((p) => !p.brand?.trim()).length;
  const top = all[0];

  const size = parseSize(sp.size);
  const pageCount = Math.max(1, Math.ceil(rows.length / size));
  const page = Math.min(pageCount, Math.max(1, Number(sp.page) || 1));
  const href = (n: number) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (size !== 25) p.set("size", String(size));
    if (n > 1) p.set("page", String(n));
    return `/admin/brands${p.size ? `?${p}` : ""}`;
  };

  return (
    <>
      <PageHeader title="Brands" subtitle="Brands are read from the ERP product records. To add or rename a brand, change it on the products in the ERP." />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={Award} tone="purple" label="Brands" value={all.length} />
        <Stat icon={Package} tone="green" label="Products with a brand" value={cat.products.length - noBrand} href="/admin/products" />
        <Stat icon={Trophy} tone="orange" label="Biggest brand" value={top ? top.name : "-"} sub={top ? `${top.count} products` : undefined} />
        <Stat icon={Tag} tone={noBrand ? "orange" : "grey"} label="Without a brand" value={noBrand} sub={noBrand ? "not shown under any brand" : "every product has a brand"} />
      </div>

      <form action="/admin/brands" method="get" role="search" className="card mb-5 flex flex-wrap items-center gap-3 p-4">
        {size !== 25 && <input type="hidden" name="size" value={size} />}
        <div className="relative min-w-[14rem] flex-1">
          <label htmlFor="b-q" className="sr-only">Search brands</label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <input id="b-q" name="q" defaultValue={q} maxLength={60} placeholder="Search brand or category…" className="input min-h-10 bg-surface pl-9" />
        </div>
        <button className="btn-primary min-h-10" type="submit">Apply</button>
        {q && <Link href="/admin/brands" className="text-sm font-semibold text-brand-600 hover:underline">Reset</Link>}
      </form>

      <p className="mb-3 text-sm text-muted" role="status">{rows.length} {rows.length === 1 ? "brand" : "brands"}{q ? " match" : ""}</p>

      {rows.length === 0 ? (
        <Empty>{q ? "No brands match this search." : "No brands are set on products in the ERP."}</Empty>
      ) : (
        <Table dense label="Brands" min="64rem" head={["Brand", "Logo (storefront)", "Categories", { label: "Products", right: true }, "Price range", "Stock", { label: "Actions", right: true }]}>
          {rows.slice((page - 1) * size, page * size).map((b) => (
            <tr key={b.name}>
              <td className="px-3 py-3">
                <div className="flex items-center gap-3">
                  <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md bg-surface">
                    {b.image ? <Image src={b.image} alt="" fill sizes="40px" className="object-contain p-1" /> : <Award className="m-auto h-full w-5 text-muted" aria-hidden />}
                  </span>
                  <span className="font-medium">{b.name}</span>
                </div>
              </td>
              <td className="px-3 py-3"><BrandLogoControl brand={b.name} logo={logos.get(brandKey(b.name))} /></td>
              <td className="px-3 py-3">
                <span className="flex flex-wrap gap-1">{[...b.categories].sort().map((c) => <span key={c} className="badge bg-surface text-ink">{c}</span>)}</span>
              </td>
              <td className="px-3 py-3 text-right font-semibold"><Link className="hover:underline" href={`/admin/products?brand=${encodeURIComponent(b.name)}`}>{b.count}</Link></td>
              <td className="whitespace-nowrap px-3 py-3 text-muted">{b.min === b.max ? formatLkr(b.min) : `${formatLkr(b.min)} – ${formatLkr(b.max)}`}</td>
              <td className="px-3 py-3">
                <span className="flex flex-wrap gap-1">
                  {b.inStock > 0 && <span className="badge bg-success-bg text-success">{b.inStock} in stock</span>}
                  {b.low > 0 && <span className="badge bg-warn-bg text-warn">{b.low} low</span>}
                  {b.out > 0 && <span className="badge bg-danger-bg text-danger">{b.out} out</span>}
                </span>
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-right text-sm">
                <Link href={`/admin/products?brand=${encodeURIComponent(b.name)}`} className="font-semibold text-brand-600 hover:underline">Products</Link>
              </td>
            </tr>
          ))}
        </Table>
      )}
      <Pager page={page} pageCount={pageCount} href={href} total={rows.length} pageSize={size} noun={rows.length === 1 ? "brand" : "brands"} />
    </>
  );
}
