import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { HomeData } from "@/lib/home-data";
import { BannerSlider } from "./banner-slider";
import { SidePair, type SidePic } from "./side-slider";

interface Slide {
  image: string;
  alt: string;
  href: string;
  eyebrow?: string;
  headline?: string;
  text?: string;
  cta?: string;
  /** Uploaded by staff: served by our own route and shown as is. */
  custom?: boolean;
  /** Picture-only banner (staff "wide" picture): no text on top. */
  pictureOnly?: boolean;
}

/** Studio photographs that ship with the site, matched to a category name. */
const PHOTOS: { test: RegExp; src: string; eyebrow: string }[] = [
  { test: /phone|mobile/i, src: "/images/home/valta-hero-cinematic.webp", eyebrow: "Smartphones" },
  { test: /audio|earbud|headphone|speaker/i, src: "/images/home/valta-hero-audio.webp", eyebrow: "Audio & Sound" },
  { test: /watch|wear/i, src: "/images/home/valta-hero-watch.webp", eyebrow: "Smartwatches" },
  { test: /tablet/i, src: "/images/home/valta-hero-tablet.webp", eyebrow: "Tablets" },
  { test: /laptop|computer/i, src: "/images/home/valta-banner-laptop.webp", eyebrow: "Computers" },
  { test: /accessor|charg|cable|gadget/i, src: "/images/home/valta-hero-electronics.webp", eyebrow: "Accessories" },
];

function buildSlides(data: Pick<HomeData, "banners" | "bannersFromStaff" | "wideBanners" | "categories">): Slide[] {
  if (data.wideBanners.length) {
    return data.wideBanners.map((w) => ({ image: w.image, alt: w.alt, href: w.href ?? "/products", custom: true, pictureOnly: true }));
  }
  if (data.bannersFromStaff && data.banners.length) {
    return data.banners.map((b) => ({
      image: b.custom && b.image ? b.image : (PHOTOS.find((p) => p.test.test(`${b.eyebrow ?? ""} ${b.headline}`))?.src ?? "/images/home/valta-hero-banner.webp"),
      alt: b.headline,
      href: b.href,
      eyebrow: b.eyebrow,
      headline: b.headline,
      text: b.text,
      cta: b.ctaLabel,
      custom: b.custom,
    }));
  }
  // No staff banners: one slide per department that really exists, using the shipped studio photos.
  const out: Slide[] = [];
  for (const p of PHOTOS) {
    const c = data.categories.find((x) => p.test.test(x.name));
    if (c && !out.some((o) => o.image === p.src)) {
      out.push({ image: p.src, alt: c.name, href: `/categories/${c.slug}`, eyebrow: p.eyebrow, headline: `Shop ${c.name}`, text: "Genuine products, delivered island-wide.", cta: "Shop now" });
    }
    if (out.length >= 3) break;
  }
  if (!out.length) out.push({ image: "/images/home/valta-hero-banner.webp", alt: "VOLTA.LK", href: "/products", eyebrow: "VOLTA.LK", headline: "Phones, chargers & accessories", text: "Genuine products, delivered island-wide.", cta: "Shop now" });
  return out;
}

function SlideView({ s, priority }: { s: Slide; priority: boolean }) {
  const img = <Image src={s.image} alt={s.pictureOnly ? s.alt : ""} fill priority={priority} loading={priority ? undefined : "lazy"} unoptimized={s.custom} sizes="100vw" className="kb-img object-cover" />;
  if (s.pictureOnly) {
    return (
      <Link href={s.href} className="absolute inset-0 block" aria-label={s.alt}>
        {img}
      </Link>
    );
  }
  return (
    <div className="absolute inset-0 bg-ink">
      {/* Picture sits on the right side and fades into the dark text panel on the left. */}
      <div className="absolute inset-y-0 right-0 w-full md:w-[68%] [mask-image:linear-gradient(to_right,transparent,#000_38%)]">
        <Image src={s.image} alt="" fill priority={priority} loading={priority ? undefined : "lazy"} unoptimized={s.custom} sizes="(min-width:1024px) 45vw, 100vw" className="kb-img object-cover object-center" />
      </div>
      <span aria-hidden className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/20 to-transparent md:from-black/40" />
      <div className="relative flex h-full max-w-md flex-col justify-center px-6 pb-10 sm:px-10 md:pl-16 lg:pl-[max(4rem,calc((100vw-100rem)/2+2.5rem))]">
        {s.eyebrow && <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-brand-400 hero-in" style={{ "--hd": "150ms" } as React.CSSProperties}>{s.eyebrow}</p>}
        {s.headline && <h2 style={{ "--hd": "300ms" } as React.CSSProperties} className="hero-in mt-2 line-clamp-3 text-[1.75rem] font-semibold leading-[1.1] tracking-tight text-white sm:text-4xl">{s.headline}</h2>}
        {s.text && <p style={{ "--hd": "450ms" } as React.CSSProperties} className="hero-in mt-3 line-clamp-2 max-w-sm text-[15px] leading-6 text-white/80">{s.text}</p>}
        <Link href={s.href} style={{ "--hd": "600ms" } as React.CSSProperties} className="hero-in btn-primary btn-lg mt-5 w-fit rounded-full">
          {s.cta || "Shop now"} <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </div>
  );
}

/** Shown beside the slider until staff upload their own pictures: shipped photos with no category labels. They slide too. */
const SIDE_FALLBACK: SidePic[] = [
  { image: "/images/home/valta-hero-electronics.webp", alt: "Shop all products", href: "/products" },
  { image: "/images/home/valta-hero-audio.webp", alt: "See the newest arrivals", href: "/products?sort=newest" },
  { image: "/images/home/valta-hero-watch.webp", alt: "Browse the brands", href: "/brands" },
  { image: "/images/home/valta-hero-tablet.webp", alt: "Shop all products", href: "/products" },
];

/**
 * Hero: a full-bleed banner slider with two pictures beside it (desktop). The slider shows staff banners when there are any,
 * otherwise one slide per real category with the shipped studio photos; the side pictures are staff uploads, or two shipped photos.
 */
export function BannerHero({ data }: { data: Pick<HomeData, "banners" | "bannersFromStaff" | "wideBanners" | "categories" | "sideBanners"> }) {
  const slides = buildSlides(data);
  const side: SidePic[] = data.sideBanners.length ? data.sideBanners : SIDE_FALLBACK;
  return (
    <section aria-label="Featured offers">
      <h1 className="sr-only">VOLTA.LK | Mobile phones, electronics &amp; accessories in Sri Lanka</h1>
      <div className="lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-1">
        <BannerSlider label="Featured offers" className="aspect-[4/3] sm:aspect-[16/7] lg:aspect-auto lg:h-[clamp(22rem,calc(100svh-15rem),38rem)]" slides={slides.map((s, i) => <SlideView key={s.image + i} s={s} priority={i === 0} />)} />
        <SidePair pics={side} className={`hidden gap-1 lg:grid lg:h-[clamp(22rem,calc(100svh-15rem),38rem)] ${side.length > 1 ? "grid-rows-2" : "grid-rows-1"}`} />
      </div>
    </section>
  );
}
