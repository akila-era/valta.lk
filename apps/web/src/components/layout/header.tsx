import Link from "next/link";
import { Headset, Truck, Wallet } from "lucide-react";
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
    <Link href="/" className={`inline-flex items-baseline font-display font-extrabold tracking-[-0.02em] ${className}`} aria-label="VALTA.LK home">
      <span aria-hidden>V</span>
      <span aria-hidden className="text-brand-500">Λ</span>
      <span aria-hidden>LTA</span>
      <span aria-hidden className="text-[0.82em] font-extrabold">.LK</span>
    </Link>
  );
}

export async function Header() {
  const accounts = accountsEnabled();
  const [{ categories, hasDeals }, customer, settings] = await Promise.all([
    loadNavData(),
    accounts ? getCurrentCustomer() : null,
    getSettings().catch(() => null),
  ]);
  const cod = settings?.paymentMethods.COD === true;
  return (
    <>
      {/* Slim announcement bar: the owner's SITE_ANNOUNCEMENT plus facts from live ERP settings only. It scrolls away. */}
      <div className={`border-b border-border bg-surface text-muted ${siteConfig.announcement ? "" : "hidden sm:block"}`}>
        <div className="container-wide flex h-9 items-center justify-between gap-6 text-xs">
          <ul className="flex min-w-0 items-center gap-3 divide-x divide-border [&>li+li]:pl-3">
            {siteConfig.announcement ? <li className="truncate font-medium text-ink">{siteConfig.announcement}</li> : null}
            {settings ? (
              <li className="hidden shrink-0 items-center gap-1.5 sm:flex">
                <Truck className="h-3.5 w-3.5 text-brand-500" aria-hidden /> Delivery {formatLkr(settings.deliveryCharge)}
              </li>
            ) : null}
            {cod ? (
              <li className="hidden shrink-0 items-center gap-1.5 md:flex">
                <Wallet className="h-3.5 w-3.5 text-brand-500" aria-hidden /> Cash on Delivery Available
              </li>
            ) : null}
          </ul>
          <nav aria-label="Help" className="hidden shrink-0 items-center gap-3 divide-x divide-border md:flex [&>*+*]:pl-3">
            {siteConfig.phone ? <a href={`tel:${siteConfig.phone.replace(/\s/g, "")}`} className="rounded-sm hover:text-ink">{siteConfig.phone}</a> : null}
            <Link href="/track-order" className="rounded-sm hover:text-ink">Track order</Link>
            <Link href="/contact" className="rounded-sm hover:text-ink">Help</Link>
            <Link href="/about" className="rounded-sm hover:text-ink">About Us</Link>
          </nav>
        </div>
      </div>
      <HeaderShell>
        <div className="container-wide flex flex-wrap items-center gap-x-3 gap-y-2.5 py-3 md:grid md:h-[4.5rem] md:grid-cols-[auto_minmax(0,1fr)_auto] md:gap-x-10 md:py-0">
          <MobileMenu categories={categories} hasDeals={hasDeals} />
          <Wordmark className="text-[1.6rem] text-ink md:text-[2.25rem]" />
          <div className="order-last w-full md:order-none">
            <SearchBox size="lg" />
          </div>
          <div className="ml-auto flex items-center md:ml-0 md:divide-x md:divide-border">
            <Link href="/contact" className="hidden items-center gap-2 px-3 text-sm font-medium hover:text-brand-600 lg:inline-flex">
              <Headset className="h-5 w-5" strokeWidth={1.5} aria-hidden /> Support
            </Link>
            {/* Track order lives in the announcement bar, so the main row only adds the account menu when accounts exist. */}
            {accounts ? <AccountMenu customer={customer ? { name: customer.name } : null} enabled /> : null}
            <WishlistLink />
            <div className="md:pl-5"><CartLink /></div>
          </div>
        </div>
        <Suspense fallback={null}>
          <CategoryNav categories={categories} showDeals={hasDeals} />
        </Suspense>
      </HeaderShell>
    </>
  );
}
