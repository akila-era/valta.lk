"use client";

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
 * "Shop by Category" as a row moved by hand, never automatically: six tiles show at a time on laptops and wider (three
 * on tablets, two and a bit on phones), and round previous / next buttons on both sides move it one tile at a time, as on the banner.
 * Swiping works on touch screens and Tab walks through the tiles. The buttons only exist when there is more than fits;
 * at either end the matching button is disabled. When everything fits, the row is centred.
 */
export function CategoryCarousel({ tiles }: { tiles: CategoryTile[] }) {
  const track = useRef<HTMLUListElement>(null);
  const [edge, setEdge] = useState({ start: true, end: true });

  const measure = useCallback(() => {
    const el = track.current;
    if (!el) return;
    // a few pixels of slack: snapping and the side padding can leave the row a hair off its true ends
    setEdge({ start: el.scrollLeft <= 6, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 6 });
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

  // One tile per press: its width plus the gap.
  const go = (dir: 1 | -1) => {
    const el = track.current;
    if (!el) return;
    const tile = el.querySelector("li");
    const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
    el.scrollBy({ left: dir * ((tile?.getBoundingClientRect().width ?? 160) + gap), behavior: "smooth" });
  };

  const fits = edge.start && edge.end;
  const arrow =
    "absolute top-[34%] z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white text-ink shadow-card ring-1 ring-ink/10 transition-[background-color,color,opacity] hover:bg-brand-500 hover:text-on-brand disabled:cursor-default disabled:opacity-35 disabled:hover:bg-white disabled:hover:text-ink sm:h-11 sm:w-11";

  return (
    // capped width on laptops and wider, so the six tiles sit close together instead of spreading across a huge screen
    <div className="relative mx-auto lg:max-w-[72rem]">
      <ul
        ref={track}
        aria-label="Categories"
        className={`flex snap-x snap-mandatory overflow-x-auto scroll-smooth scroll-px-1 px-1 py-2 [--gap:1rem] [scrollbar-width:none] sm:[--gap:1.5rem] [&::-webkit-scrollbar]:hidden gap-[var(--gap)] ${fits ? "justify-center" : ""}`}
      >
        {tiles.map((c) => {
          const Icon = categoryIcon(c.name);
          const count = `${c.count} ${c.count === 1 ? "product" : "products"}`;
          return (
            // 2 and a bit tiles on phones (so it is clear the row moves), 3 on tablets, exactly 6 from laptops.
            <li key={c.slug} className="w-[calc((100%-var(--gap)*2.4)/3.4)] shrink-0 snap-start sm:w-[calc((100%-var(--gap)*2)/3)] lg:w-[calc((100%-var(--gap)*5)/6)]">
              <Link href={`/categories/${c.slug}`} aria-label={`${c.name}, ${count}`} className="group relative flex h-full flex-col items-center p-2 text-center">
                {/* As on ugreen.lk: a thin black line icon for the category (no photo, circle or frame), the name under it. */}
                <span aria-hidden className="mb-3 flex h-20 items-center justify-center sm:h-24">
                  <Icon className="h-14 w-14 text-ink transition-[color,transform] duration-300 group-hover:-translate-y-1 group-hover:text-brand-500 motion-reduce:transition-none sm:h-16 sm:w-16" strokeWidth={1} />
                </span>
                <span className="text-[13px] font-semibold leading-tight text-ink transition-colors group-hover:text-brand-600 sm:text-sm">{c.name}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      {!fits ? (
        <>
          <button type="button" onClick={() => go(-1)} disabled={edge.start} aria-label="Previous categories" className={`${arrow} -left-2 lg:-left-14`}>
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
          <button type="button" onClick={() => go(1)} disabled={edge.end} aria-label="Next categories" className={`${arrow} -right-2 lg:-right-14`}>
            <ChevronRight className="h-5 w-5" aria-hidden />
          </button>
        </>
      ) : null}
    </div>
  );
}
