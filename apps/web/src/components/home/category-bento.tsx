import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { categoryIcon } from "@/components/ui/category-icon";
import type { HomeData } from "@/lib/home-data";
import { categoryVisual } from "./category-art";
import { Reveal } from "./reveal";

const TAGS: [RegExp, string][] = [
  [/charg/i, "Power up fast"],
  [/cable/i, "Strong durability"],
  [/audio|headphone|earbud/i, "Sound for every moment"],
  [/phone|mobile/i, "Latest smartphones"],
  [/watch|wear/i, "Track your day"],
  [/tablet/i, "Work and play"],
  [/laptop/i, "Built for work"],
  [/computer/i, "Desk essentials"],
  [/accessor/i, "Everyday essentials"],
];

const SPANS = ["md:col-span-5", "md:col-span-7", "md:col-span-7", "md:col-span-5"];

/** "Shop by category": four cards in a 5/7 then 7/5 bento. They rise in one after another and the picture drifts on hover. */
export function CategoryBento({ categories }: { categories: HomeData["categories"] }) {
  // Biggest categories first, never two cards with the same picture.
  const seen = new Set<string>();
  const list = [...categories]
    .sort((a, b) => b.count - a.count)
    .filter((c) => {
      const key = categoryVisual(c.name) ?? c.image ?? c.slug;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 4);
  if (list.length < 4) return null;
  return (
    <section aria-labelledby="bento-title" className="container-page mt-10 sm:mt-14">
      <h2 id="bento-title" className="mb-6 text-center text-2xl font-semibold tracking-tight text-ink sm:mb-8 sm:text-[2rem]">VOLTA Products Sri Lanka</h2>
      <ul className="grid gap-3 md:grid-cols-12 md:gap-4">
        {list.map((c, i) => {
          const art = categoryVisual(c.name) ?? c.image;
          const Icon = categoryIcon(c.name);
          const tag = TAGS.find(([re]) => re.test(c.name))?.[1] ?? "Shop now";
          return (
            <Reveal as="li" key={c.slug} delay={i * 90} className={SPANS[i]}>
              <Link
                href={`/categories/${c.slug}`}
                className="group relative isolate flex h-60 overflow-hidden rounded-2xl bg-surface p-6 transition-shadow duration-300 hover:shadow-[0_18px_40px_-24px_rgba(17,17,17,0.45)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 sm:h-72 sm:p-8"
              >
                <span className="relative z-10 flex max-w-[55%] flex-col items-start">
                  <span className="text-[13px] font-semibold text-brand-600">{tag}</span>
                  <span className="mt-1 text-2xl font-semibold leading-tight tracking-tight text-ink sm:text-[1.75rem]">{c.name}</span>
                  <span className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-white transition-colors duration-300 group-hover:bg-brand-500 group-hover:text-on-brand">
                    Shop now <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1 motion-reduce:transition-none" aria-hidden />
                  </span>
                </span>
                <span aria-hidden className="absolute inset-y-0 right-0 -z-10 w-[62%]">
                  {art ? (
                    <Image
                      src={art}
                      alt=""
                      fill
                      loading="lazy"
                      sizes="(min-width:768px) 35vw, 60vw"
                      className="object-cover transition-transform duration-700 ease-out [mask-image:linear-gradient(to_right,transparent,#000_45%)] group-hover:scale-110 group-hover:-translate-x-1 motion-reduce:transition-none"
                    />
                  ) : (
                    <span className="flex h-full items-center justify-center">
                      <Icon className="h-24 w-24 text-border transition-transform duration-500 group-hover:scale-110" strokeWidth={1} />
                    </span>
                  )}
                </span>
              </Link>
            </Reveal>
          );
        })}
      </ul>
    </section>
  );
}
