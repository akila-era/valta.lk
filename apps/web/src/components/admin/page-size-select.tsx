"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** "Per page" picker that applies at once (keeps the current filters, goes back to page 1). */
export function PageSizeSelect({ sizes, value, defaultSize = sizes[0] }: { sizes: readonly number[]; value: number; defaultSize?: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <div className="flex items-center gap-2 text-sm">
      <label htmlFor="p-size" className="text-muted">Per page</label>
      <select
        id="p-size"
        value={value}
        className="input min-h-9 w-auto border-brand-500/40 bg-brand-50 py-0 font-semibold text-brand-700 hover:border-brand-500"
        onChange={(e) => {
          const next = new URLSearchParams(params.toString());
          next.delete("page");
          if (e.target.value === String(defaultSize)) next.delete("size");
          else next.set("size", e.target.value);
          const qs = next.toString();
          router.push(qs ? `${pathname}?${qs}` : pathname);
        }}
      >
        {sizes.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
    </div>
  );
}
