import type { Metadata } from "next";
import Link from "next/link";
import { ProductImage } from "@/components/products/product-card";
import { CompareFromStorage, CompareRemove } from "@/components/products/compare-controls";
import { EmptyState } from "@/components/ui/states";
import { getProductBySlug } from "@/lib/erp/catalogue";
import { effectivePrice } from "@/lib/erp/product-utils";
import type { ErpProduct } from "@/lib/erp/types";
import { formatLkr } from "@/lib/utils/money";

export const metadata: Metadata = { title: "Compare products", robots: { index: false } };

/** Specifications of a product as label -> value: the staff-entered ones first, then the ERP's. */
function specMap(p: ErpProduct): Map<string, string> {
  const m = new Map<string, string>();
  for (const s of p.content?.specs ?? []) m.set(s.name, `${s.value}${s.unit ? ` ${s.unit}` : ""}`);
  for (const [k, v] of Object.entries(p.specs ?? {})) if (!m.has(k)) m.set(k, String(v));
  // Brand and category have their own rows above.
  for (const k of [...m.keys()]) if (/^(brand|category)$/i.test(k)) m.delete(k);
  return m;
}

/**
 * Compare up to four products side by side (as on ugreen.lk): photo, name, price, availability, then every
 * specification any of them has. The list comes from the address (?p=slug,slug), so a comparison can be shared.
 */
export default async function ComparePage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const { p } = await searchParams;
  const slugs = (p ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 4);
  const products = (await Promise.all(slugs.map((s) => getProductBySlug(s).catch(() => null)))).filter((x): x is ErpProduct => Boolean(x));

  const header = (
    <nav aria-label="Breadcrumbs" className="mb-4">
      <ol className="flex flex-wrap items-center gap-2 text-sm text-muted">
        <li><Link href="/" className="inline-flex min-h-6 items-center hover:text-ink">Home</Link></li>
        <li aria-hidden className="text-muted/70">/</li>
        <li><span className="font-semibold text-ink" aria-current="page">Compare</span></li>
      </ol>
    </nav>
  );

  if (!products.length) {
    return (
      <>
        {header}
        <CompareFromStorage />
        <h1 className="mb-6 text-[clamp(1.6rem,1.3rem+1vw,2.2rem)] font-semibold text-ink">Compare products</h1>
        <EmptyState title="Nothing to compare yet" action={{ href: "/products", label: "Browse products" }}>
          Press Compare on a product page to add it here. You can compare up to four products.
        </EmptyState>
      </>
    );
  }

  const specs = products.map(specMap);
  const keys = [...new Set(specs.flatMap((m) => [...m.keys()]))];
  const cell = "border-b border-border px-4 py-3 align-top text-sm";
  const head = `${cell} sticky left-0 z-10 w-40 bg-surface text-left font-semibold text-ink`;

  return (
    <>
      {header}
      <h1 className="mb-6 text-[clamp(1.6rem,1.3rem+1vw,2.2rem)] font-semibold text-ink">Compare products</h1>
      <div className="overflow-x-auto rounded-card border border-border">
        <table className="w-full min-w-[40rem] border-collapse">
          <caption className="sr-only">Comparison of {products.map((x) => x.content?.displayTitle || x.name).join(", ")}</caption>
          <thead>
            <tr>
              <th scope="row" className={head}><span className="sr-only">Product</span></th>
              {products.map((x) => {
                const title = x.content?.displayTitle || x.name;
                return (
                  <th key={x.id} scope="col" className={`${cell} min-w-48 text-left font-normal`}>
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/products/${x.slug}`} className="relative block aspect-square w-28 overflow-hidden rounded-control bg-bg" aria-label={`View ${title}`}>
                        <ProductImage src={x.images[0]} alt="" sizes="112px" contain padding="p-2" />
                      </Link>
                      <CompareRemove productId={x.id} name={title} slugs={products.filter((o) => o.id !== x.id).map((o) => o.slug)} />
                    </div>
                    <Link href={`/products/${x.slug}`} className="mt-3 block font-semibold leading-snug text-ink hover:underline">{title}</Link>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row" className={head}>Price</th>
              {products.map((x) => <td key={x.id} className={`${cell} text-lg font-bold tabular-nums text-brand-500`}>{x.hasVariants ? "From " : ""}{formatLkr(effectivePrice(x))}</td>)}
            </tr>
            <tr>
              <th scope="row" className={head}>Availability</th>
              {products.map((x) => <td key={x.id} className={cell}>{x.available ? "In stock" : "Out of stock"}</td>)}
            </tr>
            <tr>
              <th scope="row" className={head}>Brand</th>
              {products.map((x) => <td key={x.id} className={cell}>{x.brand ?? "-"}</td>)}
            </tr>
            <tr>
              <th scope="row" className={head}>Category</th>
              {products.map((x) => <td key={x.id} className={cell}>{x.category?.name ?? "-"}</td>)}
            </tr>
            {keys.map((k) => (
              <tr key={k}>
                <th scope="row" className={head}>{k}</th>
                {specs.map((m, i) => <td key={products[i].id} className={cell}>{m.get(k) ?? "-"}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
