import { BadgeCheck } from "lucide-react";
import type { PublicReview, RatingSummary } from "@/lib/reviews";
import { ReviewForm } from "./review-form";
import { Stars } from "./stars";

/**
 * Customer reviews on the product page: the average with a 5-to-1 star breakdown, the approved reviews (newest first)
 * and "Write a review". With no reviews yet it invites the first one instead of showing empty bars.
 */
export function ProductReviews({ productId, productName, summary, reviews }: { productId: string; productName: string; summary: RatingSummary | null; reviews: PublicReview[] }) {
  return (
    <section id="reviews" aria-labelledby="reviews-title" className="mt-8 scroll-mt-40 rounded-panel border border-border bg-bg p-6 sm:p-8">
      <p className="kicker"><span className="text-brand-600">Details</span> / What buyers say</p>
      <h2 id="reviews-title" className="statement mt-1 text-xl sm:text-2xl">Customer reviews</h2>

      <div className="mt-6 grid gap-8 lg:grid-cols-[18rem_minmax(0,1fr)] lg:gap-12">
        <div>
          {summary ? (
            <>
              <p className="flex items-baseline gap-2">
                <span className="font-display text-5xl font-extrabold tabular-nums text-ink">{summary.average.toFixed(1)}</span>
                <span className="text-sm text-muted">out of 5</span>
              </p>
              <Stars rating={summary.average} size="h-5 w-5" />
              <p className="mt-1 text-sm text-muted">{summary.count} {summary.count === 1 ? "review" : "reviews"}</p>
              <ul className="mt-5 space-y-1.5" aria-label="Ratings breakdown">
                {summary.stars.map((n, i) => {
                  const star = 5 - i;
                  const pct = summary.count ? Math.round((n / summary.count) * 100) : 0;
                  return (
                    <li key={star} className="grid grid-cols-[3.25rem_1fr_2.5rem] items-center gap-2 text-xs">
                      <span className="font-semibold text-ink">{star} star</span>
                      <span aria-hidden className="h-2 overflow-hidden rounded-full bg-surface">
                        <span className="block h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
                      </span>
                      <span className="text-right tabular-nums text-muted">
                        {pct}%<span className="sr-only"> ({n} {n === 1 ? "review" : "reviews"})</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <p className="text-sm leading-6 text-muted">No reviews yet. Bought this? Tell other shoppers what you think.</p>
          )}
          <div className="mt-6">
            <ReviewForm productId={productId} productName={productName} />
          </div>
        </div>

        {reviews.length ? (
          <ul className="divide-y divide-border" aria-label="Reviews">
            {reviews.map((r) => (
              <li key={r.id} className="py-5 first:pt-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Stars rating={r.rating} />
                  {r.title ? <p className="font-bold text-ink">{r.title}</p> : null}
                </div>
                <p className="mt-2 whitespace-pre-line text-[15px] leading-7 text-ink">{r.body}</p>
                <p className="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                  <span className="font-semibold text-ink">{r.name}</span>
                  {r.verified ? (
                    <span className="inline-flex items-center gap-1 font-semibold text-success">
                      <BadgeCheck className="h-3.5 w-3.5" aria-hidden /> Verified buyer
                    </span>
                  ) : null}
                  <span aria-hidden>·</span>
                  <time dateTime={r.createdAt}>{new Date(r.createdAt).toLocaleDateString("en-LK", { day: "numeric", month: "short", year: "numeric" })}</time>
                </p>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
