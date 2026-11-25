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
  const arrow = "absolute top-[3rem] z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-white shadow-sm transition-opacity hover:border-ink md:flex";

  return (
    <nav aria-label={label} className="relative">
      <ul ref={scroller} onScroll={measure} className="scrollbar-none -mx-4 flex gap-1 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 md:px-6">
        {tiles.map((t, i) => {
          const Icon = t.all ? LayoutGrid : iconFor(t.label);
          return (
            <li key={t.key} className="shrink-0 animate-lift" style={{ "--d": `${Math.min(i, 8) * 45}ms` } as React.CSSProperties}>
              <Link href={t.href} aria-current={t.active ? "page" : undefined} aria-label={`${t.label}, ${t.count} ${t.count === 1 ? "product" : "products"}`} className="group flex w-[6.25rem] flex-col items-center gap-2.5 py-2 text-center sm:w-32">
                <span
                  className={`relative flex h-[4.75rem] w-[4.75rem] items-center justify-center rounded-full border transition-all duration-300 group-hover:-translate-y-1 motion-reduce:transition-none motion-reduce:group-hover:translate-y-0 sm:h-24 sm:w-24 ${
                    t.active
                      ? "border-brand-500 bg-gradient-to-br from-brand-400 to-brand-500 shadow-[0_14px_28px_-14px_rgba(6,121,61,0.9)]"
                      : "border-border bg-gradient-to-br from-white to-surface group-hover:border-brand-500 group-hover:shadow-[0_14px_28px_-16px_rgba(17,17,17,0.45)]"
                  }`}
                >
                  <span aria-hidden className={`absolute inset-1.5 rounded-full border ${t.active ? "border-white/40" : "border-border/60 group-hover:border-brand-500/30"}`} />
                  <Icon className={`relative h-8 w-8 transition-transform duration-300 group-hover:scale-110 sm:h-9 sm:w-9 ${t.active ? "text-ink" : "text-ink/75 group-hover:text-brand-600"}`} strokeWidth={1.5} aria-hidden />
                  <span aria-hidden className={`absolute -right-0.5 -top-0.5 flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums ring-2 ring-white ${t.active ? "bg-ink text-white" : "bg-white text-ink/70 shadow-sm group-hover:bg-ink group-hover:text-white"}`}>{t.count}</span>
                </span>
                <span className={`line-clamp-2 text-[13px] leading-tight sm:text-sm ${t.active ? "font-semibold text-ink" : "font-medium text-ink/80 group-hover:text-ink"}`}>{t.label}</span>
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
