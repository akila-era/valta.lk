import Link from "next/link";
import { accentize } from "@/components/ui/page-intro";

/** Layered text shadows extrude the numerals in orange: a 2D glyph turned into a 3D block. */
const EXTRUDE =
  "[text-shadow:1px_1px_0_#ff7a2e,2px_2px_0_#ff6a14,3px_3px_0_#ff5c00,4px_4px_0_#f04f00,5px_5px_0_#e04800,6px_6px_0_#cf4300,7px_7px_0_#bd3d00,14px_20px_34px_rgb(255_92_0/0.35)]";

/**
 * The "page not found" body. It is not a <main>: both callers already sit inside the store shell's <main>
 * (app/not-found.tsx wraps it in StoreShell; app/(store)/not-found.tsx is inside the store layout).
 */
export function NotFoundContent() {
  return (
    <div className="relative isolate flex min-h-[60vh] flex-col items-center justify-center overflow-hidden rounded-feature px-4 py-14 text-center">
      <span aria-hidden className="pointer-events-none absolute inset-0 -z-10 [background-image:radial-gradient(rgb(23_23_23/0.06)_1px,transparent_1.3px)] [background-size:18px_18px] [mask-image:radial-gradient(ellipse_at_center,#000,transparent_70%)]" />
      <span aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 -z-10 aspect-square w-[min(48rem,140vw)] -translate-x-1/2 -translate-y-1/2 rounded-full border border-brand-500/25 [transform:perspective(900px)_rotateX(74deg)]" />

      <p aria-hidden className={`font-display text-[7rem] font-black leading-none tracking-[-0.04em] text-ink sm:text-[10rem] ${EXTRUDE}`}>
        404
      </p>

      <p className="kicker mt-8">
        <span className="text-brand-600">Error</span> / 404
      </p>

      <h1 className="statement mt-3 text-[clamp(2.25rem,1.6rem+2.4vw,3.75rem)] text-ink">{accentize("Page not found", "not found")}</h1>

      <p className="mt-3 max-w-md text-sm leading-6 text-muted">The product or page you are looking for does not exist or may have been relocated.</p>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/" className="btn-primary px-6">
          Go home
        </Link>
        <Link href="/products" className="btn-secondary px-6">
          Browse products
        </Link>
      </div>
    </div>
  );
}
