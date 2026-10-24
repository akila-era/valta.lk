import type { ReactNode } from "react";

/** Text pages (about, contact, policies): a warm light header band with the title, then the content on a white card. */
export function PolicyPage({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) {
  return (
    <article className="mx-auto max-w-4xl">
      <header className="relative overflow-hidden rounded-[1.75rem] border border-brand-100 bg-gradient-to-br from-brand-50 via-bg to-surface px-6 py-10 sm:px-10 sm:py-12">
        <span aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-brand-500/15 blur-3xl" />
        <p className="eyebrow relative">VALTA.LK</p>
        <h1 className="relative mt-3 font-display text-[1.9rem] font-bold leading-[1.1] tracking-[-0.022em] sm:text-[2.5rem]">{title}</h1>
        {intro && <p className="relative mt-3 max-w-2xl text-base leading-7 text-muted">{intro}</p>}
      </header>
      <div className="mt-4 space-y-8 rounded-[1.75rem] border border-border bg-bg p-6 text-sm leading-6 sm:p-10 [&_h2]:mb-2 [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:tracking-[-0.01em] [&_p]:text-muted [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5 [&_ul]:text-muted [&_a]:font-semibold [&_a]:text-brand-600">
        {children}
      </div>
    </article>
  );
}
