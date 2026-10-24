import type { ReactNode } from "react";
import { accentize } from "@/components/ui/page-intro";

/** Text pages (about, contact, policies): a warm light header band with the title, then the content on a white card. */
export function PolicyPage({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) {
  return (
    <article className="mx-auto max-w-4xl">
      <header className="relative overflow-hidden rounded-panel bg-[linear-gradient(150deg,#fff4ec,#ffffff_55%,#f6f4f0)] px-6 py-10 shadow-soft ring-1 ring-brand-500/10 sm:px-10 sm:py-12">
        {/* 2D dot grid and glow, with a tilted 3D orbit ring sweeping behind the title. */}
        <span aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-brand-500/15 blur-3xl" />
        <span aria-hidden className="pointer-events-none absolute inset-0 [background-image:radial-gradient(rgb(23_23_23/0.06)_1px,transparent_1.3px)] [background-size:16px_16px] [mask-image:linear-gradient(200deg,#000,transparent_60%)]" />
        <span aria-hidden className="pointer-events-none absolute -right-20 top-1/2 hidden aspect-square w-[28rem] -translate-y-1/2 rounded-full border border-brand-500/30 [transform:perspective(800px)_rotateX(72deg)] sm:block" />
        <p className="kicker relative"><span className="text-brand-600">VALTA.LK</span> / Information</p>
        <h1 className="statement relative mt-3 max-w-[20ch] text-[clamp(2.25rem,1.5rem+2.4vw,3.75rem)]">{accentize(title)}</h1>
        {intro && <p className="relative mt-3 max-w-2xl text-base leading-7 text-muted">{intro}</p>}
      </header>
      <div className="card mt-4 space-y-8 rounded-panel p-6 text-sm leading-6 sm:p-10 [&_h2]:mb-2 [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:tracking-[-0.01em] [&_p]:text-muted [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5 [&_ul]:text-muted [&_a]:font-semibold [&_a]:text-brand-600">
        {children}
      </div>
    </article>
  );
}
