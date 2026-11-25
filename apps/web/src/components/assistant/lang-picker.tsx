"use client";

import { aiActions, useAiStore, type AiLang } from "@/store/ai";

const OPTIONS: { id: AiLang; label: string; name: string }[] = [
  { id: "en", label: "EN", name: "English" },
  { id: "si", label: "සිං", name: "සිංහල (Sinhala)" },
  { id: "ta", label: "தமி", name: "தமிழ் (Tamil)" },
];

/** Language for speaking to the assistant and for its replies. */
export function LangPicker({ tone = "light", vertical = false }: { tone?: "light" | "dark"; vertical?: boolean }) {
  const { lang } = useAiStore();
  return (
    <div role="group" aria-label="Language" className={`flex gap-1 ${vertical ? "flex-col" : ""}`}>
      {OPTIONS.map((o) => {
        const on = lang === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => aiActions.setLang(o.id)}
            aria-pressed={on}
            title={o.name}
            aria-label={o.name}
            className={`flex h-9 min-w-9 items-center justify-center rounded-full border px-2 text-xs font-semibold transition-colors ${
              tone === "dark"
                ? on
                  ? "border-[#5fcf93] bg-[#34b673]/25 text-white"
                  : "border-white/15 bg-white/5 text-white/60 hover:text-white"
                : on
                  ? "border-brand-500 bg-brand-50 text-brand-700"
                  : "border-border bg-bg text-muted hover:text-ink"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
