"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { DotSpinner } from "@/components/ui/dot-spinner";

/** How long the spinner shows before the browser leaves the page (the new page is usually ready by then). */
const SHOW_BEFORE_MS = 240;
/** Safety net: never leave the veil up longer than this if a navigation never arrives. */
const GIVE_UP_MS = 12_000;

/**
 * A light veil with just the dot spinner (no box, no text) over the page area while the visitor is moving to another page. It listens for
 * clicks on internal links, shows the spinner at once, lets it spin for a moment, then does the navigation itself and
 * keeps the veil until the new page has arrived (then the page transition plays). The header stays visible.
 *
 * Skipped for: modified clicks (new tab), other targets, downloads, other sites, the admin and API, links to the page
 * you are already on (hash / filter links), `data-no-loader` links, and visitors who prefer reduced motion.
 */
export function NavigationLoader() {
  const router = useRouter();
  const pathname = usePathname();
  // The page the visitor left from. The veil is up while that is still the current page.
  const [from, setFrom] = useState<string | null>(null);
  // Where the veil starts: the bottom edge of the header at the moment of the click, so the whole header stays clear.
  const [top, setTop] = useState(0);
  // When the page changes (the new page has arrived, or the visitor used Back) the veil is forgotten, so coming back to
  // the page it started from later cannot bring it up again. (State adjusted during render, as React recommends.)
  const [seen, setSeen] = useState(pathname);
  if (seen !== pathname) {
    setSeen(pathname);
    setFrom(null);
  }
  const on = from !== null && from === pathname;
  const pending = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  // The new page has arrived: forget the pending click and its timers (the page transition plays as the veil fades).
  useEffect(() => {
    pending.current = false;
    clearTimers();
  }, [pathname]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || pending.current) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.hasAttribute("download") || a.hasAttribute("data-no-loader")) return;
      if (a.target && a.target !== "_self") return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname === location.pathname) return;
      if (url.pathname.startsWith("/admin") || url.pathname.startsWith("/api")) return;
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

      e.preventDefault(); // Next's Link sees this and leaves the navigation to us
      pending.current = true;
      setTop(Math.max(0, Math.round(document.querySelector("header")?.getBoundingClientRect().bottom ?? 0)));
      setFrom(location.pathname);
      const href = url.pathname + url.search + url.hash;
      timers.current.push(setTimeout(() => router.push(href), SHOW_BEFORE_MS));
      timers.current.push(
        setTimeout(() => {
          pending.current = false;
          setFrom(null);
        }, GIVE_UP_MS),
      );
    };
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      clearTimers();
    };
  }, [router]);

  return (
    <div
      aria-hidden={!on}
      style={{ top }}
      className={`fixed inset-x-0 bottom-0 z-[45] flex items-center justify-center bg-white/70 backdrop-blur-[3px] transition-opacity duration-150 ${on ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"}`}
    >
      {on ? <span className="sr-only" role="status">Loading page</span> : null}
      <DotSpinner size={68} className={`transition-transform duration-300 ${on ? "scale-100" : "scale-75"}`} />
    </div>
  );
}
