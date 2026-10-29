"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export interface ProductTab {
  id: string;
  label: string;
  /** The tab's product row, rendered on the server. */
  content: ReactNode;
}

/**
 * One product block with a tab per range (New Arrivals, then the larger categories) instead of a separate section for
 * each, so the homepage stays short. Accessible tabs: arrow keys, Home and End move between them; only the chosen
 * panel is shown. Every panel is in the HTML, so the products are there for search engines and no-script visitors.
 */
export function ProductTabs({ tabs, label }: { tabs: ProductTab[]; label: string }) {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const last = tabs.length - 1;
    const to = e.key === "ArrowRight" ? (active === last ? 0 : active + 1) : e.key === "ArrowLeft" ? (active === 0 ? last : active - 1) : e.key === "Home" ? 0 : e.key === "End" ? last : null;
    if (to === null) return;
    e.preventDefault();
    setActive(to);
    refs.current[to]?.focus();
  };

  return (
    <>
      <div role="tablist" aria-label={label} onKeyDown={onKey} className="-mx-4 mb-7 flex justify-start gap-6 overflow-x-auto px-4 [scrollbar-width:none] sm:mb-9 sm:justify-center sm:gap-9 [&::-webkit-scrollbar]:hidden">
        {tabs.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${t.id}-tab`}
            aria-selected={i === active}
            aria-controls={t.id}
            tabIndex={i === active ? 0 : -1}
            onClick={() => setActive(i)}
            className={`relative min-h-11 shrink-0 whitespace-nowrap text-[13px] font-bold uppercase tracking-[0.08em] transition-colors after:absolute after:inset-x-0 after:bottom-1 after:h-[3px] after:origin-center after:rounded-full after:bg-brand-500 after:transition-transform after:duration-300 sm:text-sm ${
              i === active ? "text-ink after:scale-x-100" : "text-muted after:scale-x-0 hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t, i) => (
        <div key={t.id} role="tabpanel" id={t.id} aria-labelledby={`${t.id}-tab`} hidden={i !== active} tabIndex={0} className="rounded-panel focus-visible:outline-offset-4">
          {t.content}
        </div>
      ))}
    </>
  );
}
