import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import type { HomeData } from "@/lib/home-data";
import { categoryVisual } from "./category-art";
import { Reveal } from "./reveal";

/** Large headline used by every homepage section: an optional small label, the title and an optional supporting line. */
export function SectionIntro({ id, eyebrow, title, children, action }: { id: string; eyebrow?: string; title: string; children?: React.ReactNode; action?: { href: string; label: string } }) {
  return (
    <Reveal className="mb-6 flex flex-col gap-3 sm:mb-9 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h2 id={id} className="max-w-2xl text-3xl font-bold leading-[1.05] tracking-[-0.035em] text-ink sm:text-4xl lg:text-5xl">{title}</h2>
        {children && <div className="mt-3 max-w-lg text-sm leading-6 text-muted sm:text-base">{children}</div>}
      </div>
      {action && (
        <Link href={action.href} className="group inline-flex min-h-11 shrink-0 items-center gap-1.5 text-sm font-semibold text-ink underline-offset-4 hover:text-brand-600 hover:underline">
          {action.label} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
        </Link>
      )}
    </Reveal>
  );
}

/** The five departments from the brief, in this order, but only those that exist in the live catalogue. */
const WANTED = [/phone|mobile/i, /accessor/i, /audio/i, /tablet/i, /wear|watch/i];
const MAX_TILES = 5;

function pickCategories(all: HomeData["categories"]) {
  const out: HomeData["categories"] = [];
  for (const re of WANTED) {
    const c = all.find((x) => re.test(x.name) && !out.includes(x));
    if (c) out.push(c);
  }
  // Catalogues that lack some of those departments are filled with their largest real categories instead.
  for (const c of [...all].sort((a, b) => b.count - a.count)) {
    if (out.length >= MAX_TILES) break;
    if (!out.includes(c)) out.push(c);
  }
  return out.slice(0, MAX_TILES);
}

/** "Explore categories": one large photographic tile per real category (a bento on wide screens, a 2-column grid on phones). */
export function CategoryTiles({ categories }: { categories: HomeData["categories"] }) {
  const shown = pickCategories(categories);
  if (!shown.length) return null;
  const bento = shown.length === 5;
  return (
    <section aria-labelledby="cats" className="mt-12 sm:mt-20">
      <SectionIntro id="cats" eyebrow="Explore" title="Find your category" action={{ href: "/products", label: "All products" }} />
      <ul className={`grid grid-cols-2 gap-3 sm:gap-4 ${bento ? "lg:grid-cols-4 lg:grid-rows-2" : "lg:grid-cols-3"}`}>
        {shown.map((c, i) => {
          const art = categoryVisual(c.name) ?? c.image;
          const feature = bento && i === 0;
          return (
            <Reveal as="li" key={c.slug} delay={i * 70} className={feature ? "col-span-2 lg:col-span-2 lg:row-span-2" : ""}>
              <Link
                href={`/categories/${c.slug}`}
                className={`group relative block overflow-hidden rounded-[1.75rem] bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 ${feature ? "aspect-[16/10] lg:aspect-auto lg:h-full lg:min-h-[28rem]" : "aspect-[4/5] sm:aspect-square lg:aspect-auto lg:h-full lg:min-h-[13.5rem]"}`}
              >
                {art && (
                  <Image
                    src={art}
                    alt=""
                    fill
                    sizes={feature ? "(min-width:1024px) 50vw, 100vw" : "(min-width:1024px) 25vw, 50vw"}
                    className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.06] motion-reduce:transition-none"
                  />
                )}
                <span className="absolute inset-x-2.5 bottom-2.5 flex items-center justify-between gap-2 rounded-2xl bg-white/90 px-3 py-2.5 backdrop-blur-sm sm:inset-x-4 sm:bottom-4 sm:px-4 sm:py-3">
                  <span className="min-w-0">
                    <span className={`block break-words font-semibold leading-tight tracking-tight text-ink ${feature ? "text-lg sm:text-2xl" : "text-base"}`}>{c.name}</span>
                    <span className="block text-xs text-muted">{c.count} {c.count === 1 ? "product" : "products"}</span>
                  </span>
                  <span className={`h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-white transition-colors group-hover:bg-brand-500 group-hover:text-on-brand ${feature ? "flex" : "hidden sm:flex"}`}>
                    <ArrowUpRight className="h-4 w-4" aria-hidden />
                  </span>
                </span>
              </Link>
            </Reveal>
          );
        })}
      </ul>
    </section>
  );
}
