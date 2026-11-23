import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { CatalogueImage } from "@/components/products/catalogue-image";

export interface BrandTileData {
  name: string;
  count: number;
  /** A real product photo from this brand's catalogue range. */
  image?: string;
  /** Logo uploaded by staff in the admin. When there is none the brand name stands alone: no logo is ever invented. */
  logo?: string;
}

/** Brand filtering uses the catalogue's own `brand` query, so the shop's existing product listing shows the brand's products. */
export const brandHref = (name: string) => `/products?brand=${encodeURIComponent(name)}`;

/** One brand: a real product photo, the staff logo when there is one, the name and how many products the catalogue holds. */
export function BrandTile({ brand }: { brand: BrandTileData }) {
  const label = `${brand.count} ${brand.count === 1 ? "product" : "products"}`;
  return (
    <Link
      href={brandHref(brand.name)}
      aria-label={`${brand.name}, ${label}`}
      className="group flex h-full flex-col overflow-hidden rounded-[1.75rem] bg-surface p-2 transition-colors duration-300 hover:bg-[#ececec] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 motion-reduce:transition-none"
    >
      <span className="relative block aspect-[5/4] overflow-hidden rounded-[1.25rem] bg-white">
        <span className="absolute inset-0 transition-transform duration-500 ease-out group-hover:scale-[1.05] motion-reduce:transition-none">
          <CatalogueImage src={brand.image} alt="" sizes="(min-width:1024px) 22vw, (min-width:640px) 30vw, 62vw" padding="p-5" />
        </span>
        {brand.logo && (
          // eslint-disable-next-line @next/next/no-img-element -- staff-uploaded logo served by our own route; no optimiser needed
          <img src={brand.logo} alt="" loading="lazy" className="absolute left-3 top-3 h-7 w-20 object-contain object-left" />
        )}
      </span>
      <span className="flex items-center justify-between gap-3 px-3 pb-3 pt-3.5">
        <span className="min-w-0">
          <span className="block truncate text-xl font-bold leading-tight tracking-[-0.03em] text-ink">{brand.name}</span>
          <span className="mt-0.5 block text-xs text-muted">{label}</span>
        </span>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-white transition-colors group-hover:bg-brand-500 group-hover:text-on-brand">
          <ArrowUpRight className="h-4 w-4" aria-hidden />
        </span>
      </span>
    </Link>
  );
}
