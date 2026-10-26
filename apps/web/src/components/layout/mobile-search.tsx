"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { SearchBox } from "./search-box";

/**
 * Phone-only search button in the sticky header. The page-top search bar scrolls away on phones (so the sticky header
 * stays one slim row); this opens the same search under the header from anywhere on the page. The close button,
 * Escape (once the suggestions are closed) or navigating closes it.
 */
export function MobileSearch() {
  const pathname = usePathname();
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const open = openedAt === pathname;
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector("input")?.focus();
    // Escape first closes the suggestion list (the search box handles that); a second Escape closes the panel.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || panel.current?.querySelector("[role=listbox]")) return;
      setOpenedAt(null);
    };
    // Capture phase: runs before the search box's own Escape handler, while its suggestion list is still open.
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-label={open ? "Close search" : "Open search"}
        onClick={() => setOpenedAt(open ? null : pathname)}
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-control text-ink transition-colors hover:text-brand-600"
      >
        {open ? <X className="h-6 w-6" aria-hidden /> : <Search className="h-6 w-6" strokeWidth={1.75} aria-hidden />}
      </button>
      {open && (
        <div ref={panel} className="absolute inset-x-0 top-full z-50 border-b border-brand-100 bg-bg px-3 py-2.5 shadow-[0_12px_24px_-14px_rgb(255_92_0/0.45)]">
          <SearchBox size="lg" label="Site search (header)" />
        </div>
      )}
    </div>
  );
}
