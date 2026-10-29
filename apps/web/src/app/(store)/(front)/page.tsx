import { DealCountdown } from "@/components/home/deal-countdown";
import type { Metadata } from "next";
import { Faq } from "@/components/home/more-sections";
import { BrandWall, CategoryGrid, FeatureSplit, HomeHero, ProductSection, PromoTiles, RangeTabs, Reviews, ServiceStrip, Spotlight, WhyChoose, featureArt } from "@/components/home/storefront";
import { categoryVisual } from "@/components/home/category-art";
import { VideoShowcase } from "@/components/home/video-showcase";
import { ErpUnavailable } from "@/components/ui/states";
import { getHomeData } from "@/lib/home-data";

export const metadata: Metadata = {
  title: { absolute: "VOLTA.LK | Mobile phones, electronics & accessories in Sri Lanka" },
  description: "Discover mobile phones, electronics and everyday essentials at VOLTA.LK. Prices in LKR, cash on delivery.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "VOLTA.LK | Technology that moves you",
    description: "Discover mobile phones, electronics and everyday essentials at VOLTA.LK.",
    url: "/",
    type: "website",
  },
};

/**
 * The homepage as a retail storefront: the banner slider (staff banners first), the service strip, the category row
 * (moved with arrows), spotlight tiles, most popular (from website orders), brands, staff offers, hot deals, one
 * collection per larger category, new arrivals, why choose us, customer reviews (owner-configured), videos and the
 * FAQ. Every section comes from live data and is left out when it has nothing to show.
 */
export default async function HomePage() {
  const data = await getHomeData();
  // One larger category gets the split banner + products block: preferably one the two Spotlight tiles do not show
  // already, and only a kind of category with a campaign photograph. The other larger categories become tabs.
  const spotlit = new Set([...data.categories].filter((c) => categoryVisual(c.name)).sort((a, b) => b.count - a.count).slice(0, 2).map((c) => c.slug));
  const withArt = data.rails.filter((r) => featureArt(r.name) && r.products.length >= 2);
  const featured = withArt.find((r) => !spotlit.has(r.slug)) ?? withArt[0] ?? null;
  const tabRails = data.rails.filter((r) => r !== featured);
  const deals = data.hotDeals.filter((p) => p.available);

  return (
    <div className="pb-4">
      {/* The first screen: banner and service strip fill exactly the space under the header (and above the phone tab
          bar), so "Shop by Category" starts below the fold. Capped so very tall screens do not get a giant banner. */}
      <div className="flex min-h-[min(calc(100svh-2.25rem-var(--hdr-sticky,7.5rem)-4.5rem),52rem)] flex-col md:min-h-[min(calc(100svh-2.25rem-var(--hdr-sticky,7.25rem)),56rem)]">
        <HomeHero categories={data.categories} banners={data.wideBanners} />
        <ServiceStrip checkout={data.checkout} />
      </div>
      {data.catalogueOk ? (
        <>
          <CategoryGrid categories={data.categories} />
          <Spotlight categories={data.categories} />
          <ProductSection id="popular" eyebrow="Customer favourites" title="Most Popular" text="The products ordered most on VOLTA.LK in the last 90 days." href="/products" products={data.popular} />
          <BrandWall brands={data.brands} />
          {data.staffBanners ? <PromoTiles banners={data.banners.slice(0, 4)} /> : null}
          <ProductSection
            id="deals"
            eyebrow="Price drops"
            title="Hot Deals"
            text={data.hotDealsCurated ? "Picked by the VOLTA team. Prices and stock are live from our catalogue." : "Current price reductions in our catalogue."}
            href="/products?sale=1"
            products={deals}
            priority
            aside={data.hotDealsEndAt ? <DealCountdown endsAt={data.hotDealsEndAt} /> : null}
          />
          {featured ? <FeatureSplit rail={featured} /> : null}
          <RangeTabs newArrivals={data.newArrivals} rails={tabRails} tinted />
          <WhyChoose checkout={data.checkout} />
          <Reviews title={data.reviews.title} reviews={data.reviews.items} />
          <div className="container-page">
            <VideoShowcase title={data.videos.title} videos={data.videos.items} />
          </div>
        </>
      ) : (
        <div className="container-page mt-12">
          <ErpUnavailable retryHref="/" />
        </div>
      )}
      <div className="container-page mt-12 sm:mt-16">
        <Faq checkout={data.checkout} />
      </div>
    </div>
  );
}
