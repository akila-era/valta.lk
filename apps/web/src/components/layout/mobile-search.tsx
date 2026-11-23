"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search } from "lucide-react";
import { useDialogLifecycle } from "@/components/ui/overlay";
import { SearchBox } from "./search-box";

/**
 * Phone search: a header icon that opens a full-screen sheet with the real search box (live product suggestions)
 * and shortcuts built from the catalogue's own brands and categories. Desktop keeps its inline search bar.
 */
export function MobileSearch({ quick = [] }: { quick?: { label: string; href: string }[] }) {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  // The search input autofocuses before the shared dialog code records "what was focused", so return focus to the trigger ourselves.
  const close = useCallback(() => {
    setOpen(false);
    trigger.current?.focus();
  }, []);
  useDialogLifecycle(open, close, panel);
  return (
    <div className="md:hidden">
      <button ref={trigger} type="button" className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-surface" aria-label="Search products" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <Search className="h-5 w-5" strokeWidth={1.75} aria-hidden />
      </button>
      {open && createPortal(
        <div ref={panel} role="dialog" aria-modal="true" aria-label="Search" className="fixed inset-0 z-[80] flex animate-[fade-in_0.15s_ease-out] flex-col bg-bg pt-[env(safe-area-inset-top)]">
          <div className="flex items-start gap-2 border-b border-border px-4 py-3">
            <div className="min-w-0 flex-1">
              <SearchBox autoFocus size="lg" />
            </div>
            <button type="button" onClick={close} className="flex h-12 shrink-0 items-center px-2 text-sm font-semibold text-ink">Cancel</button>
          </div>
          {quick.length > 0 && (
            <div className="overflow-y-auto px-4 py-5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Popular</p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {quick.map((q) => (
                  <li key={q.href}>
                    <Link href={q.href} onClick={close} className="inline-flex min-h-11 items-center rounded-full bg-surface px-4 text-sm font-semibold hover:bg-border">{q.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>,
        // Portal: the sticky header's blur effect would otherwise make this "fixed" sheet only as big as the header.
        document.body,
      )}
    </div>
  );
}
