"use client";

import { useEffect, useState } from "react";
import { Grid2x2, Grid3x3, LayoutGrid } from "lucide-react";

const OPTIONS = [
  { cols: "2", label: "2 columns", icon: Grid2x2 },
  { cols: "3", label: "3 columns", icon: LayoutGrid },
  { cols: "4", label: "4 columns", icon: Grid3x3 },
] as const;
const KEY = "volta.grid-cols";

/** Lets shoppers pick how many products sit side by side on a wide screen. It only sets data-cols on #product-grid, and remembers the choice. */
export function ViewSwitch() {
  const [cols, setCols] = useState<string>("4");

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem(KEY);
    } catch {
      /* storage can be blocked: the default view stays */
    }
    if (saved && OPTIONS.some((o) => o.cols === saved)) {
      const t = window.setTimeout(() => setCols(saved as string), 0);
      return () => window.clearTimeout(t);
    }
  }, []);

  useEffect(() => {
    const grid = document.getElementById("product-grid");
    if (grid) grid.dataset.cols = cols;
  }, [cols]);

  function choose(next: string) {
    setCols(next);
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      /* ignore */
    }
  }

  return (
    <div role="group" aria-label="Products per row" className="hidden items-center gap-0.5 lg:flex">
      {OPTIONS.map(({ cols: c, label, icon: Icon }) => (
        <button
          key={c}
          type="button"
          onClick={() => choose(c)}
          aria-label={label}
          aria-pressed={cols === c}
          className={`flex h-10 w-10 items-center justify-center rounded-md transition-colors ${cols === c ? "bg-ink text-white" : "text-muted hover:bg-surface hover:text-ink"}`}
        >
          <Icon className="h-[18px] w-[18px]" aria-hidden />
        </button>
      ))}
    </div>
  );
}
