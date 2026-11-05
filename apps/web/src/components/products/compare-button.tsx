"use client";

import Link from "next/link";
import { ArrowLeftRight } from "lucide-react";
import { compareActions, compareHref, MAX_COMPARE, useCompare, type CompareItem } from "@/store/compare";

/** "Compare" on the product page (as on ugreen.lk): adds the product to the compare list, with a link to it. */
export function CompareButton({ item }: { item: CompareItem }) {
  const { has, count, items } = useCompare();
  const on = has(item.productId);
  return (
    <span className="inline-flex items-center gap-3 text-sm">
      <button
        type="button"
        onClick={() => compareActions.toggle(item)}
        aria-pressed={on}
        className={`inline-flex min-h-9 items-center gap-1.5 font-semibold transition-colors hover:text-ink ${on ? "text-ink" : "text-muted"}`}
      >
        <ArrowLeftRight className="h-4 w-4" aria-hidden />
        {on ? "Added to compare" : "Compare"}
      </button>
      {count > 0 ? (
        <Link href={compareHref(items)} className="font-semibold text-ink underline underline-offset-2">
          View compare ({count}/{MAX_COMPARE})
        </Link>
      ) : null}
    </span>
  );
}
