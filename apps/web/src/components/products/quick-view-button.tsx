"use client";

import { Eye } from "lucide-react";
import { uiActions } from "@/store/ui";

/** Small "Quick view" trigger for product cards. Opens the shared modal mounted once in the store shell. */
export function QuickViewButton({ slug, name }: { slug: string; name: string }) {
  return (
    <button
      type="button"
      onClick={() => uiActions.openQuickView(slug)}
      aria-label={`Quick view: ${name}`}
      className="flex min-h-11 w-11 flex-none items-center justify-center bg-bg/95 px-0 last:w-auto last:flex-1 text-xs font-bold uppercase tracking-[0.08em] text-ink backdrop-blur transition-colors hover:bg-white"
    >
      <Eye className="h-4 w-4" aria-hidden />
      {/* The text only shows when Quick view is the card's only action (options products), where there is room. */}
      <span className="hidden whitespace-nowrap [button:last-child_&]:ml-2 [button:last-child_&]:inline">Quick view</span>
    </button>
  );
}
