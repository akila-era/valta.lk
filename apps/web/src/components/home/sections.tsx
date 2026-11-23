import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ProductImage } from "@/components/products/product-card";
import { effectivePrice } from "@/lib/erp/product-utils";
import type { ErpProduct } from "@/lib/erp/types";
import type { HomeData, ResolvedBanner } from "@/lib/home-data";
import { formatLkr } from "@/lib/utils/money";
import { BannerImage } from "./banner-image";
import { categoryVisual } from "./category-art";
import { SectionIntro } from "./home-sections";
import { Reveal } from "./reveal";
import { WideBannerSlider } from "./wide-banner-slider";

function bannerPhoto(banner: ResolvedBanner): string {
  if (banner.custom && banner.image) return banner.image;
  const label = `${banner.eyebrow ?? ""} ${banner.headline}`;
  if (/phone|mobile/i.test(label)) return "/images/home/valta-hero-cinematic.webp";
  if (/audio|accessor|gadget|headphone/i.test(label)) return "/images/home/valta-banner-audio.webp";
  return categoryVisual(label) ?? banner.image ?? "/images/home/valta-hero-cinematic.webp";
}

/** Staff-chosen full-width pictures (each optionally a link) that rotate. */
export function WideBanner({ banners }: { banners: HomeData["wideBanners"] }) {
  if (!banners.length) return null;
  return (
    <section aria-label="Promotions" className="mt-16 sm:mt-24">
      <WideBannerSlider slides={banners} />
    </section>
  );
}

/** Campaign banners created by staff in the admin. Shown as written; nothing is added to them. */
export function StaffBanners({ banners }: { banners: ResolvedBanner[] }) {
  if (!banners.length) return null;
  return (
    <section aria-label="Featured collections" className={`mt-4 grid gap-4 sm:gap-5 ${banners.length === 2 ? "lg:grid-cols-[1.35fr_1fr]" : banners.length > 2 ? "lg:grid-cols-2" : ""}`}>
      {banners.map((b) => (
        <article key={b.href + b.headline + b.ctaLabel} className="grid overflow-hidden rounded-[1.75rem] bg-surface md:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
          <div className="flex flex-col justify-center p-6 sm:p-8">
            {b.eyebrow && <p className="eyebrow">{b.eyebrow}</p>}
            <h3 className="mt-2 max-w-xs text-2xl font-semibold leading-tight tracking-[-0.03em] text-ink sm:text-3xl">{b.headline}</h3>
            {b.text && <p className="type-meta mt-2 max-w-xs">{b.text}</p>}
            <Link href={b.href} className="btn-primary mt-5 w-fit">
              {b.ctaLabel} <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
          <div className="relative min-h-56 bg-ink md:min-h-full">
            <BannerImage src={bannerPhoto(b)} unoptimized={b.custom} sizes="(min-width:1024px) 36vw, 100vw" className={`object-cover ${b.custom ? "" : "grayscale contrast-110"}`} />
          </div>
        </article>
      ))}
    </section>
  );
}

interface Panel {
  key: string;
  eyebrow: string;
  headline: string;
  href: string;
  cta: string;
  text: string;
  products: ErpProduct[];
}

/**
 * Builds up to three campaign panels from real catalogue categories. The line under each headline only states a real
 * fact (how many products, and the lowest current price); there are no invented offers, discounts or urgency.
 */
function buildPanels(data: HomeData): Panel[] {
  const usable = (list: ErpProduct[]) => list.filter((p) => p.available && p.images.length > 0);
  const copy: Record<string, { eyebrow: string; headline: (name: string) => string; noun: string }> = {
    essentials: { eyebrow: "Everyday essentials", headline: () => "The small things that make every day easier.", noun: "products" },
    phones: { eyebrow: "Find your next device", headline: () => "A new phone, chosen with the numbers in front of you.", noun: "phones" },
    setup: { eyebrow: "Upgrade your setup", headline: () => "Make your desk work as hard as you do.", noun: "products" },
  };
  const order = ["essentials", "phones", "setup"];
  return order
    .map((role) => data.spotlights.find((s) => s.role === role))
    .filter((s): s is NonNullable<typeof s> => Boolean(s))
    .map((s) => {
      const shown = usable(s.products);
      const c = copy[s.role];
      // Only real facts: how many products the category holds and the lowest current price among those shown.
      const lowest = Math.min(...s.products.map((p) => effectivePrice(p)));
      return { key: s.slug, eyebrow: c.eyebrow, headline: c.headline(s.name), href: `/categories/${s.slug}`, cta: `Shop ${s.name.toLowerCase()}`, text: `${s.count} ${c.noun} in the catalogue, from ${formatLkr(lowest)}.`, products: shown.slice(0, 3) };
    })
    .filter((p) => p.products.length >= 2);
}

/** Editorial campaign panels: asymmetric layout, real products, dark and light tones alternating. */
export function EditorialCampaigns({ data }: { data: HomeData }) {
  const panels = buildPanels(data);
  const staff = data.bannersFromStaff ? data.banners : [];
  if (!panels.length && !staff.length) return null;
  const span = ["lg:col-span-7", "lg:col-span-5", "lg:col-span-12"];
  return (
    <section aria-labelledby="campaigns" className="mt-16 sm:mt-24">
      <SectionIntro id="campaigns" eyebrow="Editorial" title="Ideas worth a closer look." />
      <ul className="grid gap-4 sm:gap-5 lg:grid-cols-12">
        {panels.map((p, i) => {
          const dark = i === 1;
          const wide = i === 2;
          return (
            <Reveal as="li" key={p.key} delay={i * 80} className={span[i] ?? "lg:col-span-12"}>
              <article className={`flex h-full flex-col overflow-hidden rounded-[1.75rem] ${dark ? "bg-ink text-white" : "bg-surface text-ink"} ${wide ? "md:flex-row md:items-stretch" : ""}`}>
                <div className={`flex flex-col justify-between gap-8 p-6 sm:p-9 ${wide ? "md:w-1/2" : ""}`}>
                  <div>
                    <p className={`text-xs font-semibold uppercase tracking-[0.14em] ${dark ? "text-white/70" : "text-brand-600"}`}>{p.eyebrow}</p>
                    <h3 className="mt-3 max-w-sm text-2xl font-bold leading-[1.1] tracking-[-0.03em] sm:text-3xl">{p.headline}</h3>
                    <p className={`mt-3 max-w-sm text-sm leading-6 ${dark ? "text-white/70" : "text-muted"}`}>{p.text}</p>
                  </div>
                  <Link href={p.href} className={`btn w-fit rounded-full px-6 ${dark ? "bg-white text-ink hover:bg-white/90" : "bg-ink text-white hover:bg-black"}`}>
                    {p.cta} <ArrowRight className="h-4 w-4" aria-hidden />
                  </Link>
                </div>
                <div className={`grid flex-1 grid-cols-3 gap-2 px-4 pb-4 sm:gap-3 sm:px-6 sm:pb-6 ${wide ? "md:p-6" : ""}`}>
                  {p.products.map((pr, n) => (
                    <Link
                      key={pr.id}
                      href={`/products/${pr.slug}`}
                      aria-label={`${pr.content?.displayTitle || pr.name}, ${formatLkr(effectivePrice(pr))}`}
                      className={`group relative flex aspect-[3/4] flex-col overflow-hidden rounded-2xl bg-white text-ink ${n === 1 ? "translate-y-4" : ""}`}
                    >
                      <span className="relative block flex-1">
                        <span className="absolute inset-0 transition-transform duration-500 group-hover:scale-105 motion-reduce:transition-none">
                          <ProductImage src={pr.images[0]} alt="" sizes="(min-width:1024px) 14vw, 30vw" padding="p-2" />
                        </span>
                      </span>
                      <span className="block truncate px-2.5 pb-2.5 text-xs font-semibold tabular-nums">{formatLkr(effectivePrice(pr))}</span>
                    </Link>
                  ))}
                </div>
              </article>
            </Reveal>
          );
        })}
      </ul>
      <StaffBanners banners={staff} />
    </section>
  );
}
