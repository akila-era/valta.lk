"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

/** Centered text tabs. Every panel is rendered by the server; this only decides which one is visible. */
export function TabsPanel({ labels, panels, label }: { labels: string[]; panels: ReactNode[]; label: string }) {
  const [active, setActive] = useState(0);
  const base = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKey(e: KeyboardEvent, i: number) {
    const next = e.key === "ArrowRight" ? (i + 1) % labels.length : e.key === "ArrowLeft" ? (i - 1 + labels.length) % labels.length : -1;
    if (next < 0) return;
    e.preventDefault();
    setActive(next);
    refs.current[next]?.focus();
  }

  return (
    <div>
      {labels.length > 1 && (
        <div role="tablist" aria-label={label} className="scrollbar-none -mx-4 mb-6 flex justify-start gap-6 overflow-x-auto px-4 sm:mx-0 sm:mb-8 sm:justify-center sm:gap-8 sm:px-0">
          {labels.map((l, i) => (
            <button
              key={l}
              ref={(el) => {
                refs.current[i] = el;
              }}
              role="tab"
              type="button"
              id={`${base}-t${i}`}
              aria-selected={i === active}
              aria-controls={`${base}-p${i}`}
              tabIndex={i === active ? 0 : -1}
              onClick={() => setActive(i)}
              onKeyDown={(e) => onKey(e, i)}
              className={`relative min-h-11 shrink-0 whitespace-nowrap text-sm font-semibold uppercase tracking-[0.06em] transition-colors after:absolute after:inset-x-0 after:bottom-1 after:h-0.5 after:rounded-full ${
                i === active ? "text-ink after:bg-brand-500" : "text-muted after:bg-transparent hover:text-ink"
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      )}
      {panels.map((p, i) => (
        <div key={i} role="tabpanel" id={`${base}-p${i}`} aria-labelledby={`${base}-t${i}`} hidden={i !== active}>
          {p}
        </div>
      ))}
    </div>
  );
}
