"use client";

import { useEffect, useState } from "react";
import { Sparkles, Trash2, Volume2, VolumeX, X } from "lucide-react";
import { labels } from "./labels";
import type { AssistantLang } from "./types";
import { VoicePlayerView } from "./voice/voice-ui";
import { useAudioPlayer, type PlayerDeps } from "./voice/use-audio-player";

/** Small presentational pieces of the assistant modal: branding, welcome, typing indicator, language choice, clear confirmation, spoken reply. */
export type Locale = "auto" | "en" | "si";

export function BrandMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#2563EB] to-[#1d4ed8] text-white shadow-sm ${className}`} aria-hidden>
      <Sparkles className="h-1/2 w-1/2" />
    </span>
  );
}

export function PanelHeader({
  lang,
  demo,
  ttsAvailable,
  voiceOutput,
  canClear,
  onToggleVoiceOutput,
  onClear,
  onClose,
}: {
  lang: AssistantLang;
  demo: boolean;
  ttsAvailable: boolean;
  voiceOutput: boolean;
  canClear: boolean;
  onToggleVoiceOutput: () => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const t = labels(lang);
  const iconBtn = "flex h-10 w-10 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#2563EB] disabled:opacity-40";
  return (
    <header className="flex items-center gap-3 border-b border-slate-100 bg-white px-4 py-3">
      <BrandMark />
      <div className="min-w-0 flex-1">
        <h2 className="flex items-center gap-2 whitespace-nowrap text-[15px] font-semibold leading-tight text-slate-900">
          {t.assistantName}
          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#2563EB]">
            Beta
            {demo ? <span className="hidden sm:inline"> · demo data</span> : null}
          </span>
        </h2>
        <p className="text-xs text-slate-500">{t.tagline}</p>
      </div>
      <button
        type="button"
        onClick={onToggleVoiceOutput}
        disabled={!ttsAvailable}
        aria-label={!ttsAvailable ? t.voiceOutputUnavailable : voiceOutput ? t.voiceOutputOn : t.voiceOutputOff}
        title={!ttsAvailable ? t.voiceOutputUnavailable : voiceOutput ? t.voiceOutputOn : t.voiceOutputOff}
        aria-pressed={ttsAvailable ? voiceOutput : undefined}
        data-testid="voice-output-toggle"
        className={iconBtn}
      >
        {voiceOutput && ttsAvailable ? <Volume2 className="h-5 w-5 text-[#2563EB]" aria-hidden /> : <VolumeX className="h-5 w-5" aria-hidden />}
      </button>
      <button type="button" onClick={onClear} disabled={!canClear} aria-label={t.clearConversation} title={t.clearConversation} data-testid="clear-conversation" className={iconBtn}>
        <Trash2 className="h-5 w-5" aria-hidden />
      </button>
      <button type="button" onClick={onClose} aria-label={t.close} className={iconBtn}>
        <X className="h-5 w-5" aria-hidden />
      </button>
    </header>
  );
}

export function LanguageSelector({ value, lang, onChange }: { value: Locale; lang: AssistantLang; onChange: (v: Locale) => void }) {
  const t = labels(lang);
  const options: [Locale, string][] = [
    ["auto", t.langAuto],
    ["en", t.langEn],
    ["si", t.langSi],
  ];
  return (
    <div className="flex items-center gap-2 border-b border-slate-100 bg-white px-4 py-2" role="radiogroup" aria-label={t.language} data-testid="language-selector">
      <span className="text-xs font-medium text-slate-500">{t.language}</span>
      <div className="flex rounded-full bg-slate-100 p-0.5">
        {options.map(([v, label]) => (
          <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)} className={`rounded-full px-3 py-1 text-xs font-medium transition-colors motion-reduce:transition-none ${value === v ? "bg-white text-[#2563EB] shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Welcome({ lang, demo, starters, onPick }: { lang: AssistantLang; demo: boolean; starters: string[]; onPick: (s: string) => void }) {
  const t = labels(lang);
  return (
    <div className="flex flex-col items-center px-2 pt-4 text-center" data-testid="assistant-welcome">
      <BrandMark className="h-14 w-14" />
      <h3 className="mt-3 text-lg font-semibold text-slate-900">{t.welcomeTitle}</h3>
      <p className="mt-1 max-w-xs text-sm text-slate-600">{t.welcome}</p>
      {demo ? <p className="mt-2 max-w-xs rounded-lg bg-blue-50 px-3 py-2 text-xs text-slate-700">{t.welcomeDemo}</p> : null}
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {starters.map((s) => (
          <button key={s} type="button" onClick={() => onPick(s)} className="rounded-full border border-blue-200 bg-white px-3 py-1.5 text-xs font-medium text-[#2563EB] hover:bg-blue-50">
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Three softly bouncing dots and a status line that becomes more honest the longer the reply takes (this CPU can take a while). */
export function TypingIndicator({ lang }: { lang: AssistantLang }) {
  const t = labels(lang);
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const text = seconds >= 20 ? t.thinkingSlower : seconds >= 6 ? t.thinkingSlow : t.thinking;
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="flex items-center gap-2" data-testid="typing-indicator">
      <span className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-white px-3 py-2.5 shadow-sm" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-2 w-2 animate-bounce rounded-full bg-[#2563EB]/70 motion-reduce:animate-none" style={{ animationDelay: `${i * 150}ms` }} />
        ))}
      </span>
      <span className="text-xs text-slate-500">{text}</span>
    </div>
  );
}

export function ClearConfirm({ lang, onConfirm, onCancel }: { lang: AssistantLang; onConfirm: () => void; onCancel: () => void }) {
  const t = labels(lang);
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/85 p-6 backdrop-blur-sm" data-testid="clear-confirm">
      <div role="alertdialog" aria-labelledby="clear-title" aria-describedby="clear-body" className="w-full max-w-xs rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
        <h3 id="clear-title" className="text-base font-semibold text-slate-900">
          {t.clearTitle}
        </h3>
        <p id="clear-body" className="mt-1 text-sm text-slate-600">
          {t.clearBody}
        </p>
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onCancel} autoFocus className="min-h-11 flex-1 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50">
            {t.clearNo}
          </button>
          <button type="button" onClick={onConfirm} className="min-h-11 flex-1 rounded-lg bg-[#2563EB] text-sm font-semibold text-white hover:bg-[#1d4ed8]">
            {t.clearYes}
          </button>
        </div>
      </div>
    </div>
  );
}

/** The spoken version of one assistant reply: loaded on demand, or automatically for the latest reply when voice replies are on. */
export function SpokenReply({ lang, auto, fetchAudio, playerDeps }: { lang: AssistantLang; auto: boolean; fetchAudio: () => Promise<Blob>; playerDeps?: PlayerDeps }) {
  const p = useAudioPlayer(fetchAudio, playerDeps);
  const { load } = p;
  useEffect(() => {
    if (auto) void load();
    // only when the reply first appears with voice replies on
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);
  return <VoicePlayerView phase={p.phase} muted={p.muted} progress={p.progress} lang={lang} onToggle={p.toggle} onReplay={p.replay} onMute={p.toggleMute} />;
}
