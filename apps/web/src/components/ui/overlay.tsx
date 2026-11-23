"use client";

import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";

const FOCUSABLE = "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])";

/** Focus the first control, trap Tab inside `root`, close on Escape and lock page scroll while open; restore focus on close. */
export function useDialogLifecycle(open: boolean, onClose: () => void, root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const node = root.current;
    node?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key !== "Tab" || !node) return;
      const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.hasAttribute("disabled"));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [open, onClose, root]);
}

export function Dialog({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  useDialogLifecycle(open, onClose, panel);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center p-4 sm:items-center">
      <button type="button" className="absolute inset-0 bg-ink/40" aria-label="Close dialog" onClick={onClose} />
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} className="card relative z-10 w-full max-w-lg bg-bg p-6 shadow-overlay">
        <h2 id={titleId} className="text-lg font-bold text-ink">{title}</h2>
        <div className="mt-3 type-body">{children}</div>
      </div>
    </div>
  );
}

export function Drawer({ open, label, onClose, children, side = "left", wide }: { open: boolean; label: string; onClose: () => void; children: ReactNode; side?: "left" | "right"; wide?: boolean }) {
  const panel = useRef<HTMLDivElement>(null);
  useDialogLifecycle(open, onClose, panel);
  if (!open) return null;
  const right = side === "right";
  return (
    <div className="fixed inset-0 z-[80]">
      <button type="button" className="absolute inset-0 animate-[fade-in_0.2s_ease-out] bg-ink/40" aria-label="Close" onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={`absolute inset-y-0 flex ${wide ? "w-[min(100%,26rem)]" : "w-[min(100%,20rem)]"} flex-col overflow-y-auto bg-bg shadow-overlay ${
          right ? "right-0 animate-[slide-in-right_0.28s_cubic-bezier(0.2,0.7,0.2,1)]" : "left-0 animate-[slide-in_0.28s_cubic-bezier(0.2,0.7,0.2,1)] p-5"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

/** Centred modal on desktop, bottom sheet on phones. Wider than Dialog, for rich content such as quick view. */
export function Modal({ open, label, onClose, children }: { open: boolean; label: string; onClose: () => void; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  useDialogLifecycle(open, onClose, panel);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-6">
      <button type="button" className="absolute inset-0 animate-[fade-in_0.2s_ease-out] bg-ink/40" aria-label="Close" onClick={onClose} />
      <div ref={panel} role="dialog" aria-modal="true" aria-label={label} className="pb-[env(safe-area-inset-bottom)] relative z-10 max-h-[92dvh] w-full max-w-4xl animate-[fade-up_0.3s_cubic-bezier(0.2,0.7,0.2,1)] overflow-y-auto overscroll-contain rounded-t-3xl bg-bg shadow-overlay sm:rounded-2xl">
        <span aria-hidden className="mx-auto mt-2.5 block h-1 w-10 rounded-full bg-border sm:hidden" />
        {children}
      </div>
    </div>
  );
}

/** Extra description for a control that already has an accessible name. */
export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="group/tip relative inline-flex">
      {children}
      <span role="tooltip" className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-xs text-white group-hover/tip:block group-focus-within/tip:block">
        {label}
      </span>
    </span>
  );
}
