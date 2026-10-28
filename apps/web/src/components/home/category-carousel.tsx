"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { categoryIcon } from "@/components/ui/category-icon";

export interface CategoryTile {
  slug: string;
  name: string;
  count: number;
  art?: string;
}

/**
 * "Shop by Category" as a row moved by hand: previous / next arrows on both sides (as on the banner), swipe on touch
 * screens, and the keyboard's Tab. Each arrow shows only when there is more to see that way; when every category fits,
 * there are no arrows and the row is centred.
 */
export function CategoryCarousel({ tiles }: { tiles: CategoryTile[] }) {
  const track = useRef<HTMLUListElement>(null);
  const [edge, setEdge] = useState({ start: true, end: true });

  const measure = useCallback(() => {
    const el = track.current;
    if (!el) return;
    setEdge({ start: el.scrollLeft <= 2, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2 });
  }, []);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    ro?.observe(el);
    el.addEventListener("scroll", measure, { passive: true });
    measure();
    return () => {
      ro?.disconnect();
      el.removeEventListener("scroll", measure);
    };
  }, [measure]);

  const go = (dir: 1 | -1) => {
    const el = track.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(el.clientWidth * 0.8, 160), behavior: "smooth" });
  };

  const arrow = "absolute top-[38%] z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-bg text-ink shadow-card transition-colors hover:border-brand-500 hover:bg-brand-500 hover:text-on-brand sm:h-11 sm:w-11";

  return (
    <div className="relative">
      <ul
        ref={track}
        aria-label="Categories"
        className={`flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-1 py-2 [scrollbar-width:none] sm:gap-6 [&::-webkit-scrollbar]:hidden ${edge.start && edge.end ? "justify-center" : ""}`}
      >
        {tiles.map((c) => {
          const Icon = categoryIcon(c.name);
          const count = `${c.count} ${c.count === 1 ? "product" : "products"}`;
          return (
            <li key={c.slug} className="w-32 shrink-0 snap-start sm:w-40 lg:w-44">
              <Link href={`/categories/${c.slug}`} aria-label={`${c.name}, ${count}`} className="group relative flex h-full flex-col items-center p-2 text-center">
                <span aria-hidden className="relative mb-3 flex aspect-square w-full max-w-36 items-center justify-center overflow-hidden rounded-full bg-surface ring-2 ring-transparent ring-offset-4 transition-[box-shadow] duration-300 group-hover:ring-brand-500">
                  {c.art ? (
                    <Image src={c.art} alt="" fill sizes="176px" className="object-cover mix-blend-multiply transition-transform duration-500 group-hover:scale-105 motion-reduce:transition-none" />
                  ) : (
                    <Icon className="h-12 w-12 text-ink/70" strokeWidth={1.2} />
                  )}
                </span>
                <span className="text-[13px] font-bold leading-tight text-ink sm:text-[15px]">{c.name}</span>
                <span className="mt-1.5 rounded-full bg-surface px-2.5 py-0.5 text-[11px] font-semibold text-ink ring-1 ring-border transition-colors group-hover:bg-brand-500 group-hover:text-on-brand">{count}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      {!edge.start ? (
        <button type="button" onClick={() => go(-1)} aria-label="Previous categories" className={`${arrow} -left-2 lg:-left-5`}>
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </button>
      ) : null}
      {!edge.end ? (
        <button type="button" onClick={() => go(1)} aria-label="Next categories" className={`${arrow} -right-2 lg:-right-5`}>
          <ChevronRight className="h-5 w-5" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
