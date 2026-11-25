import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ProductCard } from "@/components/products/product-card";
import type { ErpProduct } from "@/lib/erp/types";
import { SectionIntro } from "./home-sections";

/**
 * One product row: a swipeable strip on phones, a 4 or 5 column grid from tablet up. Hidden when there are fewer than
 * `min` products, so a shelf is never a lonely card.
 */
export function ProductRow({ id, title, href, products, min = 3, bare = false, timer }: { id: string; title: string; href: string; products: ErpProduct[]; min?: number; bare?: boolean; timer?: React.ReactNode }) {
  if (products.length < min) return null;
  const shown = products.slice(0, 8);
  return (
    <section id={id === "new-arrivals" ? "products" : undefined} aria-labelledby={id} className={`${bare ? "" : "container-page"} mt-12 scroll-mt-40 sm:mt-20`}>
      <SectionIntro id={id} title={title} action={{ href, label: "View all" }}>{timer}</SectionIntro>
      <ul className={`-mx-4 flex scroll-px-4 snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 scrollbar-none md:mx-0 md:grid md:gap-4 md:overflow-visible md:px-0 md:pb-0 ${shown.length >= 5 ? "md:grid-cols-4 xl:grid-cols-5" : "md:grid-cols-4"}`}>
        {shown.map((p, i) => (
          <li
            key={p.id}
            className={`w-[44%] shrink-0 snap-start min-[430px]:w-[38%] sm:w-[30%] md:w-auto ${i >= 5 ? "md:hidden" : i === 4 ? "md:max-xl:hidden" : ""}`}
          >
            <ProductCard product={p} />
          </li>
        ))}
        {shown.length < 4 && (
          <li className="hidden md:block">
            <Link href={href} className="group flex aspect-square h-auto flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-surface p-6 text-center transition-colors hover:border-ink">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-ink text-white transition-colors group-hover:bg-brand-500 group-hover:text-on-brand">
                <ArrowRight className="h-5 w-5" aria-hidden />
              </span>
              <span className="text-[15px] font-semibold text-ink">View all {title}</span>
            </Link>
          </li>
        )}
      </ul>
    </section>
  );
}
