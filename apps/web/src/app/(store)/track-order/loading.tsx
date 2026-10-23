import { Skeleton } from "@/components/ui/states";

export default function Loading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" aria-label="Loading order tracking" className="mx-auto max-w-2xl space-y-4">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-28 w-full" />
    </div>
  );
}
