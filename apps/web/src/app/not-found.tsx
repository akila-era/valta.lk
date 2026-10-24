import type { Metadata } from "next";
import Link from "next/link";
import { accentize } from "@/components/ui/page-intro";

export const metadata: Metadata = { title: "Page not found", robots: { index: false } };

/** Layered text shadows extrude the numerals in orange: a 2D glyph turned into a 3D block. */
const EXTRUDE =
  "[text-shadow:1px_1px_0_#ff7a2e,2px_2px_0_#ff6a14,3px_3px_0_#ff5c00,4px_4px_0_#f04f00,5px_5px_0_#e04800,6px_6px_0_#cf4300,7px_7px_0_#bd3d00,14px_20px_34px_rgb(255_92_0/0.35)]";

export default function NotFound() {
  return (
    <main className="relative isolate flex min-h-[75vh] flex-col items-center justify-center overflow-hidden px-4 py-16 text-center">
      <span aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-[#FAF8F5] via-[#F4EFEA] to-white" />
      <span aria-hidden className="pointer-events-none absolute inset-0 -z-10 [background-image:radial-gradient(rgb(23_23_23/0.06)_1px,transparent_1.3px)] [background-size:18px_18px] [mask-image:radial-gradient(ellipse_at_center,#000,transparent_70%)]" />
      <span aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 -z-10 aspect-square w-[min(48rem,140vw)] -translate-x-1/2 -translate-y-1/2 rounded-full border border-brand-500/25 [transform:perspective(900px)_rotateX(74deg)]" />
      
      <p aria-hidden className={`font-display text-[7rem] font-black leading-none tracking-[-0.04em] text-ink sm:text-[10rem] ${EXTRUDE}`}>
        404
      </p>
      
      <div className="mt-8 inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-white px-3.5 py-1 text-xs font-semibold text-brand-600 shadow-soft">
        <span className="h-1.5 w-1.5 rounded-full bg-brand-500 animate-pulse" />
        ERROR / 404
      </div>

      <h1 className="statement mt-4 text-[clamp(2.25rem,1.6rem+2.4vw,3.75rem)] text-ink">
        {accentize("Page not found", "not found")}
      </h1>
      
      <p className="mt-3 max-w-md text-sm leading-6 text-muted">
        The product or page you are looking for does not exist or may have been relocated.
      </p>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/" className="btn-primary rounded-full px-6 py-2.5 text-xs font-semibold shadow-soft hover:shadow-lift transition-all">
          Go home
        </Link>
        <Link href="/products" className="btn-secondary rounded-full px-6 py-2.5 text-xs font-semibold shadow-soft hover:shadow-lift transition-all">
          Browse products
        </Link>
      </div>
    </main>
  );
}
