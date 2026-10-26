"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { useDialogLifecycle } from "@/components/ui/overlay";

/**
 * Filter panel: standardized compact sidebar, sticky on desktop (stays visible under header as products scroll),
 * accessible modal drawer on mobile with slide-in animation.
 * Target desktop width: ~230-240px with 14-16px internal padding.
 */
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
    <div ref={rootRef} className="lg:sticky lg:top-28 xl:top-32 lg:self-start lg:w-[236px] xl:w-[240px]">
      {/* Mobile filter trigger button */}
      <button
        type="button"
        className="mb-4 inline-flex w-full items-center justify-center gap-2 rounded-full border border-border/80 bg-white px-4 py-2 text-xs font-bold uppercase tracking-wider text-ink shadow-soft transition-colors hover:border-brand-500 hover:text-brand-600 lg:hidden"
        aria-expanded={open}
        aria-controls="catalogue-filters"
        onClick={() => setOpen(true)}
      >
        <SlidersHorizontal className="h-3.5 w-3.5 text-brand-600" aria-hidden />
        Filters
        {active ? (
          <span className="flex h-2 w-2 rounded-full bg-brand-500" aria-hidden />
        ) : null}
      </button>

      {/* Mobile backdrop */}
      {open ? (
        <button
          type="button"
          tabIndex={-1}
          className="fixed inset-0 z-[70] animate-[fade-in_0.2s_ease-out] bg-black/50 backdrop-blur-xs lg:hidden"
          aria-label="Close filters"
          onClick={close}
        />
      ) : null}

      {/* Filter Sidebar container */}
      <aside
        ref={panelRef}
        id="catalogue-filters"
        aria-label="Filters"
        role={open ? "dialog" : undefined}
        aria-modal={open ? true : undefined}
        className={`${
          open
            ? "fixed inset-y-0 right-0 z-[80] block w-[min(100%,20rem)] animate-[slide-in-right_0.25s_cubic-bezier(0.2,0.7,0.2,1)] overflow-y-auto overscroll-contain rounded-l-panel border-l-[3px] border-brand-500 bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl [scrollbar-width:thin]"
            : "hidden"
        } lg:static lg:z-auto lg:block lg:max-h-[calc(100vh-8.5rem)] xl:max-h-[calc(100vh-9.5rem)] lg:w-full lg:overflow-y-auto lg:overscroll-contain lg:rounded-2xl lg:border lg:border-border/80 lg:bg-white lg:p-3.5 xl:p-4 lg:shadow-soft [scrollbar-width:thin]`}
      >
        <div className="mb-4 flex items-center justify-between border-b border-border/70 pb-3 lg:hidden">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-brand-600" />
            <h2 className="text-sm font-bold text-ink">Filters</h2>
          </div>
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-brand-700 hover:bg-brand-500 hover:text-on-brand"
            onClick={close}
            aria-label="Close filters"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        {children}
      </aside>
    </div>
  );
}
