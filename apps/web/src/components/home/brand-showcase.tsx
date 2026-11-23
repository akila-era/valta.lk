import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BrandTile } from "@/components/brands/brand-tile";
import type { HomeData } from "@/lib/home-data";
import { SectionIntro } from "./home-sections";
import { Reveal } from "./reveal";

/**
 * Shop by brand. Every tile is a real brand from the live catalogue, largest range first, so the section follows the
 * catalogue automatically. Phones swipe sideways; from tablet width it is a tidy grid. "View all brands" opens /brands.
 */
export function BrandShowcase({ brands }: { brands: HomeData["brands"] }) {
  const list = brands.filter((b) => b.count > 0);
  if (list.length < 2) return null;
  // Full rows only on the 4-column grid (never a lonely last tile): 8, 4, or whatever fewer brands there are.
  const shown = list.slice(0, list.length >= 8 ? 8 : list.length >= 4 ? 4 : list.length);
  return (
    <section id="brands" aria-labelledby="brands-title" className="mt-16 scroll-mt-40 sm:mt-24">
      <SectionIntro id="brands-title" eyebrow="Brands" title="Shop by brand" action={{ href: "/brands", label: "View all brands" }}>
        Brands in our catalogue, largest ranges first.
      </SectionIntro>
      <ul className="-mx-4 flex scroll-px-4 snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 scrollbar-none sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:px-0 sm:pb-0 md:grid-cols-4">
        {shown.map((b, i) => (
          <Reveal as="li" key={b.name} delay={Math.min(i, 5) * 60} className="w-[62%] shrink-0 snap-start min-[430px]:w-[46%] sm:w-auto">
            <BrandTile brand={b} />
          </Reveal>
        ))}
        <li className="w-[62%] shrink-0 snap-start min-[430px]:w-[46%] sm:hidden">
          <Link
            href="/brands"
            className="flex h-full min-h-[12rem] flex-col items-start justify-between rounded-[1.75rem] bg-ink p-5 text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-white/70">{list.length} brands</span>
            <span className="flex w-full items-end justify-between gap-3 text-xl font-bold leading-tight tracking-[-0.03em]">
              View all brands
              <ArrowRight className="h-5 w-5 shrink-0" aria-hidden />
            </span>
          </Link>
        </li>
      </ul>
    </section>
  );
}
