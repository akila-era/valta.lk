"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Icon3D } from "@/components/ui/icon-3d";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="relative isolate flex min-h-[75vh] flex-col items-center justify-center overflow-hidden px-4 py-16 text-center" role="alert">
            <span aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 -z-10 aspect-square w-[min(40rem,130vw)] -translate-x-1/2 -translate-y-1/2 rounded-full border border-brand-500 [transform:perspective(900px)_rotateX(74deg)]" />
      
      <span className="group animate-float [--dur:6s]">
        <Icon3D icon={AlertTriangle} size="lg" />
      </span>

      <div className="mt-8 inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-white px-3.5 py-1 text-xs font-semibold text-brand-600 shadow-soft">
        <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
        ERROR / VOLTA.LK
      </div>

      <h1 className="statement mt-3 text-title-page text-ink">
        Something went wrong
      </h1>

      <p className="mt-3 max-w-md text-sm leading-6 text-muted">
        An unexpected error occurred while loading this page. Please try again or head back to the store.
      </p>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          className="btn-primary rounded-full px-6 py-2.5 text-xs font-semibold shadow-soft hover:shadow-lift transition-all"
          onClick={reset}
        >
          Try again
        </button>
        <Link
          href="/"
          className="btn-secondary rounded-full px-6 py-2.5 text-xs font-semibold shadow-soft hover:shadow-lift transition-all"
        >
          Go home
        </Link>
      </div>
    </main>
  );
}
