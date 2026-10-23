import Link from "next/link";
import { AlertTriangle, CircleCheck, PackageSearch } from "lucide-react";
import type { ReactNode } from "react";
import { Notice } from "./notice";

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: { href: string; label: string } }) {
  return (
    <div className="card flex flex-col items-center px-6 py-14 text-center">
      <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-surface text-muted">
        <PackageSearch className="h-7 w-7" aria-hidden />
      </span>
      <h2 className="text-lg font-semibold">{title}</h2>
      {children && <p className="mt-2 max-w-md text-sm text-muted">{children}</p>}
      {action && (
        <Link href={action.href} className="btn-primary mt-6">
          {action.label}
        </Link>
      )}
    </div>
  );
}

export function ErpUnavailable({ retryHref }: { retryHref?: string }) {
  return (
    <div role="alert" className="card flex flex-col items-center border-warn/30 bg-warn-bg px-6 py-14 text-center">
      <AlertTriangle className="mb-4 h-10 w-10 text-warn" aria-hidden />
      <h2 className="text-lg font-semibold text-warn">Products are temporarily unavailable</h2>
      <p className="mt-2 max-w-md text-sm text-warn">We could not load our catalogue right now. Please try again in a few minutes.</p>
      {retryHref && (
        <Link href={retryHref} className="btn-secondary mt-6">
          Try again
        </Link>
      )}
    </div>
  );
}

export function SuccessState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-14 text-center">
      <CircleCheck className="mb-4 h-10 w-10 text-success" aria-hidden />
      <h2 className="text-lg font-semibold">{title}</h2>
      {children ? <div className="mt-2 max-w-md"><Notice tone="success">{children}</Notice></div> : null}
    </div>
  );
}

export function PageSkeleton({ label = "Loading page" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" aria-label={label}>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="mt-6 h-28 w-full" />
      <Skeleton className="mt-4 h-28 w-full" />
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-lg bg-surface ${className}`} />;
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4" role="status" aria-label="Loading products">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-xl border border-border bg-bg shadow-card">
          <Skeleton className="aspect-square w-full rounded-none" />
          <div className="px-4 pb-5 pt-3">
            <Skeleton className="h-3 w-1/4" />
            <Skeleton className="mt-2 h-4 w-11/12" />
            <Skeleton className="mt-1.5 h-4 w-2/3" />
            <Skeleton className="mt-7 h-5 w-2/5" />
          </div>
        </div>
      ))}
    </div>
  );
}
