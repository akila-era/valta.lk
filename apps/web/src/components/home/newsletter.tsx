"use client";

import { useState } from "react";
import { ArrowRight, BadgeCheck, CheckCircle2, Loader2, Mail, Sparkles, Tag } from "lucide-react";

const PERKS = [
  { icon: Sparkles, text: "New arrivals first" },
  { icon: Tag, text: "Special offers" },
  { icon: BadgeCheck, text: "Offers only, nothing else" },
];

/** Home newsletter box. Posts the address to /api/newsletter; it only collects emails and says so. */
export function Newsletter() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trap = (new FormData(e.currentTarget).get("website") as string | null) ?? "";
    setState("busy");
    setError(null);
    try {
      const res = await fetch("/api/newsletter", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, website: trap }) });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(data?.error?.message ?? "Could not sign you up. Please try again.");
        setState("idle");
        return;
      }
      setState("done");
    } catch {
      setError("Could not reach the server. Please try again.");
      setState("idle");
    }
  }

  return (
    <section aria-labelledby="newsletter-title" className="container-page mt-10 sm:mt-14">
      <div className="on-dark relative isolate overflow-hidden rounded-3xl bg-gradient-to-br from-[#161616] via-ink to-[#0f2418] text-white">
        <span aria-hidden className="pointer-events-none absolute -right-24 -top-28 -z-10 h-80 w-80 rounded-full bg-brand-500/30 blur-3xl" />
        <span aria-hidden className="pointer-events-none absolute -bottom-32 -left-20 -z-10 h-72 w-72 rounded-full bg-brand-500/10 blur-3xl" />
        <Mail aria-hidden className="pointer-events-none absolute -bottom-10 right-1/3 -z-10 h-56 w-56 -rotate-12 text-white/[0.03]" strokeWidth={1} />

        <div className="grid gap-8 p-6 sm:p-10 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:gap-14 lg:p-14">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[13px] font-medium text-white/80">
              <Mail className="h-3.5 w-3.5 text-brand-500" aria-hidden /> Stay in the loop
            </p>
            <h2 id="newsletter-title" className="mt-4 max-w-lg text-[1.75rem] font-semibold leading-[1.1] tracking-tight sm:text-4xl">Get new arrivals and offers by email</h2>
            <p className="mt-3 max-w-md text-[15px] leading-6 text-white/70">Join the VOLTA.LK list and be the first to see new products and special prices.</p>
            <ul className="mt-5 flex flex-wrap gap-2">
              {PERKS.map(({ icon: Icon, text }) => (
                <li key={text} className="inline-flex min-h-9 items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3.5 text-[13px] text-white/85">
                  <Icon className="h-4 w-4 text-brand-500" aria-hidden /> {text}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-5 backdrop-blur-sm sm:p-7">
            {state === "done" ? (
              <div role="status" className="flex flex-col items-center gap-3 py-4 text-center">
                <CheckCircle2 className="h-12 w-12 text-brand-500" aria-hidden />
                <p className="text-xl font-semibold">You are on the list</p>
                <p className="text-[15px] text-white/70">Thank you! We will email you when there is something worth your attention.</p>
              </div>
            ) : (
              <form onSubmit={submit} noValidate>
                <label htmlFor="nl-email" className="text-[15px] font-semibold">Your email address</label>
                <input
                  id="nl-email"
                  type="email"
                  name="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  placeholder="name@example.com"
                  required
                  maxLength={120}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? "nl-error nl-note" : "nl-note"}
                  className="mt-2 min-h-12 w-full rounded-xl border border-white/20 bg-white/10 px-4 text-base text-white placeholder:text-white/45 focus-visible:outline-white sm:text-[15px]"
                />
                {/* Honeypot: hidden from people and screen readers */}
                <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px] h-0 w-0 opacity-0" />
                <button type="submit" disabled={state === "busy"} className="btn-primary btn-lg mt-3 w-full rounded-xl">
                  {state === "busy" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                  Subscribe <ArrowRight className="h-4 w-4" aria-hidden />
                </button>
                {error && <p id="nl-error" role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
                <p id="nl-note" className="mt-3 text-[13px] leading-5 text-white/55">We only use your address to send offers. Ask us any time and we will remove it.</p>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
