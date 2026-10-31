import Link from "next/link";
import { PumpkinO } from "./halloween";

/** The letters; with `pumpkin` the O is a jack-o'-lantern (Halloween theme), kept as an empty space in the shine copy. */
const Letters = ({ pumpkin = false, overlay = false }: { pumpkin?: boolean; overlay?: boolean }) => (
  <>
    <span>V</span>
    {pumpkin ? <PumpkinO className={overlay ? "invisible" : ""} /> : <span className="text-brand-500">O</span>}
    <span>LTA</span>
    <span className="text-[0.82em] font-extrabold">.LK</span>
  </>
);

/**
 * The VOLTA.LK wordmark, linking home. With `shine`, a neon orange band sweeps across the letters every few seconds: a
 * copy of the letters sits on top, transparent except for the moving band clipped to the glyphs, so the shine shows
 * only on the letters, never on the background (decorative; off under reduced motion).
 */
export function Wordmark({ className = "", shine = false, pumpkin = false }: { className?: string; shine?: boolean; pumpkin?: boolean }) {
  return (
    <Link
      href="/"
      className={`inline-flex items-baseline pointer-coarse:py-2.5 font-display font-extrabold tracking-[-0.02em] ${className}`}
    >
      <span className="sr-only">VOLTA.LK home</span>
      <span aria-hidden className="relative inline-flex items-baseline">
        <Letters pumpkin={pumpkin} />
        {shine ? (
          <span className="wordmark-shine pointer-events-none absolute inset-0 inline-flex items-baseline">
            <Letters pumpkin={pumpkin} overlay />
          </span>
        ) : null}
      </span>
    </Link>
  );
}
