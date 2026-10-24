import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Page not found", robots: { index: false } };

/** Layered text shadows extrude the numerals in orange: a 2D glyph turned into a 3D block. */
const EXTRUDE =
  "[text-shadow:1px_1px_0_#ff7a2e,2px_2px_0_#ff6a14,3px_3px_0_#ff5c00,4px_4px_0_#f04f00,5px_5px_0_#e04800,6px_6px_0_#cf4300,7px_7px_0_#bd3d00,14px_20px_34px_rgb(255_92_0/0.35)]";

export default function NotFound() {
  return (
    <main className="relative isolate flex min-h-[70vh] flex-col items-center justify-center overflow-hidden px-4 py-16 text-center">
      <span aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(180deg,#fbf6f1,#ffffff)]" />
      <span aria-hidden className="pointer-events-none absolute inset-0 -z-10 [background-image:radial-gradient(rgb(23_23_23/0.07)_1px,transparent_1.3px)] [background-size:18px_18px] [mask-image:radial-gradient(ellipse_at_center,#000,transparent_70%)]" />
      <span aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 -z-10 aspect-square w-[min(48rem,140vw)] -translate-x-1/2 -translate-y-1/2 rounded-full border border-brand-500/30 [transform:perspective(900px)_rotateX(74deg)]" />
      <p aria-hidden className={`font-display text-[7rem] font-black leading-none tracking-[-0.04em] text-ink sm:text-[10rem] ${EXTRUDE}`}>404</p>
      <h1 className="mt-6 text-3xl font-bold tracking-[-0.02em]">Page not found</h1>
      <p className="mt-3 text-muted">The page you are looking for does not exist or has moved.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/" className="btn-primary shadow-[0_10px_24px_-8px_rgb(255_92_0/0.6)]">Go home</Link>
        <Link href="/products" className="btn-secondary">Browse products</Link>
      </div>
    </main>
  );
}
