"use client";

import { useRouter } from "next/navigation";

/**
 * The "Sort by" dropdown of the catalogue toolbar. Each option carries the full address it leads to (built on the
 * server, so filters and layout are kept); choosing one goes there.
 */
export function SortSelect({ options, current }: { options: { label: string; href: string; value: string }[]; current: string }) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2 text-sm text-muted">
      <span className="whitespace-nowrap">Sort by</span>
      <select
        aria-label="Sort products"
        value={current}
        onChange={(e) => {
          const to = options.find((o) => o.value === e.target.value);
          if (to) router.push(to.href, { scroll: false });
        }}
        className="h-10 min-w-44 rounded-control border border-border bg-bg pl-3 pr-8 text-sm font-medium text-ink focus:border-brand-500"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}
