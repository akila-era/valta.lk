"use client";

import { useRouter } from "next/navigation";
import { ArrowUpDown, ChevronDown } from "lucide-react";

/** Sort dropdown: each option carries its own URL, so it also works as a plain list of choices. A rounded pill on phones. */
export function SortSelect({ options, value }: { options: { value: string; label: string; href: string }[]; value: string }) {
  const router = useRouter();
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
      <label htmlFor="sort-select" className="sr-only text-[13px] text-muted sm:not-sr-only">Sort by</label>
      <div className="relative min-w-0 flex-1 sm:flex-none">
        <ArrowUpDown className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/70" strokeWidth={1.75} aria-hidden />
        <select
          id="sort-select"
          value={value}
          onChange={(e) => router.push(options.find((o) => o.value === e.target.value)?.href ?? options[0].href)}
          className="h-11 w-full min-w-0 cursor-pointer appearance-none rounded-full border border-border bg-white pl-10 pr-10 text-[15px] font-medium text-ink transition-colors hover:border-ink focus-visible:border-brand-500 sm:h-10 sm:w-auto sm:text-sm"
        >
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
      </div>
    </div>
  );
}
