"use client";

import { useRouter } from "next/navigation";

/** Sort dropdown: each option carries its own URL, so it also works as a plain list of choices. */
export function SortSelect({ options, value }: { options: { value: string; label: string; href: string }[]; value: string }) {
  const router = useRouter();
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="sort-select" className="text-[13px] text-muted">Sort by</label>
      <select id="sort-select" value={value} onChange={(e) => router.push(options.find((o) => o.value === e.target.value)?.href ?? options[0].href)} className="select min-h-10 w-auto pr-8 text-sm">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}
