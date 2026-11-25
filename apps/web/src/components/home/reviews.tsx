import { ExternalLink, Star } from "lucide-react";
import { BRAND_NAME } from "@/lib/brand";
import { configuredReviews } from "@/lib/home-config";
import { ProductCarousel } from "./product-carousel";

function Stars({ value, className = "h-4 w-4" }: { value: number; className?: string }) {
  return (
    <span className="inline-flex gap-0.5" role="img" aria-label={`${value} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} className={`${className} ${i < Math.round(value) ? "fill-brand-500 text-brand-500" : "text-border"}`} aria-hidden />
      ))}
    </span>
  );
}

/** "What people say about us": owner-supplied reviews (HOME_REVIEWS). Hidden until there are some; the average is computed from them. */
export function Reviews() {
  const { reviews, url } = configuredReviews();
  if (!reviews.length) return null;
  const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
  return (
    <section aria-labelledby="reviews-title" className="container-page mt-10 sm:mt-14">
      <h2 id="reviews-title" className="mb-6 text-center text-2xl font-semibold tracking-tight text-ink sm:mb-8 sm:text-[2rem]">What People Say About Us</h2>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-center lg:gap-8">
        <div className="text-center lg:text-left">
          <p className="text-lg font-semibold text-ink">{BRAND_NAME}</p>
          <p className="mt-2 flex items-center justify-center gap-2 lg:justify-start">
            <span className="text-xl font-semibold text-brand-600">{avg.toFixed(1)}</span>
            <Stars value={avg} className="h-5 w-5" />
          </p>
          <p className="mt-1 text-[13px] text-muted">{reviews.length} customer {reviews.length === 1 ? "review" : "reviews"}</p>
          {url && (
            <a href={url} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border px-4 text-sm font-semibold text-ink transition-colors hover:border-ink">
              Review us <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          )}
        </div>
        <div className="min-w-0">
        <ProductCarousel label="Customer reviews" align="start" step="item" snap="proximity">
          {reviews.map((r, i) => (
            <li key={`${r.name}-${i}`} className="w-[88%] shrink-0 snap-start px-1.5 sm:w-1/2 lg:w-1/3">
              <figure className="flex h-full min-h-[11rem] flex-col rounded-2xl bg-surface p-5">
                <figcaption className="flex items-center gap-3">
                  <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-semibold text-white">{r.name.charAt(0).toUpperCase()}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-semibold text-ink">{r.name}</span>
                    {r.when && <span className="block text-[13px] text-muted">{r.when}</span>}
                  </span>
                </figcaption>
                <Stars value={r.rating} className="mt-3 h-4 w-4" />
                <blockquote className="mt-2 line-clamp-5 text-[15px] leading-6 text-ink">{r.text}</blockquote>
              </figure>
            </li>
          ))}
        </ProductCarousel>
        </div>
      </div>
    </section>
  );
}
