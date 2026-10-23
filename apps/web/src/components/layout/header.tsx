import Link from "next/link";
import { Headset, MapPin, PackageSearch, Truck, Wallet } from "lucide-react";
import { Suspense } from "react";
import { listBrands, listProducts } from "@/lib/erp/catalogue";
import { getSettings } from "@/lib/erp/settings";
import { siteConfig } from "@/lib/site-config";
import { formatLkr } from "@/lib/utils/money";
import { accountsEnabled, getCurrentCustomer } from "@/lib/auth/session";
import { AccountMenu } from "./account-menu";
import { CartLink } from "./cart-link";
import { WishlistLink } from "./wishlist-link";
import { CategoryNav } from "./category-nav";
import { HeaderShell } from "./header-shell";
import { MobileMenu } from "./mobile-menu";
import { SearchBox } from "./search-box";

async function loadNavData() {
  try {
    const [cats, deals, brands] = await Promise.all([listProducts({ pageSize: 1 }), listProducts({ pageSize: 1, onSale: true }), listBrands()]);
    // "Popular" = the biggest brands and categories in the catalogue (we have no search-history data)
    const quick = [
      ...brands.slice(0, 4).map((b) => ({ label: b.name, href: `/search?q=${encodeURIComponent(b.name)}` })),
      ...[...cats.categories].sort((a, b) => b.count - a.count).slice(0, 3).map((c) => ({ label: c.name, href: `/categories/${c.slug}` })),
    ];
    return { categories: cats.categories.map((c) => ({ slug: c.slug, name: c.name, subs: c.subs.map((x) => ({ slug: x.slug, name: x.name })) })), hasDeals: deals.total > 0, hasBrands: brands.length > 0, quick };
  } catch {
    return { categories: [], hasDeals: false, hasBrands: false, quick: [] }; // the header must still render when the ERP is unreachable
  }
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`inline-flex items-baseline font-black tracking-tight text-ink ${className}`} aria-label="VALTA.LK home">
      <span aria-hidden>V</span>
      <span aria-hidden className="text-brand-500">Λ</span>
      <span aria-hidden>LTA</span>
      <span aria-hidden className="text-[0.82em] font-extrabold">.LK</span>
    </Link>
  );
}

export async function Header() {
  const accounts = accountsEnabled();
  const [{ categories, hasDeals, hasBrands }, customer, settings] = await Promise.all([
    loadNavData(),
    accounts ? getCurrentCustomer() : null,
    getSettings().catch(() => null),
  ]);
  const note = siteConfig.announcement || siteConfig.highlights[0] || "Prices and availability are checked again at checkout.";
  const cod = settings?.paymentMethods.COD === true;
  return (
    <>
      <HeaderShell>
        <div className="hidden border-b border-white/10 bg-ink text-white md:block">
          <div className="container-wide flex h-10 items-center justify-between gap-6 text-xs">
            <ul className="flex min-w-0 items-center gap-4">
              <li className="flex min-w-0 items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-brand-500" aria-hidden />
                <span className="truncate">{note}</span>
              </li>
              {settings ? (
                <li className="flex shrink-0 items-center gap-1.5">
                  <Truck className="h-3.5 w-3.5 text-brand-500" aria-hidden />
                  Delivery {formatLkr(settings.deliveryCharge)}
                </li>
              ) : null}
              {cod ? (
                <li className="flex shrink-0 items-center gap-1.5">
                  <Wallet className="h-3.5 w-3.5 text-brand-500" aria-hidden />
                  Cash on delivery
                </li>
              ) : null}
              <li>
                <Link href="/contact" className="flex items-center gap-1.5 rounded-sm hover:text-brand-500">
                  <Headset className="h-3.5 w-3.5 text-brand-500" aria-hidden /> Customer Support
                </Link>
              </li>
            </ul>
            <nav aria-label="Help" className="flex shrink-0 items-center gap-4">
              {siteConfig.phone ? <a href={`tel:${siteConfig.phone}`} className="rounded-sm hover:text-brand-500">{siteConfig.phone}</a> : null}
              <Link href="/track-order" className="rounded-sm hover:text-brand-500">Track Order</Link>
              {siteConfig.address ? <Link href="/contact" className="rounded-sm hover:text-brand-500">Visit</Link> : null}
            </nav>
          </div>
        </div>
        <div className="container-wide flex flex-wrap items-center gap-x-3 gap-y-2.5 py-3 md:grid md:h-20 md:grid-cols-[auto_minmax(0,1fr)_auto] md:gap-x-10 md:py-0">
          <MobileMenu categories={categories} hasDeals={hasDeals} />
          <Wordmark className="text-[1.6rem] md:text-[2.1rem]" />
          <div className="order-last w-full md:order-none">
            <SearchBox size="lg" />
          </div>
          <div className="ml-auto flex items-center md:ml-0 md:divide-x md:divide-border">
            <Link href="/contact" className="hidden items-center gap-2 px-3 text-sm font-medium hover:text-brand-600 lg:inline-flex">
              <Headset className="h-5 w-5" strokeWidth={1.5} aria-hidden /> Support
            </Link>
            {accounts ? (
              <AccountMenu customer={customer ? { name: customer.name } : null} enabled />
            ) : (
              <Link href="/track-order" className="hidden items-center gap-2 pr-5 text-sm font-medium hover:text-brand-600 lg:inline-flex">
                <PackageSearch className="h-5 w-5" strokeWidth={1.5} aria-hidden /> Track Order
              </Link>
            )}
            <WishlistLink />
            <div className="md:pl-5"><CartLink /></div>
          </div>
        </div>
        <Suspense fallback={null}>
          <CategoryNav categories={categories} showDeals={hasDeals} showBrands={hasBrands} />
        </Suspense>
      </HeaderShell>
    </>
  );
}
