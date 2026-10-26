import type { HomeData } from "@/lib/home-data";
import { WideBannerSlider } from "./wide-banner-slider";

/** Staff-chosen full-width pictures (each optionally a link) that rotate. Sits between the homepage collections. */
export function WideBanner({ banners }: { banners: HomeData["wideBanners"] }) {
  if (!banners.length) return null;
  return (
    <section aria-label="Promotions" className="mt-12 sm:mt-16">
      <WideBannerSlider slides={banners} />
    </section>
  );
}
