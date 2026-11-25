import Link from "next/link";
import { categoryIcon } from "@/components/ui/category-icon";
import type { HomeData } from "@/lib/home-data";
import { Reveal } from "./reveal";

type Cat = HomeData["categories"][number];

function tile(c: Cat, key: string, hidden: boolean) {
  const Icon = categoryIcon(c.name);
  return (
    <li key={key} className="shrink-0" aria-hidden={hidden || undefined}>
      <Link href={`/categories/${c.slug}`} tabIndex={hidden ? -1 : undefined} className="group flex w-40 flex-col items-center gap-4 rounded-2xl px-3 py-4 text-center transition-colors hover:bg-surface sm:w-48">
        <Icon className="h-20 w-20 text-ink/85 transition-all duration-300 group-hover:-translate-y-1 group-hover:scale-105 group-hover:text-brand-600 motion-reduce:transition-none motion-reduce:group-hover:translate-y-0 sm:h-24 sm:w-24" strokeWidth={1} aria-hidden />
        <span className="line-clamp-2 text-base font-semibold leading-tight text-ink">{c.name}</span>
      </Link>
    </li>
  );
}

/**
 * "Shop by Category": large line icons with the category name. They glide sideways in a loop (paused while the pointer or
 * keyboard focus is on them) and stay still, scrollable by hand, for visitors who ask for reduced motion.
 */
export function CategoryIcons({ categories }: { categories: HomeData["categories"] }) {
  const base = categories.slice(0, 16);
  if (base.length < 2) return null;
  // Repeat the set until one run is wider than a big screen, then two runs make the endless loop.
  const run: Cat[] = [];
  while (run.length < 10) run.push(...base);
  return (
    <section aria-labelledby="cat-icons-title" className="mt-10 sm:mt-14">
      <Reveal>
        <h2 id="cat-icons-title" className="mb-6 text-center text-2xl font-semibold tracking-tight text-ink sm:mb-8 sm:text-[2rem]">Shop by Category</h2>
      </Reveal>
      <div className="marquee overflow-hidden motion-reduce:overflow-x-auto [mask-image:linear-gradient(to_right,transparent,#000_6%,#000_94%,transparent)]">
        <ul className="flex w-max animate-marquee motion-reduce:animate-none" aria-label="Categories">
          {run.map((c, i) => tile(c, `a-${i}`, i >= base.length))}
          {run.map((c, i) => tile(c, `b-${i}`, true))}
        </ul>
      </div>
    </section>
  );
}
