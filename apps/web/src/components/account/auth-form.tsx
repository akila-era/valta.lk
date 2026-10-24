"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { safeNext } from "@/lib/auth/safe-next";

type Mode = "login" | "admin" | "register" | "forgot" | "reset";

const ENDPOINT: Record<Mode, string> = {
  login: "/api/account/login",
  admin: "/api/admin/login",
  register: "/api/account/register",
  forgot: "/api/account/forgot-password",
  reset: "/api/account/reset-password",
};

const SUBMIT: Record<Mode, string> = { login: "Sign in", admin: "Sign in to admin", register: "Create account", forgot: "Send reset link", reset: "Set new password" };

function Field(props: { id: string; label: string; error?: string; hint?: string; children: React.ReactNode }) {
  const { id, label, error, hint, children } = props;
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      {children}
      {hint && !error && <p id={`${id}-hint`} className="mt-1.5 text-xs text-muted">{hint}</p>}
      {error && <p id={`${id}-error`} className="field-error" role="alert">{error}</p>}
    </div>
  );
}

export function AuthForm({ mode, next, token }: { mode: Mode; next?: string; token?: string }) {
  const router = useRouter();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  const inflight = useRef(false);

  const aria = (f: string, hint = false) => ({
    "aria-invalid": errors[f] ? true : undefined,
    "aria-describedby": errors[f] ? `${f}-error` : hint ? `${f}-hint` : undefined,
  });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (inflight.current) return; // duplicate-submit protection
    const fd = new FormData(e.currentTarget);
    const body: Record<string, string> = Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)]));
    if (mode === "reset") body.token = token ?? "";
    if ((mode === "register" || mode === "reset") && body.password !== body.confirm) {
      setErrors({ confirm: "Passwords do not match" });
      return;
    }
    delete body.confirm;

    inflight.current = true;
    setBusy(true);
    setErrors({});
    setBanner(null);
    try {
      const res = await fetch(ENDPOINT[mode], { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        if (mode === "forgot") {
          setBanner({ kind: "success", text: data.message ?? "Check your email for a reset link." });
          (e.target as HTMLFormElement).reset();
        } else {
          router.replace(mode === "reset" ? "/account" : mode === "admin" ? (next?.startsWith("/admin/") ? safeNext(next) : "/admin/orders") : safeNext(next));
          router.refresh(); // re-render the header with the signed-in state
        }
        return;
      }
      setErrors(data.error?.fields ?? {});
      setBanner({ kind: "error", text: data.error?.message ?? "Something went wrong. Please try again." });
    } catch {
      setBanner({ kind: "error", text: "We could not reach the server. Check your connection and try again." });
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }

  const pwType = show ? "text" : "password";
  const toggle = (
    <button
      type="button"
      onClick={() => setShow((v) => !v)}
      className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-muted hover:text-ink"
      aria-label={show ? "Hide password" : "Show password"}
      aria-pressed={show}
    >
      {show ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
    </button>
  );

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {banner && (
        <div role={banner.kind === "error" ? "alert" : "status"} className={`rounded-lg p-3 text-sm ${banner.kind === "error" ? "bg-danger-bg text-danger" : "bg-success-bg text-success"}`}>
          {banner.text}
        </div>
      )}

      {mode === "register" && (
        <Field id="name" label="Full name" error={errors.name}>
          <input id="name" name="name" autoComplete="name" required maxLength={100} className="input" {...aria("name")} />
        </Field>
      )}

      {mode !== "reset" && (
        <Field id="email" label="Email" error={errors.email}>
          <input id="email" name="email" type="email" autoComplete="email" required maxLength={200} className="input" {...aria("email")} />
        </Field>
      )}

      {mode === "register" && (
        <Field id="phone" label="Phone (optional)" error={errors.phone} hint="Used to pre-fill checkout, e.g. 0771234567">
          <input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" className="input" {...aria("phone", true)} />
        </Field>
      )}

      {mode !== "forgot" && (
        <Field
          id="password"
          label={mode === "reset" ? "New password" : "Password"}
          error={errors.password}
          hint={mode === "login" || mode === "admin" ? undefined : "At least 8 characters, with letters and a number"}
        >
          <div className="relative">
            <input
              id="password"
              name="password"
              type={pwType}
              required
              maxLength={128}
              autoComplete={mode === "login" || mode === "admin" ? "current-password" : "new-password"}
              className="input pr-12"
              {...aria("password", mode !== "login" && mode !== "admin")}
            />
            {toggle}
          </div>
        </Field>
      )}

      {(mode === "register" || mode === "reset") && (
        <Field id="confirm" label="Confirm password" error={errors.confirm}>
          <input id="confirm" name="confirm" type={pwType} required maxLength={128} autoComplete="new-password" className="input" {...aria("confirm")} />
        </Field>
      )}

      {mode === "login" && (
        <p className="text-right text-sm">
          <Link href="/account/forgot-password" className="font-medium text-brand-600 hover:underline">Forgot password?</Link>
        </p>
      )}

      <button type="submit" disabled={busy} className="btn-primary w-full rounded-full min-h-12 text-sm font-semibold shadow-soft hover:shadow-lift transition-all">
        {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {SUBMIT[mode]}
      </button>
    </form>
  );
}
