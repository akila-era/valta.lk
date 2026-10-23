import { ProductGridSkeleton, Skeleton } from "@/components/ui/states";

export default function Loading() {
  return (
    <div className="py-2">
      <Skeleton className="mb-6 h-8 w-48" />
      <div className="grid gap-8 lg:grid-cols-[16rem_1fr]">
        <Skeleton className="hidden h-64 lg:block" />
        <ProductGridSkeleton />
      </div>
    </div>
  );
}
