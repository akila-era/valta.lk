"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";

/** An admin page failed to render. The cause is logged on the server; nothing technical is shown here. */
export default function AdminError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="card mx-auto mt-10 max-w-lg p-8 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-danger-bg text-danger"><AlertTriangle className="h-6 w-6" aria-hidden /></span>
      <h1 className="mt-4 text-xl font-bold">This page could not be loaded</h1>
      <p className="mt-2 text-sm text-muted">Something went wrong while loading this admin page. Your data has not been changed. Try again, or go back to the dashboard.</p>
      <div className="mt-6 flex justify-center gap-3">
        <button type="button" className="btn-primary" onClick={reset}>Try again</button>
        <Link href="/admin" className="btn-secondary">Dashboard</Link>
      </div>
    </div>
  );
}
