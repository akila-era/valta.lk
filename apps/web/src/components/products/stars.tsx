import { Star } from "lucide-react";

/**
 * Five stars filled to the rating (halves shown as a partly filled star). Decorative: the text label carries the
 * rating for screen readers, e.g. "Rated 4.5 out of 5".
 */
export function Stars({ rating, size = "h-4 w-4", label }: { rating: number; size?: string; label?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={label ?? `Rated ${rating} out of 5`}>
      {Array.from({ length: 5 }, (_, i) => {
        const fill = Math.max(0, Math.min(1, rating - i));
        return (
          <span key={i} aria-hidden className={`relative inline-block ${size}`}>
            <Star className={`absolute inset-0 ${size} text-border-strong/50`} strokeWidth={1.75} />
            {fill > 0 ? (
              <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
                <Star className={`${size} fill-brand-500 text-brand-500`} strokeWidth={1.75} />
              </span>
            ) : null}
          </span>
        );
      })}
    </span>
  );
}
