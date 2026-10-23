import { Skeleton } from "@/components/ui/states";

export default function Loading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" aria-label="Loading cart">
      <Skeleton className="h-8 w-48" />
      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_22rem]">
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    </div>
  );
}
