import type { ReactNode } from "react";
import { InfoNav } from "./info-nav";

/**
 * Information pages (policies, About, Track order) across the full width: the list of information pages on the left
 * (chips on phones), the page itself beside it.
 */
export function InfoLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-12 xl:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="min-w-0 lg:sticky lg:top-[calc(var(--hdr-sticky,7rem)+1.5rem)] lg:self-start lg:border-r lg:border-border lg:pr-6">
        <InfoNav />
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
