import type { Metadata } from "next";
import { StoreShell } from "@/components/layout/store-shell";
import { NotFoundContent } from "@/components/ui/not-found-content";

export const metadata: Metadata = { title: "Page not found", robots: { index: false } };

/** Unknown URLs: rendered in the root layout only, so it brings the store header and footer to keep visitors moving. */
export default function NotFound() {
  return (
    <StoreShell>
      <NotFoundContent />
    </StoreShell>
  );
}
