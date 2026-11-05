"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { X } from "lucide-react";
import { compareActions, compareHref, useCompare } from "@/store/compare";

/** /compare without a list in its address: open the list saved in this browser (if any). */
export function CompareFromStorage() {
  const router = useRouter();
  const { items } = useCompare();
  useEffect(() => {
    if (items.length) router.replace(compareHref(items));
  }, [items, router]);
  return null;
}

/** Removes one product from the comparison (and from the list saved in this browser). */
export function CompareRemove({ productId, name, slugs }: { productId: string; name: string; slugs: string[] }) {
  const router = useRouter();
  return (
    <button
      type="button"
      aria-label={`Remove ${name} from compare`}
      onClick={() => {
        compareActions.remove(productId);
        const rest = slugs.filter(Boolean);
        router.replace(rest.length ? `/compare?p=${rest.map(encodeURIComponent).join(",")}` : "/compare");
      }}
      className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-bg text-muted transition-colors hover:border-ink hover:text-ink"
    >
      <X className="h-4 w-4" aria-hidden />
    </button>
  );
}
