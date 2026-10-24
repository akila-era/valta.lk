import type { ReactNode } from "react";
import { Accent } from "@/components/home/story/chapter";

/**
 * Renders `title` with one word (or phrase) in the italic serif accent, as on the homepage ("All *products*").
 * The text itself is unchanged, so the heading's accessible name stays exactly `title`.
 * `accent` defaults to the last word (the last two when the last is very short, so "Sign in" and "Contact us" are
 * accented whole); pass `false` for no accent. A phrase that does not occur leaves the title plain.
 */
export function defaultAccent(title: string): string {
  const words = title.trim().split(/\s+/);
  const last = words.at(-1) ?? "";
  return last.length <= 3 && words.length >= 2 ? words.slice(-2).join(" ") : last;
}

export function accentize(title: string, accent?: string | false): ReactNode {
  if (accent === false) return title;
  const word = accent ?? defaultAccent(title);
  const at = word ? title.lastIndexOf(word) : -1;
  if (at < 0) return title;
  return (
    <>
      {title.slice(0, at)}
      <Accent>{word}</Accent>
      {title.slice(at + word.length)}
    </>
  );
}

/**
 * The page heading used across the storefront, in the homepage's story style: a small kicker ("Shop / Catalogue"),
 * a large light headline with one serif accent word, an optional lead line and an optional side note.
 */
export function PageIntro({ section, label, title, accent, intro, aside, center = false, className = "" }: {
  section: string;
  label?: string;
  title: string;
  accent?: string | false;
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
        <h1 className={`statement mt-3 animate-fade-up text-[clamp(2.25rem,1.5rem+2.6vw,4rem)] [--d:80ms] ${center ? "mx-auto max-w-[18ch]" : "max-w-[22ch]"}`}>{accentize(title, accent)}</h1>
        {intro ? <div className={`mt-3 max-w-2xl animate-fade-up text-[15px] leading-7 text-muted [--d:160ms] ${center ? "mx-auto" : ""}`}>{intro}</div> : null}
      </div>
      {aside ? <div className="max-w-sm animate-fade-up text-sm leading-6 text-muted [--d:200ms] lg:justify-self-end lg:text-right">{aside}</div> : null}
    </header>
  );
}
