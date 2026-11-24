import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { HomeData, ResolvedBanner } from "@/lib/home-data";
import { BannerImage } from "./banner-image";
import { categoryVisual } from "./category-art";
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
