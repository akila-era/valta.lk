/**
 * Halloween decorations, shown only while staff have the Halloween theme on (Admin, Promotions, Seasonal Theme).
 * All decorative: hidden from screen readers, they never take clicks, and their movements stop under reduced motion.
 */

/** A jack-o'-lantern (square viewBox); size it with the class. */
export function Pumpkin({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden className={className}>
      <path d="M47 24c0-9 4-15 12-19l4 5c-6 3-8 8-8 14z" fill="#111111" />
      <ellipse cx="29" cy="62" rx="25" ry="35" fill="#e04e00" />
      <ellipse cx="71" cy="62" rx="25" ry="35" fill="#e04e00" />
      <ellipse cx="50" cy="61" rx="25" ry="37" fill="#ff5c00" />
      <path d="M26 52h13l-6.5-11zM61 52h13l-6.5-11zM47 62h6l-3-5z" fill="#111111" />
      <path d="M24 68c9 19 43 19 52 0l-7 3-4 6-6-5-6 7-6-7-6 5-4-6z" fill="#111111" />
    </svg>
  );
}

/** The pumpkin standing in for the O of the wordmark; it sits on the text baseline like the letter did. */
export function PumpkinO({ className = "" }: { className?: string }) {
  return <Pumpkin className={`mx-[0.02em] inline-block h-[0.78em] w-[0.78em] shrink-0 ${className}`} />;
}

const BAT = "M32 9.5 30.4 5l-.9 3.4C26 5.6 18.6 3.4 9 6c4 2.8 5.2 6.6 4.4 10.8 3.8-2.6 8-2.2 10.8 1.6 2.4-2.4 5.2-2.4 7.8 2.6 2.6-5 5.4-5 7.8-2.6 2.8-3.8 7-4.2 10.8-1.6-.8-4.2.4-8 4.4-10.8-9.6-2.6-17-.4-20.5 2.4L33.6 5z";

function Bat({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 30" aria-hidden className={className}>
      <path fill="currentColor" d={BAT} />
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

function Spider({ thread, className = "" }: { thread: string; className?: string }) {
  return (
    <span className={`halloween-spider absolute top-0 flex flex-col items-center ${className}`}>
      <span className={`block w-px bg-ink/40 ${thread}`} />
      <svg viewBox="0 0 20 16" className="h-4 w-5 text-ink">
        <path d="M3 3l4 3M17 3l-4 3M1 8h5M19 8h-5M3 13l4-3M17 13l-4-3" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" />
        <ellipse cx="10" cy="8" rx="3.6" ry="4.4" fill="currentColor" />
      </svg>
    </span>
  );
}

/**
 * Sits right under the header with no height of its own: cobwebs with spiders in both top corners, a group of bats on
 * the right, and now and then a bat flying across the page.
 */
export function HalloweenDecor() {
  return (
    <div aria-hidden className="pointer-events-none relative z-30 h-0">
      {/* Bats crossing the page; the strip clips them so the page never scrolls sideways. */}
      <div className="absolute inset-x-0 top-0 h-72 overflow-hidden">
        <Bat className="halloween-fly absolute left-0 top-16 h-7 w-14 text-ink" />
        <Bat className="halloween-fly absolute left-0 top-40 h-5 w-10 text-ink/80 [animation-delay:-9s] [animation-duration:22s]" />
      </div>

      <div className="absolute left-0 top-0 text-ink/30">
        <Cobweb className="h-20 w-20 sm:h-28 sm:w-28 lg:h-36 lg:w-36" />
        <Spider thread="h-12 lg:h-20" className="left-14 sm:left-20 lg:left-28" />
      </div>
      <div className="absolute right-0 top-0 hidden -scale-x-100 text-ink/30 md:block">
        <Cobweb className="h-28 w-28 lg:h-36 lg:w-36" />
        <Spider thread="h-8 lg:h-12" className="left-20 [animation-delay:-3s] lg:left-24" />
      </div>

      <div className="absolute right-4 top-4 text-ink sm:right-[14%] md:right-[18%]">
        <Bat className="halloween-bat absolute right-0 top-0 h-8 w-16" />
        <Bat className="halloween-bat absolute right-16 top-9 h-5 w-10 opacity-85 [animation-delay:-1.2s]" />
        <Bat className="halloween-bat absolute right-6 top-[4.5rem] h-4 w-8 opacity-70 [animation-delay:-2.1s]" />
        <Bat className="halloween-bat absolute right-28 top-1 hidden h-4 w-8 opacity-60 [animation-delay:-0.6s] sm:block" />
      </div>
    </div>
  );
}

/**
 * A Halloween night along the top edge of the footer: a hill line in the footer's black with a bare tree, graves and
 * pumpkins on it, under a pale moon with bats. It stands just above the footer and scales with the width.
 */
export function HalloweenSkyline() {
  const pumpkin = (x: number, y: number, s: number) => (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx="-9" cy="0" rx="11" ry="10" fill="#e04e00" />
      <ellipse cx="9" cy="0" rx="11" ry="10" fill="#e04e00" />
      <ellipse cx="0" cy="0" rx="11" ry="10.5" fill="#ff5c00" />
      <path d="M-1 -10c0-4 2-6 5-7l1 2c-2 1-3 3-3 5z" fill="#111111" />
      <path d="M-9 -2h5l-2.5-4zM4 -2h5l-2.5-4zM-9 3c4 5 14 5 18 0l-3 1-2 2-2-2-2 2-2-2-2 2-2-2z" fill="#111111" />
    </g>
  );
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-full h-24 overflow-hidden sm:h-32">
      <svg viewBox="0 0 1440 130" preserveAspectRatio="xMidYMax slice" className="h-full w-full">
        <circle cx="1130" cy="36" r="34" fill="#ffd2b8" opacity="0.25" />
        <circle cx="1130" cy="36" r="22" fill="#ffe4d3" />
        <path d={BAT} fill="#111111" transform="translate(1062 30) scale(0.5)" />
        <path d={BAT} fill="#111111" transform="translate(1180 52) scale(0.38)" />
        <path
          d="M0 130V104c90-12 180-30 300-26s210 26 330 24 230-16 360-30 250-6 340 6 80 14 110 16V130z"
          fill="#111111"
        />
        <path
          d="M232 86l-2-46M230 64l-18-16-10-2M212 48l-3-11M230 54l18-15 12-2M248 39l2-11M230 46l-8-15-6-6M230 46l7-17"
          stroke="#111111"
          strokeWidth="4"
          strokeLinecap="round"
          fill="none"
        />
        <path d="M512 102v-18a11 11 0 0 1 22 0v18zM556 100v-14a9 9 0 0 1 18 0v14zM600 99v-22h5v-7h6v7h5v22z" fill="#111111" />
        {pumpkin(400, 86, 1)}
        {pumpkin(436, 90, 0.7)}
        {pumpkin(880, 92, 0.9)}
        {pumpkin(1300, 74, 1.1)}
      </svg>
    </div>
  );
}
