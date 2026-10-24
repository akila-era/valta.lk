import Image from "next/image";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { categoryVisual } from "@/components/home/category-art";
import { accentize } from "@/components/ui/page-intro";

interface BreadcrumbItem {
  href?: string;
  label: string;
}

interface StoreHeroBannerProps {
  breadcrumbs?: BreadcrumbItem[];
  section?: string;
  label?: string;
  title: string;
  intro?: ReactNode;
  categoryName?: string;
  customVisual?: string;
  tagline?: string;
  /** Word or phrase of the title set in the serif accent (default: the last word); false for none. */
  accent?: string | false;
}

const CATEGORY_TAGLINES: Record<string, string> = {
  accessories: "Everyday Essentials",
  audio: "Pure Sound & Beats",
  phones: "Next-Gen Mobile",
  smartphones: "Next-Gen Mobile",
  tablets: "Work, Study, Create",
  wearables: "Track Every Move",
  gaming: "Level Up Your Game",
  products: "Curated Tech Collection",
  search: "Discover Your Upgrade",
};

function getTagline(name: string): string {
  const n = name.toLowerCase();
  for (const [key, val] of Object.entries(CATEGORY_TAGLINES)) {
    if (n.includes(key)) return val;
  }
  return "Premium Tech Showcase";
}

export function StoreHeroBanner({
  breadcrumbs,
  section = "SHOP",
  label = "CATEGORY",
  title,
  intro,
  categoryName,
  customVisual,
  tagline,
  accent,
}: StoreHeroBannerProps) {
  const cat = categoryName || title;
  const art = customVisual || categoryVisual(cat) || (cat.toLowerCase().includes("product") ? "/images/home/valta-category-accessories.webp" : undefined);
  const displayTagline = tagline || getTagline(cat);

  return (
    <section className="relative mb-4 sm:mb-5 w-full">
      {/* Full-width background layer: spans entire viewport, no card borders, blends smoothly into page */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-y-3 left-1/2 -z-10 w-screen -translate-x-1/2 overflow-hidden bg-gradient-to-b from-[#FFF5EC]/60 via-[#FAF8F5]/30 to-transparent"
      >
        {/* Subtle dot pattern and restrained ambient orange bloom */}
        <span
          className="absolute inset-0 [background-image:radial-gradient(rgb(23_23_23/0.035)_1px,transparent_1.3px)] [background-size:16px_16px] [mask-image:linear-gradient(180deg,#000_50%,transparent_95%)]"
        />
        <span
          className="absolute -top-10 right-[12%] h-44 w-44 rounded-full bg-brand-500/8 blur-3xl"
        />
      </div>

      {/* Content container: strictly aligned with existing page margins */}
      <div className="flex flex-col justify-between gap-3 py-1 sm:py-2 md:flex-row md:items-center">
        {/* Left Column: Breadcrumbs, Eyebrow, Title, Description / Count */}
        <div className="max-w-2xl min-w-0">
          {breadcrumbs && breadcrumbs.length > 0 && (
            <nav aria-label="Breadcrumbs" className="mb-2">
              <ol className="inline-flex flex-wrap items-center gap-1.5 rounded-full border border-border/80 bg-white/90 px-3 py-0.5 text-xs text-muted shadow-xs backdrop-blur-sm">
                {breadcrumbs.map((item, i) => {
                  const isLast = i === breadcrumbs.length - 1;
                  return (
                    <li key={`${item.label}-${i}`} className="inline-flex items-center gap-1.5">
                      {i > 0 && <ChevronRight className="h-3 w-3 text-muted/60" aria-hidden />}
                      {item.href && !isLast ? (
                        <Link href={item.href} className="hover:text-ink hover:underline">
                          {item.label}
                        </Link>
                      ) : (
                        <span className="font-semibold text-ink">{item.label}</span>
                      )}
                    </li>
                  );
                })}
              </ol>
            </nav>
          )}

          {/* Same story typography as the homepage chapters: kicker, then a light headline with one serif accent word. */}
          <p className="kicker animate-fade-up">
            <span className="text-brand-600">{section}</span>
            {label ? <> / {label}</> : null}
          </p>

          <h1 className="statement mt-2 max-w-[20ch] animate-fade-up text-[clamp(2.1rem,1.4rem+2.4vw,3.6rem)] [--d:80ms]">
            {accentize(title, accent)}
          </h1>

          {intro && (
            <div className="mt-2 max-w-xl animate-fade-up text-sm leading-6 text-muted [--d:160ms] sm:text-[15px]">
              {intro}
            </div>
          )}
        </div>

        {/* Right Column: Scaled compact editorial accent & studio artwork */}
        {art && (
          <div className="relative hidden shrink-0 items-center justify-end md:flex">
            <div className="flex flex-col items-end pr-3">
              <span className="font-serif text-base italic text-ink/55 lg:text-lg">
                {displayTagline}
              </span>
              <span className="mt-0.5 h-0.5 w-8 rounded-full bg-brand-500/30" />
            </div>

            <div className="relative aspect-square h-24 w-24 animate-float [--dur:7s] lg:h-28 lg:w-28">
              {/* A tilted orange orbit under the product: the same 3D stage as the homepage. */}
              <span aria-hidden className="absolute inset-x-[-30%] top-[62%] aspect-square -translate-y-1/2 rounded-full border border-brand-500/40 [transform:perspective(600px)_rotateX(76deg)]" />
              {/* Soft spotlight disc */}
              <span
                aria-hidden
                className="absolute inset-1 rounded-full bg-white/70 shadow-xs"
              />
              <span
                aria-hidden
                className="absolute bottom-1 left-1/2 h-2 w-3/4 -translate-x-1/2 rounded-[50%] bg-ink/15 blur-sm"
              />
              <div className="relative h-full w-full mix-blend-multiply [mask-image:radial-gradient(closest-side,#000_72%,transparent)]">
                <Image
                  src={art}
                  alt=""
                  fill
                  sizes="112px"
                  className="object-contain p-1 filter drop-shadow-[0_4px_8px_rgba(27,23,20,0.08)]"
                  priority
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
