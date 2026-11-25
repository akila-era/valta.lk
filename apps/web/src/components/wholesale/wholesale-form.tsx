"use client";

import { useState } from "react";
import { ArrowRight, Building2, CheckCircle2, Loader2, Mail, MessageSquareText, Phone, User } from "lucide-react";
import { BUSINESS_TYPES } from "@/lib/wholesale-shared";

const DISTRICTS = ["Colombo", "Gampaha", "Kalutara", "Kandy", "Matale", "Nuwara Eliya", "Galle", "Matara", "Hambantota", "Jaffna", "Kilinochchi", "Mannar", "Vavuniya", "Mullaitivu", "Batticaloa", "Ampara", "Trincomalee", "Kurunegala", "Puttalam", "Anuradhapura", "Polonnaruwa", "Badulla", "Monaragala", "Ratnapura", "Kegalle"];

type Field = "name" | "email" | "phone" | "business";

/** Wholesale registration form: validates in the browser first, then posts to /api/wholesale. */
export function WholesaleForm() {
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const val = (k: string) => String(f.get(k) ?? "").trim();
    const next: Partial<Record<Field, string>> = {};
    if (val("name").length < 2) next.name = "Enter your name";
    if (!/^\S+@\S+\.\S+$/.test(val("email"))) next.email = "Enter a valid email address";
    if (!/^[+0-9][0-9\s-]{6,19}$/.test(val("phone"))) next.phone = "Enter a valid phone number, e.g. 0771234567";
    if (val("business").length < 2) next.business = "Enter your shop or company name";
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length) {
      (e.currentTarget.querySelector("[aria-invalid=true]") as HTMLElement | null)?.focus();
      return;
    }
    setState("busy");
    try {
      const res = await fetch("/api/wholesale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: val("name"), email: val("email"), phone: val("phone"), business: val("business"), type: val("type") || undefined, district: val("district") || undefined, message: val("message") || undefined, website: val("website") }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setFormError(data?.error?.message ?? "Could not send your registration. Please try again.");
        setState("idle");
        return;
      }
      setState("done");
    } catch {
      setFormError("Could not reach the server. Please try again.");
      setState("idle");
    }
  }

  if (state === "done") {
    return (
      <div role="status" className="flex flex-col items-center gap-3 py-10 text-center">
        <CheckCircle2 className="h-14 w-14 text-brand-500" aria-hidden />
        <p className="text-2xl font-semibold text-ink">Thank you, we got your registration</p>
        <p className="max-w-md text-[15px] leading-6 text-muted">Our team will look at it and contact you on the phone number or email you gave. If it is urgent, call or message us.</p>
      </div>
    );
  }

  const input = "input min-h-12 pl-11";
  const icon = "pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted";
  const err = (k: Field) => (errors[k] ? <p id={`w-${k}-err`} className="field-error">{errors[k]}</p> : null);
  const aria = (k: Field) => ({ "aria-invalid": errors[k] ? true : undefined, "aria-describedby": errors[k] ? `w-${k}-err` : undefined });

  return (
    <form onSubmit={submit} noValidate className="relative grid gap-4 sm:grid-cols-2">
      <div>
        <label htmlFor="w-name" className="label">Your name <span className="text-sale">*</span></label>
        <div className="relative">
          <User className={icon} aria-hidden />
          <input id="w-name" name="name" autoComplete="name" className={input} maxLength={80} {...aria("name")} />
        </div>
        {err("name")}
      </div>
      <div>
        <label htmlFor="w-business" className="label">Shop / company name <span className="text-sale">*</span></label>
        <div className="relative">
          <Building2 className={icon} aria-hidden />
          <input id="w-business" name="business" autoComplete="organization" className={input} maxLength={100} {...aria("business")} />
        </div>
        {err("business")}
      </div>
      <div>
        <label htmlFor="w-email" className="label">Email <span className="text-sale">*</span></label>
        <div className="relative">
          <Mail className={icon} aria-hidden />
          <input id="w-email" name="email" type="email" autoComplete="email" className={input} maxLength={120} {...aria("email")} />
        </div>
        {err("email")}
      </div>
      <div>
        <label htmlFor="w-phone" className="label">Contact number <span className="text-sale">*</span></label>
        <div className="relative">
          <Phone className={icon} aria-hidden />
          <input id="w-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" className={input} maxLength={20} placeholder="07X XXX XXXX" {...aria("phone")} />
        </div>
        {err("phone")}
      </div>
      <div>
        <label htmlFor="w-type" className="label">Type of business</label>
        <select id="w-type" name="type" defaultValue="" className="select min-h-12">
          <option value="">Select</option>
          {BUSINESS_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="w-district" className="label">District</label>
        <select id="w-district" name="district" defaultValue="" className="select min-h-12">
          <option value="">Select</option>
          {DISTRICTS.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="w-message" className="label">Comment or message</label>
        <div className="relative">
          <MessageSquareText className="pointer-events-none absolute left-3.5 top-3.5 h-[18px] w-[18px] text-muted" aria-hidden />
          <textarea id="w-message" name="message" rows={4} maxLength={1000} className="textarea pl-11" placeholder="Tell us what you would like to buy and roughly how much." />
        </div>
      </div>
      {/* Honeypot: hidden from people and screen readers */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px] h-0 w-0 opacity-0" />
      {formError && <p role="alert" className="rounded-lg bg-danger-bg p-3 text-sm text-danger sm:col-span-2">{formError}</p>}
      <div className="flex flex-col gap-3 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[13px] leading-5 text-muted sm:max-w-sm">We only use these details to reply to your registration.</p>
        <button type="submit" disabled={state === "busy"} className="btn-primary btn-lg rounded-full sm:min-w-48">
          {state === "busy" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          Submit registration <ArrowRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </form>
  );
}
