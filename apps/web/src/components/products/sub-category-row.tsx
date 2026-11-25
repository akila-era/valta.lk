"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { BatteryCharging, Cable, ChevronLeft, ChevronRight, Headphones, Keyboard, LayoutGrid, Mouse, PlugZap, ShieldCheck, Smartphone, Speaker, Usb, Watch } from "lucide-react";
import { categoryIcon } from "@/components/ui/category-icon";

export interface SubTile {
  key: string;
  label: string;
  count: number;
  href: string;
  active: boolean;
  /** The "All" tile uses a grid icon instead of one picked from the name. */
  all?: boolean;
}

/** A more specific icon for common accessory names; anything else falls back to the department icon. */
function iconFor(label: string) {
  const n = label.toLowerCase();
  if (/cable|cord/.test(n)) return Cable;
  if (/charg|adapt/.test(n)) return PlugZap;
  if (/power ?bank|batter/.test(n)) return BatteryCharging;
  if (/screen|protect|glass/.test(n)) return ShieldCheck;
  if (/case|cover/.test(n)) return Smartphone;
  if (/hub|dock|usb/.test(n)) return Usb;
  if (/mouse/.test(n)) return Mouse;
  if (/keyboard/.test(n)) return Keyboard;
  if (/speaker/.test(n)) return Speaker;
  if (/earbud|headphone|audio/.test(n)) return Headphones;
  if (/watch|band/.test(n)) return Watch;
  return categoryIcon(label);
}

/** A row of round sub-category tiles you can scroll sideways (swipe, trackpad or the arrows). The active one gets an orange ring. */
export function SubCategoryRow({ tiles, label }: { tiles: SubTile[]; label: string }) {
  const scroller = useRef<HTMLUListElement>(null);
  const [edge, setEdge] = useState({ start: true, end: true });
  // A handful of tiles stay together in the middle; stretching them across a wide screen leaves big empty gaps.
  const few = tiles.length <= 5;

  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    setEdge({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
  }, []);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const frame = requestAnimationFrame(measure);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    // Bring the active tile into view when the page opens on a sub-category.
    const active = el.querySelector<HTMLElement>("[aria-current=page]");
    if (active) el.scrollTo({ left: Math.max(0, active.offsetLeft - el.clientWidth / 2 + active.clientWidth / 2), behavior: "auto" });
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, [measure]);

  const move = (dir: -1 | 1) => scroller.current?.scrollBy({ left: dir * (scroller.current.clientWidth * 0.8), behavior: "smooth" });
  const arrow = "absolute top-[2.75rem] z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-white shadow-sm transition-opacity hover:border-ink md:flex";

  return (
    <nav aria-label={label} className="relative">
      <ul ref={scroller} onScroll={measure} className={`scrollbar-none -mx-4 flex overflow-x-auto px-4 sm:mx-0 sm:px-0 md:px-6 ${few ? "sm:justify-center sm:gap-6 lg:gap-10" : ""}`}>
        {tiles.map((t, i) => {
          const Icon = t.all ? LayoutGrid : iconFor(t.label);
          return (
            <li key={t.key} className={`w-[6.75rem] shrink-0 animate-lift ${few ? "sm:w-40" : "sm:min-w-[7.5rem] sm:flex-1"}`} style={{ "--d": `${Math.min(i, 8) * 45}ms` } as React.CSSProperties}>
              <Link href={t.href} aria-current={t.active ? "page" : undefined} aria-label={`${t.label}, ${t.count} ${t.count === 1 ? "product" : "products"}`} className="group flex flex-col items-center gap-3 px-1 py-3 text-center">
                <Icon className={`h-12 w-12 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:scale-105 motion-reduce:transition-none sm:h-14 sm:w-14 ${t.active ? "text-brand-600" : "text-ink group-hover:text-brand-600"}`} strokeWidth={1.25} aria-hidden />
                <span className={`line-clamp-2 text-[13px] font-semibold leading-tight sm:text-sm ${t.active ? "text-brand-600" : "text-ink"}`}>{t.label}</span>
                <span aria-hidden className={`h-0.5 rounded-full bg-brand-500 transition-all duration-300 ${t.active ? "w-8" : "w-0 group-hover:w-5"}`} />
              </Link>
            </li>
          );
        })}
      </ul>
      <button type="button" onClick={() => move(-1)} aria-label={`Scroll ${label} left`} disabled={edge.start} className={`${arrow} left-0 disabled:pointer-events-none disabled:opacity-0`}>
        <ChevronLeft className="h-5 w-5" aria-hidden />
      </button>
      <button type="button" onClick={() => move(1)} aria-label={`Scroll ${label} right`} disabled={edge.end} className={`${arrow} right-0 disabled:pointer-events-none disabled:opacity-0`}>
        <ChevronRight className="h-5 w-5" aria-hidden />
      </button>
    </nav>
  );
}
