import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ProductCard, ProductImage } from "@/components/products/product-card";
import { discountPercent, effectivePrice } from "@/lib/erp/product-utils";
import type { ErpProduct } from "@/lib/erp/types";
import { formatLkr } from "@/lib/utils/money";
import { SectionIntro } from "./home-sections";
import { ProductCarousel } from "./product-carousel";

/** New arrivals: the newest products in the catalogue, in a swipeable carousel. The section anchors the "New Arrivals" navigation links. */
export function NewArrivals({ products }: { products: ErpProduct[] }) {
  if (products.length < 3) return null;
  return (
    <section id="products" aria-labelledby="new-arrivals" className="mt-16 scroll-mt-40 sm:mt-24">
      <SectionIntro id="new-arrivals" eyebrow="Just added" title="New arrivals" action={{ href: "/products?sort=newest", label: "View all" }}>
        The latest products added to our catalogue.
      </SectionIntro>
      <ProductCarousel label="New arrivals" align="start">
        {products.map((p, i) => (
          <li key={p.id} className="w-1/2 shrink-0 snap-start px-1.5 sm:px-2 md:w-1/3 lg:w-1/4 xl:w-1/5">
            <ProductCard product={p} priority={i < 2} />
          </li>
        ))}
      </ProductCarousel>
    </section>
  );
}

/**
 * Special offers: only products whose ERP sale price is genuinely lower. The strongest real saving is quoted in the panel.
 * Hidden when there are no offers. The ERP carries no end date for a sale, so none is shown.
 */
export function SpecialOffers({ offers }: { offers: ErpProduct[] }) {
  if (offers.length < 1) return null;
  const best = Math.max(...offers.map((p) => discountPercent(p) ?? 0));
  const copy = (
    <div className="flex max-w-md flex-col justify-between gap-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-500">Special offers</p>
        <h2 id="offers" className="mt-3 text-3xl font-bold leading-[1.05] tracking-[-0.035em] sm:text-4xl">Reduced prices</h2>
        <p className="mt-3 text-sm leading-6 text-white/75">
          {offers.length} {offers.length === 1 ? "product" : "products"} with a current price reduction{best > 0 ? `, up to -${best}%` : ""}.
        </p>
      </div>
      <Link href="/products?sale=1" className="btn-primary btn-lg w-fit rounded-full">
        Shop offers <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </div>
  );

  // One or two offers: a single compact band, so a lone product never sits in a wide empty row.
  if (offers.length <= 2) {
    return (
      <section aria-labelledby="offers" className="mt-10 sm:mt-14">
        <div className="flex flex-col gap-8 rounded-[1.75rem] bg-ink p-6 text-white sm:p-8 lg:flex-row lg:items-center lg:justify-between lg:gap-12 lg:p-10">
          {copy}
          <ul className={`grid gap-3 sm:gap-4 ${offers.length === 1 ? "w-full max-w-[16rem] grid-cols-1" : "w-full grid-cols-2 lg:w-[34rem]"}`}>
            {offers.map((p) => (
              <li key={p.id}>
                <div className="rounded-2xl bg-white p-2 text-ink"><ProductCard product={p} /></div>
              </li>
            ))}
          </ul>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="offers" className="mt-10 sm:mt-14">
      <div className="grid gap-3 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-4">
        <div className="rounded-[1.75rem] bg-ink p-6 text-white sm:p-8">{copy}</div>
        <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4 lg:max-xl:[&>li:nth-child(n+4)]:hidden">
          {offers.slice(0, 4).map((p) => (
            <li key={p.id}><ProductCard product={p} /></li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/**
 * Staff picks: products the shop team marked as Featured in the admin. This stands in for a "most popular" shelf, which the
 * ERP cannot support because it holds no sales data. Hidden when fewer than three products are featured.
 */
export function StaffPicks({ products }: { products: ErpProduct[] }) {
  const list = products.filter((p) => p.available && p.images.length > 0);
  if (list.length < 3) return null;
  const [lead, ...rest] = list;
  const title = lead.content?.displayTitle || lead.name;
  return (
    <section aria-labelledby="picks" className="mt-10 sm:mt-14">
      <SectionIntro id="picks" eyebrow="Staff picks" title="Selected by our team" action={{ href: "/products", label: "View all products" }}>
        Products the shop has marked as featured.
      </SectionIntro>
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Link
          href={`/products/${lead.slug}`}
          className="group relative flex min-h-[22rem] flex-col overflow-hidden rounded-[1.75rem] bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          <span className="relative block flex-1">
            <span className="absolute inset-0 transition-transform duration-700 ease-out group-hover:scale-[1.04] motion-reduce:transition-none">
              <ProductImage src={lead.images[0]} alt="" sizes="(min-width:1024px) 40vw, 92vw" padding="p-8 sm:p-12" />
            </span>
          </span>
          <span className="flex items-end justify-between gap-4 px-6 pb-6 sm:px-8 sm:pb-8">
            <span className="min-w-0">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{lead.brand ?? "Featured"}</span>
              <span className="mt-1 line-clamp-2 block text-xl font-bold leading-snug tracking-tight sm:text-2xl">{title}</span>
              <span className="mt-1 block text-lg font-bold tabular-nums">{formatLkr(effectivePrice(lead))}</span>
            </span>
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink text-white transition-colors group-hover:bg-brand-500 group-hover:text-on-brand">
              <ArrowRight className="h-5 w-5" aria-hidden />
            </span>
          </span>
        </Link>
        <ul className="grid grid-cols-2 gap-3 sm:gap-4">
          {rest.slice(0, 4).map((p) => (
            <li key={p.id}><ProductCard product={p} /></li>
          ))}
        </ul>
      </div>
    </section>
  );
}
