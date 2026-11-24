import type { Metadata } from "next";
import { Hero, type HeroSlide } from "@/components/home/hero";
import { CategoryTiles } from "@/components/home/home-sections";
import { Collections } from "@/components/home/collections";
import { NewArrivals, SpecialOffers, StaffPicks } from "@/components/home/product-sections";
import { Assurances, SupportSection } from "@/components/home/support-assurance";
import { TrustStrip } from "@/components/home/trust-strip";
import { BrandShowcase } from "@/components/home/brand-showcase";
import { BudgetShortcuts, FinalCta, HowItWorks, WhyChoose } from "@/components/home/journey-sections";
import { Faq } from "@/components/home/more-sections";
import { RecentlyViewed } from "@/components/home/recently-viewed";
import { StaffBanners, WideBanner } from "@/components/home/sections";
import { VideoShowcase } from "@/components/home/video-showcase";
import { ErpUnavailable } from "@/components/ui/states";
import type { ErpProduct } from "@/lib/erp/types";
import { getHomeData } from "@/lib/home-data";

export const metadata: Metadata = {
  title: { absolute: "VALTA.LK | Mobile phones, electronics & accessories in Sri Lanka" },
  description: "Discover mobile phones, electronics and everyday essentials at VALTA.LK. Prices in LKR, cash on delivery.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "VALTA.LK | Technology that moves you",
    description: "Discover mobile phones, electronics and everyday essentials at VALTA.LK.",
    url: "/",
    type: "website",
  },
};

export default async function HomePage() {
  const data = await getHomeData();
  const withImage = (list: ErpProduct[]) => list.find((p) => p.available && p.images.length > 0);
  // Up to three distinct, in-stock, photographed products for the hero: staff-featured, newest, and one with a real sale price.
  const used = new Set<string>();
  const heroSlides: HeroSlide[] = [];
  const addSlide = (list: ErpProduct[], kind: HeroSlide["kind"]) => {
    const product = withImage(list.filter((p) => !used.has(p.id)));
    if (product) {
      used.add(product.id);
      heroSlides.push({ product, kind });
    }
  };
  addSlide(data.featured, "featured");
  addSlide(data.newArrivals, "new");
  addSlide(data.offers, "offer");
  if (heroSlides.length < 3) addSlide(data.newArrivals, "new");
  if (!heroSlides.length) addSlide(data.more, "new");
  // Distinct real products with photos, reused as supporting imagery further down the page.
  const photographed = [...data.newArrivals, ...data.more, ...data.featured].filter(
    (p, i, all) => p.available && p.images.length > 0 && !used.has(p.id) && all.findIndex((x) => x.id === p.id) === i,
  );
  const hasBrands = data.brands.filter((b) => b.count > 0).length >= 2;
  return (
    <>
      <Hero
        brandsHref={hasBrands ? "/brands" : undefined}
        slides={heroSlides}
      />
      {data.catalogueOk && <TrustStrip checkout={data.checkout} />}
      {data.catalogueOk ? (
        <div className="container-page pb-10 sm:pb-16">
          <CategoryTiles categories={data.categories} />
          <BrandShowcase brands={data.brands} />
          <NewArrivals products={data.newArrivals} />
          <SpecialOffers offers={data.offers.filter((p) => p.available)} />
          <Collections data={data} from={0} to={1} />
          <StaffPicks products={data.featured} />
          <Collections data={data} from={1} to={2} />
          <BudgetShortcuts picks={data.budgetPicks} />
          <Collections data={data} from={2} to={3} />
          <WhyChoose checkout={data.checkout} photos={photographed.slice(3, 6)} />
          <Assurances />
          <RecentlyViewed />
          {data.bannersFromStaff && (
            <div className="mt-16 sm:mt-24">
              <StaffBanners banners={data.banners} />
            </div>
          )}
          <WideBanner banners={data.wideBanners} />
          <HowItWorks checkout={data.checkout} photos={photographed.slice(6, 9).concat(photographed.slice(0, 3)).slice(0, 3)} />
          <VideoShowcase title={data.videos.title} videos={data.videos.items} />
          <SupportSection />
          <Faq checkout={data.checkout} />
          <FinalCta total={data.totalProducts} />
        </div>
      ) : (
        <div className="container-page pb-10 sm:pb-14">
          <div className="mt-14">
            <ErpUnavailable retryHref="/" />
          </div>
          <Faq checkout={data.checkout} />
        </div>
      )}
    </>
  );
}
