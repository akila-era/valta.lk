"use client";

import { useId, useState, type FormEvent } from "react";
import { Check, Loader2, PenLine, Star } from "lucide-react";

/**
 * "Write a review": star rating, optional headline, the review and a name. It is sent for approval (staff approve it
 * in the admin before it shows), which the form says up front. Signed-in shoppers who ordered the product get the
 * "Verified buyer" tag (decided by the server).
 */
export function ReviewForm({ productId, productName }: { productId: string; productName: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!rating) return setError("Please choose a star rating.");
    const f = new FormData(e.currentTarget);
    setState("busy");
    setError(null);
    try {
      const res = await fetch("/api/store/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          rating,
          title: String(f.get("title") ?? ""),
          body: String(f.get("body") ?? ""),
          name: String(f.get("name") ?? ""),
          company: String(f.get("company") ?? ""),
        }),
      });
      if (res.ok) return setState("done");
      const data = await res.json().catch(() => null);
      setError(data?.error?.message ?? "The review could not be sent. Please try again.");
    } catch {
      setError("Could not reach the server. Please try again.");
    }
    setState("idle");
  }

  if (state === "done") {
    return (
      <p role="status" className="flex items-start gap-3 rounded-card border border-success/30 bg-success/5 p-4 text-sm">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-success text-white">
          <Check className="h-4 w-4" strokeWidth={3} aria-hidden />
        </span>
        <span>
          <span className="block font-bold text-ink">Thank you for your review.</span>
          <span className="text-muted">It will appear here once our team has checked it, usually within a day.</span>
        </span>
      </p>
    );
  }

  if (!open) {
    return (
      <button type="button" className="btn-primary px-6" onClick={() => setOpen(true)}>
        <PenLine className="h-4 w-4" aria-hidden /> Write a review
      </button>
    );
  }

  const shown = hover || rating;
  const words = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];
  return (
    <form onSubmit={submit} noValidate className="space-y-4 rounded-card border border-border p-5 sm:p-6">
      <p className="font-display text-lg font-extrabold">Review {productName}</p>
      <fieldset>
        <legend className="label">Your rating</legend>
        <div className="flex items-center gap-3">
          <div className="flex" role="radiogroup" aria-label="Rating" onMouseLeave={() => setHover(0)}>
            {[1, 2, 3, 4, 5].map((n) => (
              <label key={n} className="cursor-pointer p-1" onMouseEnter={() => setHover(n)}>
                <input type="radio" name="rating" value={n} checked={rating === n} onChange={() => setRating(n)} className="peer sr-only" aria-label={`${n} star${n > 1 ? "s" : ""}`} />
                <Star aria-hidden className={`h-8 w-8 transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-brand-600 ${n <= shown ? "fill-brand-500 text-brand-500" : "text-border-strong/60"}`} strokeWidth={1.5} />
              </label>
            ))}
          </div>
          <span className="text-sm font-semibold text-muted" aria-hidden>{words[shown]}</span>
        </div>
      </fieldset>
      <div>
        <label htmlFor={`${id}-title`} className="label">Headline <span className="font-normal text-muted">(optional)</span></label>
        <input id={`${id}-title`} name="title" maxLength={80} className="input" placeholder="e.g. Great sound for the price" />
      </div>
      <div>
        <label htmlFor={`${id}-body`} className="label">Your review</label>
        <textarea id={`${id}-body`} name="body" required minLength={10} maxLength={2000} rows={4} className="input min-h-28 py-3" placeholder="What did you like or not like? How are you using it?" />
      </div>
      <div>
        <label htmlFor={`${id}-name`} className="label">Your name</label>
        <input id={`${id}-name`} name="name" required minLength={2} maxLength={60} autoComplete="name" className="input" />
        <p className="mt-1 text-xs text-muted">Shown as your first name and last initial.</p>
      </div>
      <input name="company" tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px] h-px w-px opacity-0" />
      {error ? <p role="alert" className="text-sm font-semibold text-danger">{error}</p> : null}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn-primary px-6" disabled={state === "busy"}>
          {state === "busy" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null} Submit review
        </button>
        <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
        <p className="w-full text-xs text-muted">Reviews are checked by our team before they appear.</p>
      </div>
    </form>
  );
}
