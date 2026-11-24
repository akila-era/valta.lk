import type { Metadata } from "next";
import { NotFoundContent } from "@/components/ui/not-found-content";

export const metadata: Metadata = { title: "Page not found", robots: { index: false } };

/** notFound() inside a store page (unknown product, order or category): the store layout already provides the shell. */
export default function StoreNotFound() {
  return <NotFoundContent />;
}
