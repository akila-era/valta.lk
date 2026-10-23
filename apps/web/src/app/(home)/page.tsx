import type { Metadata } from "next";
import { Hero } from "@/components/home/hero";
import { AccessoryShelf, CategoryTiles, MoreProducts, TabbedShowcase } from "@/components/home/home-sections";
import { VideoShowcase } from "@/components/home/video-showcase";
import { BrandStrip, PromoBanners, WideBanner } from "@/components/home/sections";
import { BudgetShortcuts, Faq, HowItWorks, WhyChoose } from "@/components/home/more-sections";
import { ErpUnavailable } from "@/components/ui/states";
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

export default async function HomePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const [{ tab }, data] = await Promise.all([searchParams, getHomeData()]);
  return (
    <>
      <Hero
        phonesHref={data.phonesSlug ? `/categories/${data.phonesSlug}` : undefined}
        accessoriesHref={(() => {
          const g = data.categories.find((c) => /accessor/i.test(c.name));
          return g ? `/categories/${g.slug}` : undefined;
        })()}
        cod={data.checkout.cod}
        deliveryCharge={data.checkout.deliveryCharge}
      />
      {data.catalogueOk ? (
        <>
          <div className="container-page">
            <CategoryTiles categories={data.categories} />
            <BrandStrip brands={data.brands} compact />
            <TabbedShowcase data={data} tab={tab ?? "new"} />
            <AccessoryShelf rail={data.rails.find((r) => /accessor/i.test(r.name))} />
            <PromoBanners banners={data.banners} />
            <MoreProducts products={data.more} />
          </div>
          {/* Light-grey band separates browsing sections from the brand and budget shortcuts */}
          {data.budget && (
            <div className="mt-14 bg-surface py-12 sm:mt-20 sm:py-16">
              <div className="container-page space-y-14 sm:space-y-20">
                <BudgetShortcuts budget={data.budget} />
              </div>
            </div>
          )}
          <div className="container-page pb-10 sm:pb-14">
            <WideBanner banners={data.wideBanners} />
            <WhyChoose checkout={data.checkout} />
            <VideoShowcase title={data.videos.title} videos={data.videos.items} />
            <HowItWorks checkout={data.checkout} />
            <Faq checkout={data.checkout} />
          </div>
        </>
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
