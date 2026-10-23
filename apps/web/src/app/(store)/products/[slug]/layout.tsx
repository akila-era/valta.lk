import { notFound } from "next/navigation";
import { getProductBySlug } from "@/lib/erp/catalogue";

/**
 * Runs outside the product view's loading boundary, so a missing product can return HTTP 404.
 * The page itself still renders the not-found screen. An ERP outage is left for the page to explain.
 */
export default async function ProductLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  try {
    const product = await getProductBySlug((await params).slug);
    if (!product) notFound();
  } catch {
    /* The page shows that the catalogue could not be loaded. */
  }
  return children;
}
