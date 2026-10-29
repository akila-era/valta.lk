import Link from "next/link";

const Letters = () => (
  <>
    <span>V</span>
    <span className="text-brand-500">O</span>
    <span>LTA</span>
    <span className="text-[0.82em] font-extrabold">.LK</span>
  </>
);

/**
 * The VOLTA.LK wordmark, linking home. With `shine`, a soft light band sweeps across the letters every few seconds: a
 * copy of the letters sits on top, transparent except for the moving band clipped to the glyphs, so the shine shows
 * only on the letters, never on the background (decorative; off under reduced motion).
 */
export function Wordmark({ className = "", shine = false }: { className?: string; shine?: boolean }) {
  return (
    <Link
      href="/"
      className={`inline-flex items-baseline pointer-coarse:py-2.5 font-display font-extrabold tracking-[-0.02em] ${className}`}
    >
      <span className="sr-only">VOLTA.LK home</span>
      <span aria-hidden className="relative inline-flex items-baseline">
        <Letters />
        {shine ? (
          <span className="wordmark-shine pointer-events-none absolute inset-0 inline-flex items-baseline">
            <Letters />
          </span>
        ) : null}
      </span>
    </Link>
  );
}
