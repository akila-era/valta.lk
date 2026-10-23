"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Loader2 } from "lucide-react";

export function ProfileForm({ name, phone }: { name: string; phone: string | null }) {
  const router = useRouter();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const inflight = useRef(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (inflight.current) return;
    const fd = new FormData(e.currentTarget);
    inflight.current = true;
    setBusy(true);
    setErrors({});
    setMsg(null);
    try {
      const res = await fetch("/api/account/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: String(fd.get("name") ?? ""), phone: String(fd.get("phone") ?? "") }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setMsg({ ok: true, text: "Your details are saved." });
        router.refresh();
      } else {
        setErrors(data.error?.fields ?? {});
        setMsg({ ok: false, text: data.error?.message ?? "Could not save. Please try again." });
      }
    } catch {
      setMsg({ ok: false, text: "We could not reach the server." });
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-3">
      <div>
        <label htmlFor="p-name" className="label">Full name</label>
        <input id="p-name" name="name" defaultValue={name} autoComplete="name" maxLength={100} className="input" aria-invalid={errors.name ? true : undefined} aria-describedby={errors.name ? "p-name-error" : undefined} />
        {errors.name && <p id="p-name-error" className="field-error" role="alert">{errors.name}</p>}
      </div>
      <div>
        <label htmlFor="p-phone" className="label">Phone</label>
        <input id="p-phone" name="phone" type="tel" inputMode="tel" defaultValue={phone?.replace(/^\+94/, "0") ?? ""} autoComplete="tel" className="input" aria-invalid={errors.phone ? true : undefined} aria-describedby={errors.phone ? "p-phone-error" : "p-phone-hint"} />
        {!errors.phone && <p id="p-phone-hint" className="mt-1.5 text-xs text-muted">e.g. 0771234567. Leave blank if you prefer not to save one.</p>}
        {errors.phone && <p id="p-phone-error" className="field-error" role="alert">{errors.phone}</p>}
      </div>
      <button type="submit" disabled={busy} className="btn-primary">
        {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} {busy ? "Saving…" : "Save details"}
      </button>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</p>}
    </form>
  );
}
