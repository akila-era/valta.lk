import { ProductGridSkeleton, Skeleton } from "@/components/ui/states";

export default function Loading() {
  return (
    <div className="container-page py-10">
      <Skeleton className="mb-6 h-8 w-56" />
      <ProductGridSkeleton />
    </div>
  );
}
