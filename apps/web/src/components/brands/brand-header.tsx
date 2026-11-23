import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CatalogueImage } from "@/components/products/catalogue-image";

/**
 * Introduction for a brand's product list. Everything shown is catalogue data: the brand name, how many products carry it
 * and one of its real product photos. The logo is shown only when staff uploaded one.
 */
export function BrandHeader({ name, count, image, logo }: { name: string; count: number; image?: string; logo?: string }) {
  return (
    <header className="mb-8 overflow-hidden rounded-[1.75rem] bg-surface">
      <div className="grid items-center gap-6 p-5 sm:p-8 md:grid-cols-[minmax(0,1fr)_15rem] lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Brand</p>
          {logo && (
            // eslint-disable-next-line @next/next/no-img-element -- staff-uploaded logo served by our own route; no optimiser needed
            <img src={logo} alt="" className="mt-3 h-10 w-auto max-w-[12rem] object-contain object-left" />
          )}
          <h1 className="page-title mt-2">{name}</h1>
          <p className="type-meta mt-2">{count} {count === 1 ? "product" : "products"} from {name} in the catalogue.</p>
          <Link href="/brands" className="group mt-5 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-ink underline-offset-4 hover:text-brand-600 hover:underline">
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5 motion-reduce:transition-none" aria-hidden /> All brands
          </Link>
        </div>
        {image && (
          <div className="relative hidden aspect-[4/3] overflow-hidden rounded-2xl bg-white md:block" aria-hidden>
            <CatalogueImage src={image} alt="" sizes="(min-width:1024px) 20rem, 15rem" padding="p-6" />
          </div>
        )}
      </div>
    </header>
  );
}
