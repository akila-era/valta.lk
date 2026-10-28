import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

/** Text pages (about, contact, policies): a warm light header band with the title, then the content on a white card. */
export function PolicyPage({
  title,
  intro,
  eyebrow = "VOLTA.LK / INFORMATION",
  children,
}: {
  title: string;
  intro?: string;
  eyebrow?: string;
  children: ReactNode;
}) {
  return (
    <article className="mx-auto max-w-4xl space-y-6">
      {/* Pill Breadcrumbs */}
      <nav aria-label="Breadcrumb" className="w-fit">
        <ol className="flex items-center gap-1.5 rounded-full border border-border/80 bg-white px-3.5 py-1.5 text-xs text-muted shadow-soft">
          <li>
            <Link href="/" className="inline-flex min-h-6 items-center transition-colors hover:text-ink">
              Home
            </Link>
          </li>
          <ChevronRight className="h-3 w-3 text-muted/60" aria-hidden />
          <li>
            <span className="text-muted">Information</span>
          </li>
          <ChevronRight className="h-3 w-3 text-muted/60" aria-hidden />
          <li>
            <span className="font-semibold text-brand-600" aria-current="page">
              {title}
            </span>
          </li>
        </ol>
      </nav>

      {/* Hero Header */}
      <header className="relative overflow-hidden rounded-3xl border border-border/80 bg-bg p-6 shadow-soft sm:p-10">
        {/* Ambient Glow & Dot Pattern */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 [background-image:radial-gradient(rgb(23_23_23/0.05)_1px,transparent_1.3px)] [background-size:16px_16px] [mask-image:radial-gradient(ellipse_at_top_right,#000,transparent_75%)]"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute -right-20 top-1/2 hidden aspect-square w-[28rem] -translate-y-1/2 rounded-full border border-brand-500 [transform:perspective(800px)_rotateX(72deg)] sm:block"
        />

        <div className="relative z-10 max-w-2xl">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-600">
            {eyebrow}
          </p>
          <h1 className="statement mt-2 text-title-page leading-tight text-ink">
            {title}
          </h1>
          {intro && (
            <p className="mt-3 text-[15px] leading-7 text-muted">
              {intro}
            </p>
          )}
        </div>
      </header>

      {/* Main Content Card */}
      <div className="rounded-3xl border border-border/80 bg-white p-6 shadow-soft sm:p-10 [&_h2]:mb-2.5 [&_h2]:border-l-[3px] [&_h2]:border-brand-500 [&_h2]:pl-3 [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-bold [&_h2]:tracking-[-0.01em] [&_h2]:text-ink [&_p]:text-sm [&_p]:leading-6 [&_p]:text-muted [&_section]:space-y-2 [&_section]:border-b [&_section]:border-border/60 [&_section]:pb-6 [&_section]:last:border-b-0 [&_section]:last:pb-0 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5 [&_ul]:text-sm [&_ul]:text-muted [&_a]:font-semibold [&_a]:text-brand-600 [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-brand-700">
        {children}
      </div>
    </article>
  );
}
