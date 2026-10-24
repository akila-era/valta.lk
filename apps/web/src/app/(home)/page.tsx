import type { Metadata } from "next";
import { Hero } from "@/components/home/hero";
import { BestDeals, CategoryTiles, TabbedShowcase } from "@/components/home/home-sections";
import { VideoShowcase } from "@/components/home/video-showcase";
import { PromoBanners, WideBanner } from "@/components/home/sections";
import { Faq, WhyChoose } from "@/components/home/more-sections";
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
          {/* A short page: categories, real deals and the product collections, then trust and answers. Staff banners,
              wide banners and videos appear only when they are configured in the admin or environment. */}
          <div className="container-page pb-10 sm:pb-14">
            {/* Second screen: categories and deals together fill exactly one screen below the sticky header. */}
            <div className="flex min-h-[calc(100svh-var(--hdr-sticky,8.5rem))] flex-col gap-5 py-5 [&>section]:mt-0">
              <CategoryTiles categories={data.categories} />
              <BestDeals products={data.hotDeals} curated={data.hotDealsCurated} />
            </div>
            <TabbedShowcase data={data} tab={tab ?? "new"} />
            {data.banners.length > 0 && <PromoBanners banners={data.banners} />}
            <WideBanner banners={data.wideBanners} />
            <WhyChoose checkout={data.checkout} />
            <VideoShowcase title={data.videos.title} videos={data.videos.items} />
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
