import Link from "next/link";
import { AlertTriangle, CircleCheck, PackageSearch } from "lucide-react";
import type { ReactNode } from "react";
import { Icon3D } from "./icon-3d";
import { Notice } from "./notice";

/** The 3D stage behind a state's icon: a tilted orange orbit and a floor shadow under the floating tile. */
function StateStage({ children }: { children: ReactNode }) {
  return (
    <span className="relative mb-6 flex h-24 w-32 items-center justify-center">
      <span aria-hidden className="absolute inset-x-0 top-1/2 aspect-square -translate-y-1/2 rounded-full border border-brand-500/35 [transform:perspective(500px)_rotateX(72deg)]" />
      <span aria-hidden className="absolute bottom-1 left-1/2 h-3 w-14 -translate-x-1/2 rounded-[50%] bg-ink/20 blur-md" />
      <span className="animate-float [--dur:6s]">{children}</span>
    </span>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: { href: string; label: string } }) {
  return (
    <div className="card group relative flex flex-col items-center overflow-hidden px-6 py-14 text-center">
      <span aria-hidden className="pointer-events-none absolute inset-0 [background-image:radial-gradient(rgb(23_23_23/0.06)_1px,transparent_1.3px)] [background-size:16px_16px] [mask-image:radial-gradient(ellipse_at_top,#000,transparent_70%)]" />
      <StateStage><Icon3D icon={PackageSearch} size="lg" /></StateStage>
      <h2 className="relative text-lg font-semibold">{title}</h2>
      {children && <p className="relative mt-2 max-w-md text-sm text-muted">{children}</p>}
      {action && (
        <Link href={action.href} className="btn-primary relative mt-6 shadow-[0_10px_24px_-8px_rgb(255_92_0/0.6)]">
          {action.label}
        </Link>
      )}
    </div>
  );
}

export function ErpUnavailable({ retryHref }: { retryHref?: string }) {
  return (
    <div role="alert" className="card group flex flex-col items-center border-warn/30 bg-warn-bg px-6 py-14 text-center">
      <StateStage><Icon3D icon={AlertTriangle} tone="glass" size="lg" /></StateStage>
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
    <div className="card group flex flex-col items-center px-6 py-14 text-center">
      <StateStage><Icon3D icon={CircleCheck} tone="glass" size="lg" /></StateStage>
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
    <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5" role="status" aria-label="Loading products">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-xl border border-border bg-bg shadow-card">
          <Skeleton className="aspect-[4/3] w-full rounded-none" />
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
