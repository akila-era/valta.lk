"use client";

import { useState } from "react";

/**
 * "Send us a message" on the contact page, as on ugreen.lk. The site has no message inbox, so Send opens the visitor's
 * own email app with the message filled in, addressed to the store's email (Admin, Store details). Nothing is sent
 * or stored by the website itself.
 */
export function ContactMessageForm({ email }: { email: string }) {
  const [error, setError] = useState("");
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const name = String(f.get("name") ?? "").trim();
        const from = String(f.get("from") ?? "").trim();
        const phone = String(f.get("phone") ?? "").trim();
        const message = String(f.get("message") ?? "").trim();
        if (!name || !from || !phone || !message) {
          setError("Please fill in every field.");
          return;
        }
        setError("");
        const body = `${message}\n\n${name}\n${from}\n${phone}`;
        window.location.href = `mailto:${email}?subject=${encodeURIComponent(`Message from ${name}`)}&body=${encodeURIComponent(body)}`;
      }}
    >
      <div>
        <label htmlFor="cm-name" className="label">Name</label>
        <input id="cm-name" name="name" autoComplete="name" maxLength={100} className="input max-w-sm" />
      </div>
      <div>
        <label htmlFor="cm-from" className="label">Email</label>
        <input id="cm-from" name="from" type="email" autoComplete="email" maxLength={200} className="input max-w-sm" />
      </div>
      <div>
        <label htmlFor="cm-phone" className="label">Contact No</label>
        <input id="cm-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={30} className="input max-w-sm" />
      </div>
      <div>
        <label htmlFor="cm-message" className="label">Message</label>
        <textarea id="cm-message" name="message" rows={5} maxLength={2000} className="input min-h-32 py-2" />
      </div>
      {error ? <p role="alert" className="field-error">{error}</p> : null}
      <button type="submit" className="btn-primary min-h-11 rounded-control px-8 text-[13px] font-bold uppercase tracking-[0.04em]">Send</button>
      <p className="text-xs text-muted">Send opens your email app with this message to {email}.</p>
    </form>
  );
}
