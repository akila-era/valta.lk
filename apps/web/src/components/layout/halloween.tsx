/**
 * Halloween decorations, shown only while staff have the Halloween theme on (Admin, Promotions, Seasonal Theme).
 * All decorative: hidden from screen readers, they never take clicks, and their small movements stop under reduced
 * motion.
 */

/** A jack-o'-lantern that stands in for the O of the wordmark; it sits on the text baseline like the letter did. */
export function PumpkinO({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden className={`mx-[0.02em] inline-block h-[0.78em] w-[0.78em] shrink-0 ${className}`}>
      <path d="M47 24c0-9 4-15 12-19l4 5c-6 3-8 8-8 14z" fill="#111111" />
      <ellipse cx="29" cy="62" rx="25" ry="35" fill="#e04e00" />
      <ellipse cx="71" cy="62" rx="25" ry="35" fill="#e04e00" />
      <ellipse cx="50" cy="61" rx="25" ry="37" fill="#ff5c00" />
      <path d="M26 52h13l-6.5-11zM61 52h13l-6.5-11zM47 62h6l-3-5z" fill="#111111" />
      <path d="M24 68c9 19 43 19 52 0l-7 3-4 6-6-5-6 7-6-7-6 5-4-6z" fill="#111111" />
    </svg>
  );
}

function Bat({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 30" aria-hidden className={className}>
      <path
        fill="currentColor"
        d="M32 9.5 30.4 5l-.9 3.4C26 5.6 18.6 3.4 9 6c4 2.8 5.2 6.6 4.4 10.8 3.8-2.6 8-2.2 10.8 1.6 2.4-2.4 5.2-2.4 7.8 2.6 2.6-5 5.4-5 7.8-2.6 2.8-3.8 7-4.2 10.8-1.6-.8-4.2.4-8 4.4-10.8-9.6-2.6-17-.4-20.5 2.4L33.6 5z"
      />
    </svg>
  );
}

/** A corner cobweb: threads from the corner and sagging rings between them, drawn from a few numbers. */
function Cobweb({ className = "" }: { className?: string }) {
  const angles = [0, 22.5, 45, 67.5, 90].map((d) => (d * Math.PI) / 180);
  const rings = [26, 52, 80, 108];
  const pt = (r: number, a: number) => `${(r * Math.cos(a)).toFixed(1)} ${(r * Math.sin(a)).toFixed(1)}`;
  const d = [
    ...angles.map((a) => `M0 0L${pt(120, a)}`),
    ...rings.flatMap((r) => angles.slice(1).map((a, i) => `M${pt(r, angles[i])}Q${pt(r * 0.8, (a + angles[i]) / 2)} ${pt(r, a)}`)),
  ].join("");
  return (
    <svg viewBox="0 0 120 120" aria-hidden className={className}>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

/**
 * Sits right under the header with no height of its own: a cobweb with a small spider in the left corner and three
 * bats on the right, over the top of the page.
 */
export function HalloweenDecor() {
  return (
    <div aria-hidden className="pointer-events-none relative z-30 h-0">
      <div className="absolute left-0 top-0 hidden text-ink/25 sm:block">
        <Cobweb className="h-24 w-24 lg:h-32 lg:w-32" />
        <span className="halloween-spider absolute left-[4.5rem] top-0 flex flex-col items-center lg:left-24">
          <span className="block h-12 w-px bg-ink/40 lg:h-16" />
          <svg viewBox="0 0 20 16" className="h-3.5 w-[1.1rem] text-ink">
            <path d="M3 3l4 3M17 3l-4 3M1 8h5M19 8h-5M3 13l4-3M17 13l-4-3" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" />
            <ellipse cx="10" cy="8" rx="3.6" ry="4.4" fill="currentColor" />
          </svg>
        </span>
      </div>
      <div className="absolute right-3 top-3 text-ink sm:right-8 lg:right-16">
        <Bat className="halloween-bat absolute right-0 top-0 h-6 w-12 lg:h-7 lg:w-14" />
        <Bat className="halloween-bat absolute right-14 top-7 h-4 w-8 opacity-80 [animation-delay:-1.2s] lg:right-20" />
        <Bat className="halloween-bat absolute right-6 top-14 h-3 w-6 opacity-60 [animation-delay:-2.1s] lg:right-9" />
      </div>
    </div>
  );
}
