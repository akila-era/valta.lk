import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Zap } from "lucide-react";
import { ProductCard } from "@/components/products/product-card";
import type { HomeData } from "@/lib/home-data";
import { categoryVisual } from "./category-art";

type Rail = HomeData["rails"][number];

const TITLES: [RegExp, string][] = [
  [/audio|headphone|earbud/i, "Experience Every Beat with Headphones & Earbuds"],
  [/phone|mobile/i, "Find Your Next Phone"],
  [/watch|wear/i, "Smart Watches for Every Day"],
  [/charg|cable|accessor/i, "Power Up with Chargers & Accessories"],
];

/** Pick the rail to feature: audio first, then phones, then the biggest one. */
export function pickShowcase(rails: Rail[]): Rail | undefined {
  const usable = rails.filter((r) => r.products.length >= 4);
  return usable.find((r) => /audio|headphone|earbud/i.test(r.name)) ?? usable.find((r) => /phone|mobile/i.test(r.name)) ?? usable[0];
}

/** A category showcase: a tall photo card on the left and the category's products in a bordered grid on the right. */
export function CategoryShowcase({ rail }: { rail: Rail | undefined }) {
  if (!rail) return null;
  const title = TITLES.find(([re]) => re.test(rail.name))?.[1] ?? `Shop ${rail.name}`;
  const art = categoryVisual(rail.name);
  // Whole rows only (four across on desktop), so the grid never ends with empty cells.
  const products = rail.products.slice(0, rail.products.length >= 8 ? 8 : 4);
  return (
    <section aria-labelledby="showcase-title" className="container-page mt-10 sm:mt-14">
      <h2 id="showcase-title" className="mx-auto mb-6 max-w-3xl text-center text-2xl font-semibold leading-tight tracking-tight text-ink sm:mb-8 sm:text-[2rem]">{title}</h2>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2.4fr)] lg:gap-4">
        <Link href={`/categories/${rail.slug}`} className="group relative isolate flex min-h-64 overflow-hidden rounded-2xl bg-ink text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 lg:min-h-full">
          {art && <Image src={art} alt="" fill sizes="(min-width:1024px) 28vw, 100vw" loading="lazy" className="-z-10 object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:transition-none" />}
          <span aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-black/85 via-black/35 to-black/10" />
          <span className="mt-auto flex flex-col items-start gap-2 p-6">
            <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-[0.1em] text-white/90">
              <Zap className="h-3.5 w-3.5 fill-brand-500 text-brand-500" aria-hidden /> VOLTA.LK
            </span>
            <span className="text-2xl font-semibold leading-tight">{rail.name}</span>
            <span className="mt-2 inline-flex min-h-10 items-center gap-2 rounded-full bg-brand-500 px-5 text-sm font-semibold text-on-brand transition-colors group-hover:bg-brand-400">
              Shop now <ArrowRight className="h-4 w-4" aria-hidden />
            </span>
          </span>
        </Link>
        <ul className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border lg:grid-cols-4">
          {products.map((p) => (
            <li key={p.id} className="bg-white p-3">
              <ProductCard product={p} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
