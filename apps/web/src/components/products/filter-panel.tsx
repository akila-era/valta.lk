"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { useDialogLifecycle } from "@/components/ui/overlay";

/** Filters stay in the sidebar on large screens and open as a drawer on a phone. */
export function FilterPanel({ children, active }: { children: React.ReactNode; active: boolean }) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const form = rootRef.current?.querySelector("form");
    if (!form) return;
    function onSubmit(event: Event) {
      if (!form) return;
      event.preventDefault();
      const params = new URLSearchParams();
      for (const [key, value] of new FormData(form).entries()) {
        const text = String(value).trim();
        if (!text || (key === "sort" && text === "newest")) continue;
        params.append(key, text);
      }
      const query = params.toString();
      window.location.assign(query ? `${form.action}?${query}` : form.action);
    }
    form.addEventListener("submit", onSubmit);
    return () => form.removeEventListener("submit", onSubmit);
  }, []);

  useDialogLifecycle(open, close, panelRef);

  // The drawer only exists below the lg breakpoint; widening the window turns it back into the sidebar.
  useEffect(() => {
    if (!open) return;
    const wide = window.matchMedia("(min-width: 64rem)");
    const onChange = () => wide.matches && setOpen(false);
    wide.addEventListener("change", onChange);
    return () => wide.removeEventListener("change", onChange);
  }, [open]);

  return (
    // Desktop: the sidebar stays in view under the sticky header while the product grid scrolls; long filters scroll inside it.
    <div ref={rootRef} className="lg:sticky lg:top-36 lg:self-start">
      <button
        type="button"
        className="btn-secondary mb-4 w-full lg:hidden"
        aria-expanded={open}
        aria-controls="catalogue-filters"
        onClick={() => setOpen(true)}
      >
        <SlidersHorizontal className="h-4 w-4" aria-hidden />
        Filters
        {active ? <span className="h-2 w-2 rounded-full bg-brand-500" aria-hidden /> : null}
        {active ? <span className="sr-only">(active)</span> : null}
      </button>
      {open ? (
        <button type="button" tabIndex={-1} className="fixed inset-0 z-[70] animate-[fade-in_0.2s_ease-out] bg-black/60 lg:hidden" aria-label="Close filters" onClick={close} />
      ) : null}
      <aside
        ref={panelRef}
        id="catalogue-filters"
        aria-label="Filters"
        role={open ? "dialog" : undefined}
        aria-modal={open ? true : undefined}
        className={`${open ? "fixed inset-y-0 right-0 z-[80] block w-[min(100%,20rem)] animate-[slide-in-right_0.25s_cubic-bezier(0.2,0.7,0.2,1)] overflow-y-auto overscroll-contain bg-bg p-5 shadow-overlay" : "hidden"} lg:static lg:animate-none lg:z-auto lg:block lg:max-h-[calc(100svh-10rem)] lg:w-auto lg:overflow-y-auto lg:overscroll-contain lg:rounded-2xl lg:border lg:border-border lg:bg-surface lg:p-5 lg:shadow-none`}
      >
        <div className="mb-4 flex items-center justify-between lg:hidden">
          <h2 className="text-lg font-bold text-ink">Filters</h2>
          <button type="button" className="btn-text px-3" onClick={close}>
            <X className="h-4 w-4" aria-hidden /> Close
          </button>
        </div>
        {children}
      </aside>
    </div>
  );
}
