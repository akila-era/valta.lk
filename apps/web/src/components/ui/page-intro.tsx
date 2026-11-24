import type { ReactNode } from "react";

/**
 * The page heading used across the storefront: a small kicker ("Shop / Catalogue"), a bold title, an optional lead
 * line and an optional side note.
 */
export function PageIntro({ section, label, title, intro, aside, center = false, className = "" }: {
  section: string;
  label?: string;
  title: string;
  intro?: ReactNode;
  aside?: ReactNode;
  center?: boolean;
  className?: string;
}) {
  return (
    <header className={`mb-6 grid gap-x-10 gap-y-3 sm:mb-8 ${aside ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-end" : ""} ${center ? "justify-items-center text-center" : ""} ${className}`}>
      <div className="min-w-0">
        <p className="kicker animate-fade-up">
          <span className="text-brand-600">{section}</span>
          {label ? <> / {label}</> : null}
        </p>
        <h1 className={`statement mt-1.5 animate-fade-up text-title-page [--d:80ms] ${center ? "mx-auto max-w-[18ch]" : "max-w-[22ch]"}`}>{title}</h1>
        {intro ? <div className={`mt-3 max-w-2xl animate-fade-up text-[15px] leading-7 text-muted [--d:160ms] ${center ? "mx-auto" : ""}`}>{intro}</div> : null}
      </div>
      {aside ? <div className="max-w-sm animate-fade-up text-sm leading-6 text-muted [--d:200ms] lg:justify-self-end lg:text-right">{aside}</div> : null}
    </header>
  );
}
