import type { ReactNode } from "react";
import Link from "next/link";

/** Text pages (about, contact, policies), as on ugreen.lk. `eyebrow` is still accepted from older callers but not shown. */
export function PolicyPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  /** Not shown (kept so older callers still compile). */
  eyebrow?: string;
  children: ReactNode;
}) {
  // As on ugreen.lk: a plain page. Breadcrumb, a bold title, then the text with simple headings; no cards or decoration.
  return (
    <article className="mx-auto max-w-4xl">
      <nav aria-label="Breadcrumb">
        <ol className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <li>
            <Link href="/" className="inline-flex min-h-6 items-center transition-colors hover:text-ink">Home</Link>
          </li>
          <li aria-hidden className="text-muted/70">/</li>
          <li>
            <span className="font-semibold text-ink" aria-current="page">{title}</span>
          </li>
        </ol>
      </nav>
      <h1 className="mt-4 text-[clamp(1.6rem,1.3rem+1vw,2.2rem)] font-semibold leading-tight text-ink">{title}</h1>
      {intro && <p className="mt-2 text-[15px] leading-7 text-muted">{intro}</p>}
      <div className="mt-8 space-y-8 [&_a]:font-semibold [&_a]:text-brand-600 [&_a]:underline [&_a]:underline-offset-2 [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-ink [&_p]:text-[15px] [&_p]:leading-7 [&_p]:text-ink/75 [&_section]:space-y-2 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5 [&_ul]:text-[15px] [&_ul]:text-ink/75">
        {children}
      </div>
    </article>
  );
}
