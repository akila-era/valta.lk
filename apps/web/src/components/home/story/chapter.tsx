import type { ReactNode } from "react";
import { Reveal } from "../reveal";

export const chapterNumber = (n: number) => String(n).padStart(2, "0");

/**
 * One chapter of the homepage story: a kicker ("03 / CATEGORIES"), then the chapter's own content. Brand chapters add
 * a large light statement with one serif accent word and an optional side note; shopping chapters leave it out
 * (compact) so their products come sooner. `data-chapter` feeds the fixed chapter rail.
 * The statement is a paragraph, not a heading: each chapter's content keeps its own accessible h2.
 */
export function Chapter({
  id,
  n,
  label,
  statement,
  aside,
  children,
}: {
  id: string;
  n: number;
  label: string;
  statement?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  const kicker = (
    <p className="kicker">
      <span className="text-brand-600">{chapterNumber(n)}</span> / {label}
    </p>
  );
  return (
    <div id={id} data-chapter data-label={label} className={`scroll-mt-24 ${statement ? "py-12 sm:py-16 lg:py-20" : "py-6 sm:py-8 lg:py-10"}`}>
      <div className="container-page">
        {statement ? (
          <Reveal className="mb-6 grid gap-x-10 gap-y-4 sm:mb-8 lg:mb-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-end">
            <div>
              {kicker}
              <p className="statement statement-wipe mt-3 max-w-[18ch] text-[clamp(2.2rem,1.3rem+3.4vw,4.75rem)] sm:mt-4">{statement}</p>
            </div>
            {aside ? <div className="max-w-sm text-sm leading-6 text-muted lg:justify-self-end lg:text-right">{aside}</div> : null}
          </Reveal>
        ) : (
          <div className="mb-3 sm:mb-4">{kicker}</div>
        )}
        {/* The chapter header already spaces the content, so its first section drops its own top margin. */}
        <div className="[&>section:first-child]:mt-0 [&>section:first-child]:pt-0">{children}</div>
      </div>
    </div>
  );
}

/** A serif italic accent word inside a statement. */
export function Accent({ children, tone = "brand" }: { children: ReactNode; tone?: "brand" | "ink" }) {
  return <span className={`accent-serif ${tone === "brand" ? "text-brand-hover" : "text-ink"}`}>{children}</span>;
}
