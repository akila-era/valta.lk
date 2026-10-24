"use client";

import { useEffect, useState } from "react";
import { chapterNumber } from "./chapter";

interface RailChapter {
  id: string;
  label: string;
}

/**
 * The fixed "03 / 07" chapter rail on wide screens: the current chapter number, one tick per chapter (each a link to
 * it) and the chapter name written vertically. The active chapter is the last one whose top has passed 40% of the
 * viewport height.
 */
export function ChapterRail({ chapters }: { chapters: RailChapter[] }) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const els = chapters.map((c) => document.getElementById(c.id)).filter((e): e is HTMLElement => Boolean(e));
    if (!els.length) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const line = window.innerHeight * 0.4;
      let current = 0;
      els.forEach((el, i) => {
        if (el.getBoundingClientRect().top <= line) current = i;
      });
      setActive(current);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [chapters]);

  if (chapters.length < 2) return null;
  return (
    // Kept 24px wide so it fits in the page gutter (40px from xl) without touching the content.
    <nav aria-label="Page chapters" className="pointer-events-auto fixed left-2 top-1/2 z-30 hidden w-6 -translate-y-1/2 flex-col items-center gap-3 xl:flex 2xl:left-3">
      <p className="text-center font-mono text-[10px] font-semibold leading-tight text-ink" aria-hidden>
        {chapterNumber(active + 1)}
        <span className="mx-auto my-0.5 block h-px w-3 bg-ink/30" />
        <span className="block text-muted">{chapterNumber(chapters.length)}</span>
      </p>
      <ol className="flex flex-col items-center gap-1.5">
        {chapters.map((c, i) => (
          <li key={c.id}>
            <a
              href={`#${c.id}`}
              aria-current={i === active ? "true" : undefined}
              className="group flex h-5 w-6 items-center justify-center"
            >
              <span className="sr-only">{`Chapter ${i + 1}: ${c.label}`}</span>
              <span
                aria-hidden
                className={`block w-px rounded-full transition-all duration-300 ${i === active ? "h-5 bg-brand-500 shadow-[0_0_8px_rgb(255_92_0/0.7)]" : "h-2.5 bg-ink/25 group-hover:bg-ink/60"}`}
              />
            </a>
          </li>
        ))}
      </ol>
      <p aria-hidden className="mt-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-ink/60 [writing-mode:vertical-rl] rotate-180">
        {chapters[active]?.label}
      </p>
    </nav>
  );
}
