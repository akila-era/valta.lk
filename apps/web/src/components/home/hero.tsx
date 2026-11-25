import Link from "next/link";
import { ArrowRight, ArrowUpRight, Zap } from "lucide-react";
import { ProductImage } from "@/components/products/product-card";
import { discountPercent, effectivePrice, isNewArrival } from "@/lib/erp/product-utils";
import type { ErpProduct } from "@/lib/erp/types";
import { formatLkr } from "@/lib/utils/money";
import { HeroSlider } from "./hero-slider";

export interface HeroSlide {
  product: ErpProduct;
  /** Why this product is here. Only what the data supports: staff-marked featured, newest in the catalogue, or a real sale price. */
  kind: "featured" | "new" | "offer";
}

interface HeroProps {
  /** Where "Discover Brands" goes; omitted when the catalogue has too few brands to browse. */
  brandsHref?: string;
  /** Up to three real, in-stock products with photographs. Empty shows the branded fallback. */
  slides: HeroSlide[];
}

function tag({ product, kind }: HeroSlide) {
  if (kind === "offer") {
    const pct = discountPercent(product);
    return pct ? `Offer · -${pct}%` : "Offer";
  }
  if (kind === "featured") return "Featured";
  return isNewArrival(product.publishedAt) ? "New arrival" : "Latest in the catalogue";
}

/** One lit display window: the real product photograph on a soft studio surface, with its name, price and stock beneath. */
function ProductStage({ slide, priority }: { slide: HeroSlide; priority: boolean }) {
  const { product: p, kind } = slide;
  const title = p.content?.displayTitle || p.name;
  const pct = discountPercent(p);
  return (
    <Link
      href={`/products/${p.slug}`}
      className="group relative isolate flex h-full flex-col overflow-hidden rounded-[2rem] bg-[radial-gradient(ellipse_at_50%_38%,#ffffff_0%,#eceef3_68%,#dfe3ec_100%)] text-ink shadow-[0_30px_60px_-30px_rgba(0,0,0,0.7)] ring-1 ring-white/10 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
    >
      <span className={`absolute left-4 top-4 z-10 rounded-full px-3 py-1.5 text-xs font-semibold ${kind === "offer" ? "bg-brand-500 text-on-brand" : "bg-ink text-white"}`}>{tag(slide)}</span>
      {/* multiply blends the photograph's white background into the studio surface, so the product looks lit, not pasted */}
      <span className="relative block flex-1 mix-blend-multiply">
        <span className="absolute inset-0 transition-transform duration-700 ease-out group-hover:scale-[1.04] motion-reduce:transition-none">
          <ProductImage src={p.images[0]} alt="" priority={priority} sizes="(min-width:1024px) 38vw, 92vw" padding="p-6 pt-12 sm:p-10 sm:pt-14" />
        </span>
      </span>
      <span aria-hidden className="pointer-events-none absolute inset-x-[22%] bottom-[19%] h-5 rounded-[50%] bg-ink/20 blur-xl" />
      <span className="relative flex items-center justify-between gap-4 px-5 pb-4 pt-1 sm:px-7 sm:pb-6">
        <span className="min-w-0">
          <span className="block truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{p.brand ?? "VOLTA.LK"}</span>
          <span className="line-clamp-2 block text-base font-bold leading-snug sm:text-lg">{title}</span>
          <span className="mt-1 flex flex-wrap items-baseline gap-x-2 text-sm tabular-nums">
            <span className="text-base font-bold sm:text-lg">{formatLkr(effectivePrice(p))}</span>
            {pct ? <s className="text-muted">{formatLkr(p.price)}</s> : null}
            <span className="text-xs font-medium text-success">In stock</span>
          </span>
        </span>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink text-white transition-colors group-hover:bg-brand-500 group-hover:text-on-brand">
          <ArrowUpRight className="h-5 w-5" aria-hidden />
        </span>
      </span>
    </Link>
  );
}

/** Shown only when the catalogue has no photographed in-stock product: a branded stage, never a made-up product. */
function BrandedStage() {
  return (
    <div aria-hidden className="flex h-full items-center justify-center overflow-hidden rounded-[1.5rem] bg-[radial-gradient(ellipse_at_50%_38%,#ffffff_0%,#eceef3_68%,#dfe3ec_100%)] ring-1 ring-white/10">
      <span className="select-none text-[22vw] font-black leading-none tracking-[-0.06em] text-ink/[0.07] lg:text-[9rem]">VOLTA</span>
    </div>
  );
}

/**
 * Premium hero: a dark studio scene with an orange light, a large editorial headline, and real catalogue products shown one at a
 * time in a lit display window with numbered progress indicators (only when there is more than one real product).
 */
export function Hero({ brandsHref, slides }: HeroProps) {
  const intro = (
    <>
      <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[13px] font-medium text-white/80"><Zap className="h-3.5 w-3.5 fill-brand-500 text-brand-500" aria-hidden />VOLTA.LK &middot; Sri Lanka</p>
      <h1 id="hero-title" className="mt-5 max-w-[11ch] text-[2.5rem] font-semibold leading-[1] tracking-[-0.035em] min-[390px]:text-[2.75rem] sm:text-5xl lg:text-[3.5rem]">
        Technology. <span className="text-brand-500">Elevated.</span>
      </h1>
      <p className="mt-4 max-w-md text-[15px] leading-7 text-white/75 sm:text-base">Discover premium technology and accessories designed for the way you live and work.</p>
      <div className="mt-7 flex flex-col gap-3 min-[430px]:flex-row min-[430px]:items-center">
        <Link href="/products" className="btn-primary btn-lg rounded-full shadow-lg shadow-brand-500/20">
          Explore Products <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
        {brandsHref && (
          <Link href={brandsHref} className="btn btn-lg rounded-full border border-white/25 text-white hover:bg-white/10">
            Discover Brands
          </Link>
        )}
      </div>
    </>
  );
  const stages = slides.length ? slides.map((s, i) => <ProductStage key={s.product.id} slide={s} priority={i === 0} />) : [<BrandedStage key="brand" />];
  const labels = slides.map((s) => s.product.content?.displayTitle || s.product.name);

  return (
    <div className="container-page pt-3 sm:pt-5">
    <section aria-labelledby="hero-title" className="on-dark relative isolate overflow-hidden rounded-[1.75rem] bg-ink text-white ring-1 ring-black/5">
      {/* Studio scene: an orange light from the right and two soft beams. Decorative only. */}
      <div aria-hidden className="absolute inset-0 -z-10">
        <div className="absolute -right-[10%] -top-[30%] h-[150%] w-[65%] bg-[radial-gradient(closest-side,rgba(6,121,61,0.35),transparent)]" />
        <div className="absolute -top-10 right-[22%] h-[140%] w-24 rotate-[24deg] bg-gradient-to-b from-white/[0.07] to-transparent" />
        <div className="absolute -top-10 right-[38%] h-[140%] w-10 rotate-[24deg] bg-gradient-to-b from-brand-500/20 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/50 to-transparent" />
      </div>
      <HeroSlider intro={intro} slides={stages} labels={labels} />
    </section>
    </div>
  );
}
