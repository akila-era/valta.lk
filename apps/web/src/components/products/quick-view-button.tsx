"use client";

import { Eye } from "lucide-react";
import { uiActions } from "@/store/ui";

/** "Quick view" trigger for product cards. Opens the shared modal mounted once in the store shell. */
export function QuickViewButton({ slug, name, className = "" }: { slug: string; name: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={() => uiActions.openQuickView(slug)}
      aria-label={`Quick view: ${name}`}
      className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md border border-border bg-white px-3 text-[13px] font-semibold text-ink transition-colors hover:border-ink ${className}`}
    >
      <Eye className="h-4 w-4" aria-hidden />
      Quick view
    </button>
  );
}
