"use client";

import { useEffect, useRef, useState } from "react";
import { SlidersHorizontal } from "lucide-react";

/** Filters stay in the sidebar on large screens and open as a drawer on a phone. */
export function FilterPanel({ children, active }: { children: React.ReactNode; active: boolean }) {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div ref={rootRef}>
      <button
        type="button"
        className="btn-secondary mb-4 w-full lg:hidden"
        aria-expanded={open}
        aria-controls="catalogue-filters"
        onClick={() => setOpen(true)}
      >
        <SlidersHorizontal className="h-4 w-4" aria-hidden />
        Filters{active ? " · On" : ""}
      </button>
      {open ? (
        <button type="button" className="fixed inset-0 z-[70] bg-ink/40 lg:hidden" aria-label="Close filters" onClick={() => setOpen(false)} />
      ) : null}
      <aside
        id="catalogue-filters"
        aria-label="Filters"
        role={open ? "dialog" : undefined}
        aria-modal={open ? true : undefined}
        className={`${open ? "fixed inset-y-0 right-0 z-[80] block w-[min(100%,20rem)] overflow-y-auto bg-bg p-5 shadow-overlay" : "hidden"} lg:static lg:z-auto lg:block lg:w-auto lg:overflow-visible lg:rounded-2xl lg:border lg:border-border lg:bg-surface lg:p-5 lg:shadow-none`}
      >
        <div className="mb-4 flex items-center justify-between lg:hidden">
          <h2 className="text-lg font-bold text-ink">Filters</h2>
          <button ref={closeRef} type="button" className="btn-text" onClick={() => setOpen(false)}>
            Close
          </button>
        </div>
        {children}
      </aside>
    </div>
  );
}
