"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Icon3D } from "@/components/ui/icon-3d";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="relative isolate flex min-h-[70vh] flex-col items-center justify-center overflow-hidden px-4 py-16 text-center" role="alert">
      <span aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(180deg,#fbf6f1,#ffffff)]" />
      <span aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 -z-10 aspect-square w-[min(40rem,130vw)] -translate-x-1/2 -translate-y-1/2 rounded-full border border-brand-500/30 [transform:perspective(900px)_rotateX(74deg)]" />
      <span className="group animate-float [--dur:6s]">
        <Icon3D icon={AlertTriangle} size="lg" />
      </span>
      <h1 className="mt-6 text-3xl font-bold tracking-[-0.02em]">Something went wrong</h1>
      <p className="mt-3 text-muted">An unexpected error occurred. Please try again.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button type="button" className="btn-primary shadow-[0_10px_24px_-8px_rgb(255_92_0/0.6)]" onClick={reset}>Try again</button>
        <Link href="/" className="btn-secondary">Go home</Link>
      </div>
    </main>
  );
}
