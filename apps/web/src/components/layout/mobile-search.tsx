"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { SearchBox } from "./search-box";

/**
 * Phone-only search button in the sticky header. The page-top search bar scrolls away on phones (so the sticky header
 * stays one slim row); this opens the same search under the header from anywhere on the page. The close button,
 * Escape (once the suggestions are closed) or navigating closes it. While the page-top search bar is still on screen
 * the button is hidden, so phones never show two search controls at once.
 */
export function MobileSearch({ popular = [] }: { popular?: { label: string; href: string }[] }) {
  const pathname = usePathname();
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const open = openedAt === pathname;
  const panel = useRef<HTMLDivElement>(null);
  // Is the page-top search bar (under the header) still visible? Then this button is not needed.
  const [barVisible, setBarVisible] = useState(true);

  useEffect(() => {
    let frame = 0;
    const check = () => {
      frame = 0;
      const bar = document.getElementById("mobile-searchbar");
      const header = document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
      const r = bar?.getBoundingClientRect();
      setBarVisible(Boolean(r && r.height > 0 && r.bottom > header + 8));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(check);
    };
    frame = requestAnimationFrame(check);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [pathname]);

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
    <div className={`md:hidden ${barVisible && !open ? "hidden" : ""}`}>
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
        <div ref={panel} className="absolute inset-x-0 top-full z-50 border-b border-brand-100 bg-bg px-3 py-2.5">
          <SearchBox size="lg" label="Site search (header)" popular={popular} />
        </div>
      )}
    </div>
  );
}
