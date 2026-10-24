/**
 * A large band of the real category names drifting sideways between chapters, alternating solid and outlined type
 * with orange stars. Decorative (the same names are links in the categories chapter), so hidden from assistive tech.
 */
export function MarqueeBand({ words }: { words: string[] }) {
  if (!words.length) return null;
  // Repeat so one half always covers the widest screens; the marquee animation moves by exactly half.
  const run = Array.from({ length: Math.max(2, Math.ceil(8 / words.length)) }, () => words).flat();
  return (
    <div aria-hidden className="marquee pointer-events-none relative overflow-hidden border-y border-ink/[0.07] bg-[linear-gradient(90deg,#fff,#fff4ec_50%,#fff)] py-5 sm:py-7">
      <div className="flex w-max animate-marquee">
        {[0, 1].map((half) => (
          <ul key={half} className="flex shrink-0 items-center">
            {run.map((w, i) => (
              <li key={`${half}-${i}`} className="flex items-center">
                <span
                  className={`px-5 font-sans text-[clamp(2.25rem,1.5rem+3vw,4.5rem)] font-light leading-none tracking-[-0.04em] sm:px-8 ${
                    i % 2 ? "accent-serif text-transparent [-webkit-text-stroke:1.2px_#ff5c00]" : "text-ink"
                  }`}
                >
                  {w}
                </span>
                <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 animate-[spin_9s_linear_infinite] fill-brand-500 sm:h-7 sm:w-7">
                  <path d="M12 0l2.6 9.4L24 12l-9.4 2.6L12 24l-2.6-9.4L0 12l9.4-2.6z" />
                </svg>
              </li>
            ))}
          </ul>
        ))}
      </div>
    </div>
  );
}
