"use client";

import { aiActions, useAiStore, type AiLang } from "@/store/ai";

const OPTIONS: { id: AiLang; label: string; name: string }[] = [
  { id: "en", label: "EN", name: "English" },
  { id: "si", label: "සිං", name: "සිංහල (Sinhala)" },
  { id: "ta", label: "தமி", name: "தமிழ் (Tamil)" },
];

/** Language for speaking to the assistant and for its replies. "Auto" (default) follows what the shopper writes or says. */
export function LangPicker({ tone = "light", vertical = false }: { tone?: "light" | "dark"; vertical?: boolean }) {
  const { lang, langAuto } = useAiStore();
  return (
    <div role="group" aria-label="Language" className={`flex gap-1 ${vertical ? "flex-col" : ""}`}>
      <button
        type="button"
        onClick={() => aiActions.setAuto()}
        aria-pressed={langAuto}
        title="Detect the language automatically"
        aria-label="Detect the language automatically"
        className={`flex h-9 min-w-9 items-center justify-center rounded-full border px-2.5 text-xs font-semibold transition-colors ${
          tone === "dark"
            ? langAuto
              ? "border-[#5fcf93] bg-[#34b673]/25 text-white"
              : "border-white/15 bg-white/5 text-white/60 hover:text-white"
            : langAuto
              ? "border-brand-500 bg-brand-50 text-brand-700"
              : "border-border bg-bg text-muted hover:text-ink"
        }`}
      >
        Auto
      </button>
      {OPTIONS.map((o) => {
        // Hand-picked: solid. In auto mode the language currently in use shows a softer outline.
        const on = lang === o.id && !langAuto;
        const detected = lang === o.id && langAuto;
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
                  : detected
                    ? "border-[#5fcf93]/50 bg-white/5 text-white"
                    : "border-white/15 bg-white/5 text-white/60 hover:text-white"
                : on
                  ? "border-brand-500 bg-brand-50 text-brand-700"
                  : detected
                    ? "border-brand-500/40 bg-bg text-brand-700"
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
