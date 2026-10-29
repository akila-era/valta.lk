"use client";

import { useId, useState, type FormEvent } from "react";
import { ArrowRight, Check, Loader2 } from "lucide-react";

/**
 * Footer sign-up for new arrivals and price drops. One field, a clear promise of what is sent and how often, and a
 * plain thank-you. No made-up reward: checkout cannot apply a sign-up discount, so none is offered.
 */
export function NewsletterForm() {
  const id = useId();
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setState("busy");
    setError(null);
    try {
      const res = await fetch("/api/store/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: String(form.get("email") ?? ""), company: String(form.get("company") ?? "") }),
      });
      if (res.ok) return setState("done");
      const data = await res.json().catch(() => null);
      setError(data?.error?.message ?? "Something went wrong. Please try again.");
    } catch {
      setError("Could not reach the server. Please try again.");
    }
    setState("idle");
  }

  if (state === "done") {
    return (
      <p role="status" className="flex items-center gap-3 rounded-control bg-white/10 px-4 py-3.5 text-sm font-semibold text-white">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-500">
          <Check className="h-4 w-4" strokeWidth={3} aria-hidden />
        </span>
        You are on the list. Watch your inbox for new arrivals and price drops.
      </p>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="w-full">
      <label htmlFor={`${id}-email`} className="sr-only">Email address</label>
      <div className="flex gap-2 max-sm:flex-col">
        <input
          id={`${id}-email`}
          name="email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          maxLength={254}
          placeholder="Your email address"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="min-h-12 min-w-0 flex-1 rounded-control border border-white/20 bg-white/5 px-4 text-[15px] text-white placeholder:text-white/50 focus:border-brand-500 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
        />
        {/* Spam trap: hidden from people and screen readers, filled only by bots. */}
        <input name="company" tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px] h-px w-px opacity-0" />
        <button type="submit" disabled={state === "busy"} className="btn-primary min-h-12 shrink-0 px-6">
          {state === "busy" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          Subscribe {state === "busy" ? null : <ArrowRight className="h-4 w-4" aria-hidden />}
        </button>
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-2 text-sm font-semibold text-brand-500">
          {error}
        </p>
      ) : null}
    </form>
  );
}
