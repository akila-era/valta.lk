"use client";

import { ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";

/**
 * The "Sort by" dropdown of the catalogue toolbar. Each option carries the full address it leads to (built on the
 * server, so filters and layout are kept); choosing one goes there.
 */
export function SortSelect({ options, current }: { options: { label: string; href: string; value: string }[]; current: string }) {
  const router = useRouter();
  return (
    // As on ugreen.lk: no label in front, just "Default sorting" on a thin underline with a small chevron.
    <label className="relative flex items-center text-sm">
      <select
        aria-label="Sort products"
        value={current}
        onChange={(e) => {
          const to = options.find((o) => o.value === e.target.value);
          if (to) router.push(to.href, { scroll: false });
        }}
        className="h-10 min-w-48 appearance-none border-0 border-b border-border bg-transparent pl-0 pr-7 text-[15px] font-medium text-ink focus:border-brand-500"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-0 h-4 w-4 text-muted" />
    </label>
  );
}
