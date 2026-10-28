"use client";

import { usePathname } from "next/navigation";

/**
 * The page area of the store shell. The homepage lays out its own full-width bands; every other page sits in the
 * centred container. One component for both (instead of two layouts) keeps the header, footer and bars mounted when
 * going between the homepage and other pages, so only the page itself animates. The elements are the same on both, only
 * the class differs, so nothing is re-created on the way. overflow-x-clip: full-bleed bands may extend past the container
 * without ever causing a sideways scroll; there is no stacking context here, so phone drawers and dialogs inside the page
 * (filters, confirmations) open above the sticky header and the tab bar.
 */
export function ShellMain({ children }: { children: React.ReactNode }) {
  const home = usePathname() === "/";
  return (
    <div className="relative overflow-x-clip">
      <main id="main" className={home ? undefined : "container-page py-5 sm:py-6"}>
        {children}
      </main>
    </div>
  );
}
