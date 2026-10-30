"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/** Copies the order reference, with a short "Copied" confirmation (announced to screen readers). */
export function CopyRef({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2000);
        } catch {
          /* clipboard blocked: the reference stays visible to copy by hand */
        }
      }}
      className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-control border border-border bg-bg px-3.5 text-sm font-semibold text-ink transition-colors hover:border-ink"
    >
      {copied ? <Check className="h-4 w-4 text-success" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
      <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}
