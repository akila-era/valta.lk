import type { Metadata } from "next";
import { Reveal } from "@/components/home/reveal";
import { Countdown } from "@/components/home/countdown";
import { Newsletter } from "@/components/home/newsletter";
import { SocialFeed } from "@/components/home/social-feed";
import { VideoShowcase } from "@/components/home/video-showcase";
import { homeVideos } from "@/lib/videos";
import { activeSocialPosts } from "@/lib/home-extras";
import { resolveHotDeals } from "@/lib/hot-deals";
import { socialLinks } from "@/lib/home-config";
import { CategoryIcons } from "@/components/home/category-icons";
import { BannerHero } from "@/components/home/banner-hero";
import { HotDeals } from "@/components/home/hot-deals";
import { ArrivalsTabs } from "@/components/home/arrivals-tabs";
import { PromoBanner } from "@/components/home/promo-banner";
import { FeaturedCarousel } from "@/components/home/featured-carousel";
import { CategoryBento } from "@/components/home/category-bento";
import { CategoryShowcase, pickShowcase } from "@/components/home/category-showcase";
import { Reviews } from "@/components/home/reviews";
import { RecentlyViewed } from "@/components/home/recently-viewed";
import { BrandLogos, ContactBlock, JoinStrip, WhyChoose } from "@/components/home/storefront-blocks";
import { AiChatSection } from "@/components/home/ai-chat-section";
import { TrustStrip } from "@/components/home/trust-strip";
import { ErpUnavailable } from "@/components/ui/states";
import { BRAND_NAME } from "@/lib/brand";
import { getHomeData } from "@/lib/home-data";

export const metadata: Metadata = {
  title: { absolute: `${BRAND_NAME} | Mobile phones, electronics & accessories in Sri Lanka` },
  description: `Shop mobile phones, chargers, smart watches and accessories at ${BRAND_NAME}. Prices in LKR, cash on delivery, island-wide delivery.`,
  alternates: { canonical: "/" },
  openGraph: {
    title: `${BRAND_NAME} | Phones, electronics & accessories`,
    description: `Shop phones, chargers, smart watches and accessories at ${BRAND_NAME}.`,
    url: "/",
    type: "website",
  },
};

export default async function HomePage() {
  const [data, videos, social] = await Promise.all([getHomeData(), homeVideos(), activeSocialPosts()]);
  if (!data.catalogueOk) {
    return (
      <div className="container-page">
        <div className="mt-10">
          <ErpUnavailable retryHref="/" />
        </div>
      </div>
    );
  }
  const featured = data.featured.filter((p) => p.available);
  const hot = await resolveHotDeals(data.offers);
  const showcase = pickShowcase(data.rails);
  return (
    <>
      <BannerHero data={data} />
      <TrustStrip checkout={data.checkout} />
      <AiChatSection />
      <CategoryIcons categories={data.categories} />
      <Reveal><ArrivalsTabs products={data.newArrivals} /></Reveal>
      {hot.enabled && <Reveal><HotDeals products={hot.products} title={hot.title} subtitle={hot.subtitle} timer={hot.endsAt ? <Countdown endsAt={hot.endsAt} label={hot.label} /> : undefined} /></Reveal>}
      <Reveal><PromoBanner data={data} /></Reveal>
      <Reveal><BrandLogos brands={data.brands} /></Reveal>
      <Reveal><Reviews /></Reveal>
      <Reveal><CategoryShowcase rail={showcase} /></Reveal>
      <Reveal><CategoryBento categories={data.categories} /></Reveal>
      <Reveal>{featured.length >= 4 ? <FeaturedCarousel products={featured} /> : <FeaturedCarousel products={data.more} title="More Products" />}</Reveal>
      <Reveal><WhyChoose cod={data.checkout.cod} /></Reveal>
      <div className="container-page">
        <RecentlyViewed />
      </div>
      <Reveal><SocialFeed posts={social} profiles={socialLinks().filter((l) => l.label === "Instagram" || l.label === "TikTok")} /></Reveal>
      <Reveal><VideoShowcase title={videos.title} videos={videos.items} /></Reveal>
      <Reveal><Newsletter /></Reveal>
      <Reveal><ContactBlock /></Reveal>
      <Reveal><JoinStrip /></Reveal>
    </>
  );
}
