import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ProductCard } from "@/components/products/product-card";
import type { ErpProduct } from "@/lib/erp/types";
import type { HomeData } from "@/lib/home-data";
import { categoryVisual } from "./category-art";
import { ProductCarousel } from "./product-carousel";

type Rail = HomeData["rails"][number];

interface Collection {
  rail: Rail;
  products: ErpProduct[];
  /** Studio photograph for the department, or a real product photo from the catalogue. */
  art?: string;
}

const countText = (n: number) => `${n} ${n === 1 ? "product" : "products"}. Newest first.`;
const eyebrow = "text-xs font-semibold uppercase tracking-[0.14em]";

/** Variant A: a photographic banner beside a row of three products (four on phones, in two rows of two). */
function Banner({ c }: { c: Collection }) {
  const { rail } = c;
  return (
    <div className="grid gap-3 sm:gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <Link
        href={`/categories/${rail.slug}`}
        className="group relative isolate flex min-h-[18rem] flex-col justify-end overflow-hidden rounded-[1.75rem] bg-ink p-6 text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 sm:p-8 lg:min-h-full"
      >
        {c.art && <Image src={c.art} alt="" fill sizes="(min-width:1024px) 40vw, 92vw" className="-z-20 object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04] motion-reduce:transition-none" />}
        <span aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-ink/90 via-ink/35 to-transparent" />
        <p className={`${eyebrow} text-brand-500`}>Collection</p>
        <h2 id={`collection-${rail.slug}`} className="mt-2 text-3xl font-bold leading-[1.05] tracking-[-0.035em] sm:text-4xl">{rail.name}</h2>
        <p className="mt-2 text-sm text-white/80">{countText(rail.count)}</p>
        <span className="mt-5 inline-flex min-h-11 w-fit items-center gap-2 rounded-full bg-brand-500 px-5 text-sm font-semibold text-on-brand transition-colors group-hover:bg-brand-400">
          View collection <ArrowRight className="h-4 w-4" aria-hidden />
        </span>
      </Link>
      <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 lg:[&>li:nth-child(n+4)]:hidden">
        {c.products.slice(0, 4).map((p) => (
          <li key={p.id}><ProductCard product={p} /></li>
        ))}
      </ul>
    </div>
  );
}

/** Variant B: a black band with the products in white tiles. */
function Dark({ c }: { c: Collection }) {
  const { rail } = c;
  return (
    <div className="rounded-[2rem] bg-ink p-5 text-white sm:p-8 lg:p-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className={`${eyebrow} text-brand-500`}>Collection</p>
          <h2 id={`collection-${rail.slug}`} className="mt-2 text-3xl font-bold leading-[1.05] tracking-[-0.035em] sm:text-4xl lg:text-5xl">{rail.name}</h2>
          <p className="mt-2 text-sm text-white/70">{countText(rail.count)}</p>
        </div>
        <Link href={`/categories/${rail.slug}`} className="group inline-flex min-h-11 shrink-0 items-center gap-1.5 text-sm font-semibold text-white underline-offset-4 hover:underline">
          View collection <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
        </Link>
      </div>
      <ul className="scrollbar-none -mx-1 mt-6 flex snap-x gap-3 overflow-x-auto px-1 pb-2 sm:mx-0 sm:grid sm:grid-cols-4 sm:gap-4 sm:overflow-visible sm:px-0 sm:pb-0">
        {c.products.slice(0, 4).map((p) => (
          <li key={p.id} className="w-[46%] shrink-0 snap-start sm:w-auto">
            <div className="rounded-2xl bg-white p-2 text-ink"><ProductCard product={p} /></div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Variant C: a text column beside a swipeable carousel. */
function Strip({ c }: { c: Collection }) {
  const { rail } = c;
  return (
    <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10">
      <div className="flex flex-col justify-center">
        <p className={`${eyebrow} text-brand-600`}>Collection</p>
        <h2 id={`collection-${rail.slug}`} className="mt-2 text-3xl font-bold leading-[1.05] tracking-[-0.035em] sm:text-4xl">{rail.name}</h2>
        <p className="mt-3 text-sm leading-6 text-muted">{countText(rail.count)}</p>
        <Link href={`/categories/${rail.slug}`} className="mt-5 inline-flex min-h-11 w-fit items-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-500 hover:text-on-brand">
          View collection <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
      <ProductCarousel label={`${rail.name} collection`} align="start">
        {c.products.map((p) => (
          <li key={p.id} className="w-1/2 shrink-0 snap-start px-1.5 sm:w-1/3 sm:px-2">
            <ProductCard product={p} />
          </li>
        ))}
      </ProductCarousel>
    </div>
  );
}

const VARIANTS = [Banner, Dark, Strip] as const;

/**
 * Collections built from the catalogue's own largest categories (no collection is invented): a photographic banner, a black
 * band and a carousel, so no two look alike. A category needs at least four in-stock products to qualify.
 */
export function Collections({ data, from = 0, to = 3 }: { data: HomeData; from?: number; to?: number }) {
  const list: Collection[] = data.rails
    .map((rail) => ({
      rail,
      products: rail.products.filter((p) => p.available),
      art: categoryVisual(rail.name) ?? data.categories.find((c) => c.slug === rail.slug)?.image,
    }))
    .filter((c) => c.products.length >= 4)
    .slice(0, 3);
  // `from` and `to` let the page place the three collections at different points, so they never form one long block.
  const shown = list.slice(from, to);
  if (!shown.length) return null;
  return (
    <>
      {shown.map((c, n) => {
        const Variant = VARIANTS[(from + n) % VARIANTS.length];
        return (
          <section key={c.rail.slug} aria-labelledby={`collection-${c.rail.slug}`} className="mt-16 sm:mt-24">
            <Variant c={c} />
          </section>
        );
      })}
    </>
  );
}
