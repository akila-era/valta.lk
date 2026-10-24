import type { Metadata } from "next";
import { Fragment, type ReactNode } from "react";
import { Hero } from "@/components/home/hero";
import { HeroSlides } from "@/components/home/hero-slides";
import { BestDeals, CategoryTiles, TabbedShowcase } from "@/components/home/home-sections";
import { VideoShowcase } from "@/components/home/video-showcase";
import { PromoBanners, WideBanner } from "@/components/home/sections";
import { Faq, WhyChoose } from "@/components/home/more-sections";
import { Accent, Chapter } from "@/components/home/story/chapter";
import { ChapterRail } from "@/components/home/story/chapter-rail";
import { MarqueeBand } from "@/components/home/story/marquee-band";
import { ScrollExpand } from "@/components/home/story/scroll-expand";
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

interface StoryChapter {
  id: string;
  label: string;
  statement: ReactNode;
  aside?: ReactNode;
  content: ReactNode;
}

/**
 * The homepage as a scroll story: the hero is chapter 01, then numbered chapters, each a large statement over its
 * content, with a fixed chapter rail on wide screens. Chapters without content (no deals today) are left out and the
 * numbering follows.
 */
export default async function HomePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const [{ tab }, data] = await Promise.all([searchParams, getHomeData()]);
  const accessories = data.categories.find((c) => /accessor/i.test(c.name));

  const lifestyle: StoryChapter = {
    id: "story-lifestyle",
    label: "Everyday tech",
    statement: (
      <>
        Made for <Accent>every day</Accent>.
      </>
    ),
    aside: "Laptops for work, phones for everything, and the accessories that keep them going.",
    content: (
      <ScrollExpand className="scroll-expand relative h-[clamp(18rem,62svh,44rem)] overflow-hidden rounded-[1.75rem] lg:rounded-feature">
        <HeroSlides />
      </ScrollExpand>
    ),
  };

  const chapters: StoryChapter[] = data.catalogueOk
    ? [
        lifestyle,
        {
          id: "story-categories",
          label: "Categories",
          statement: (
            <>
              Find your <Accent>world</Accent>.
            </>
          ),
          content: <CategoryTiles categories={data.categories} />,
        },
        ...(data.hotDeals.some((p) => p.available)
          ? [
              {
                id: "story-deals",
                label: "Deals",
                statement: (
                  <>
                    Today&apos;s <Accent>best</Accent> prices.
                  </>
                ),
                content: <BestDeals products={data.hotDeals} curated={data.hotDealsCurated} />,
              },
            ]
          : []),
        {
          id: "story-arrivals",
          label: "Arrivals",
          statement: (
            <>
              Fresh <Accent>arrivals</Accent>.
            </>
          ),
          content: <TabbedShowcase data={data} tab={tab ?? "new"} />,
        },
        {
          id: "story-why",
          label: "Why VALTA",
          statement: (
            <>
              Shopping, <Accent>simplified</Accent>.
            </>
          ),
          content: (
            <>
              <WhyChoose checkout={data.checkout} />
              {data.banners.length > 0 && <PromoBanners banners={data.banners} />}
              <WideBanner banners={data.wideBanners} />
              <VideoShowcase title={data.videos.title} videos={data.videos.items} />
            </>
          ),
        },
        {
          id: "story-help",
          label: "Help",
          statement: (
            <>
              Here to <Accent>help</Accent>.
            </>
          ),
          content: <Faq checkout={data.checkout} />,
        },
      ]
    : [
        {
          id: "story-help",
          label: "Help",
          statement: (
            <>
              Here to <Accent>help</Accent>.
            </>
          ),
          content: (
            <>
              <ErpUnavailable retryHref="/" />
              <Faq checkout={data.checkout} />
            </>
          ),
        },
      ];

  const rail = [{ id: "story-intro", label: "Intro" }, ...chapters.map(({ id, label }) => ({ id, label }))];

  return (
    <>
      <Hero
        phonesHref={data.phonesSlug ? `/categories/${data.phonesSlug}` : undefined}
        accessoriesHref={accessories ? `/categories/${accessories.slug}` : undefined}
        cod={data.checkout.cod}
        deliveryCharge={data.checkout.deliveryCharge}
      />
      <ChapterRail chapters={rail} />
      <div className="pb-6 sm:pb-10">
        {chapters.map((c, i) => (
          <Fragment key={c.id}>
            <Chapter id={c.id} n={i + 2} label={c.label} statement={c.statement} aside={c.aside}>
              {c.content}
            </Chapter>
            {/* A band of the real category names drifting between the lifestyle and categories chapters. */}
            {c.id === "story-lifestyle" && <MarqueeBand words={data.categories.map((cat) => cat.name)} />}
          </Fragment>
        ))}
      </div>
    </>
  );
}
