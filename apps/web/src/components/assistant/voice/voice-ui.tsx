"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle, Check, Mic, Pause, Play, RotateCcw, Send, Square, Volume2, VolumeX, X } from "lucide-react";
import { labels } from "../labels";
import type { AssistantLang } from "../types";
import { formatDuration, type RecorderState, type VoiceErrorCode } from "./recorder-state";
import type { PlayerPhase } from "./use-audio-player";

/**
 * Presentational parts of the voice experience. They take state and callbacks as props (the logic is in the hooks next to them), so
 * every state can be rendered and tested on its own.
 */
const BLUE = "bg-[#2563EB] text-white hover:bg-[#1d4ed8] focus-visible:outline-[#2563EB]";
const ICON_BTN = "flex h-11 w-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2";

export function Waveform({ levels, active }: { levels: number[]; active: boolean }) {
  return (
    <div className="flex h-9 flex-1 items-center justify-center gap-[3px]" aria-hidden data-testid="waveform">
      {levels.map((l, i) => (
        <span key={i} className={`w-[3px] rounded-full bg-[#2563EB] transition-[height] duration-100 motion-reduce:transition-none ${active ? "" : "opacity-40"}`} style={{ height: `${Math.max(12, Math.round(12 + l * 88))}%` }} />
      ))}
    </div>
  );
}

const errorText = (t: ReturnType<typeof labels>, code: VoiceErrorCode): string =>
  ({
    unsupported: t.voiceUnsupported,
    denied: t.voiceDenied,
    no_device: t.voiceNoDevice,
    too_short: t.voiceTooShort,
    unavailable: t.voiceUnavailable,
    too_large: t.voiceTooLarge,
    rate_limited: t.voiceRateLimited,
    failed: t.voiceFailed,
  })[code];

/** What replaces the text box while the shopper is recording, waiting for the transcription, or checking the recognised text. */
export function VoiceComposer({
  state,
  levels,
  lang = "en",
  onStop,
  onCancel,
  onEdit,
  onSend,
  onRetry,
  onDismiss,
}: {
  state: RecorderState;
  levels: number[];
  lang?: AssistantLang;
  onStop: () => void;
  onCancel: () => void;
  onEdit: (text: string) => void;
  onSend: (text: string) => void;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  const t = labels(lang);
  const previewRef = useRef<HTMLTextAreaElement>(null);
  const phase = state.phase;
  useEffect(() => {
    if (phase === "preview") previewRef.current?.focus();
  }, [phase]);

  if (state.phase === "requesting")
    return (
      <div role="status" className="flex items-center gap-3 p-3 text-sm text-slate-700" data-testid="voice-requesting">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#2563EB] border-r-transparent" aria-hidden />
        <span className="flex-1">{t.voiceAllow}</span>
        <button type="button" onClick={onCancel} className="text-xs font-semibold text-slate-600 underline">
          {t.cancel}
        </button>
      </div>
    );

  if (state.phase === "recording")
    return (
      <div className="flex items-center gap-2 p-2" data-testid="voice-recording" role="group" aria-label={t.voiceRecording}>
        <button type="button" onClick={onCancel} aria-label={t.voiceCancel} className={`${ICON_BTN} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}>
          <X className="h-5 w-5" aria-hidden />
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-blue-50 px-3 py-1" role="status" aria-live="off">
          <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-red-500 motion-reduce:animate-none" aria-hidden />
          <span className="w-10 shrink-0 text-sm font-semibold tabular-nums text-slate-800" data-testid="voice-timer">
            {formatDuration(state.seconds)}
          </span>
          <Waveform levels={levels} active />
        </div>
        <button type="button" onClick={onStop} aria-label={t.voiceStop} className={`${ICON_BTN} ${BLUE}`}>
          <Square className="h-4 w-4 fill-current" aria-hidden />
        </button>
      </div>
    );

  if (state.phase === "transcribing")
    return (
      <div role="status" className="flex items-center gap-3 p-3 text-sm text-slate-700" data-testid="voice-transcribing">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#2563EB] border-r-transparent" aria-hidden />
        <span className="flex-1">{t.voiceTranscribing}</span>
        <button type="button" onClick={onCancel} className="text-xs font-semibold text-slate-600 underline">
          {t.cancel}
        </button>
      </div>
    );

  if (state.phase === "preview")
    return (
      <div className="space-y-2 p-3" data-testid="voice-preview">
        <label htmlFor="voice-preview-text" className="text-xs font-semibold text-slate-600">
          {t.voiceCheck}
        </label>
        <textarea
          id="voice-preview-text"
          ref={previewRef}
          rows={2}
          maxLength={800}
          value={state.text}
          onChange={(e) => onEdit(e.target.value)}
          className="max-h-28 min-h-14 w-full resize-none rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#2563EB] focus:outline-none"
        />
        <div className="flex items-center gap-2">
          <button type="button" onClick={onDismiss} className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <X className="h-4 w-4" aria-hidden />
            {t.voiceDiscard}
          </button>
          <button type="button" onClick={onRetry} className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <Mic className="h-4 w-4" aria-hidden />
            {t.voiceAgain}
          </button>
          <button type="button" disabled={state.text.trim() === ""} onClick={() => onSend(state.text)} className={`ml-auto inline-flex min-h-11 items-center gap-1 rounded-lg px-4 text-sm font-semibold disabled:opacity-50 ${BLUE}`}>
            <Send className="h-4 w-4" aria-hidden />
            {t.send}
          </button>
        </div>
      </div>
    );

  if (state.phase === "error")
    return (
      <div role="alert" className="flex items-start gap-3 p-3 text-sm text-slate-800" data-testid="voice-error">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden />
        <p className="flex-1">{errorText(t, state.code)}</p>
        {state.code === "unavailable" || state.code === "unsupported" || state.code === "denied" || state.code === "no_device" ? null : (
          <button type="button" onClick={onRetry} className="text-xs font-semibold text-[#2563EB] underline">
            {t.retry}
          </button>
        )}
        <button type="button" onClick={onDismiss} aria-label={t.close} className="rounded-full p-1 text-slate-500 hover:bg-slate-100">
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    );

  return null;
}

/** The microphone button next to the text box. When voice input is not available it stays visible and says so, and does nothing else. */
export function MicButton({ available, active, lang = "en", onClick }: { available: boolean; active: boolean; lang?: AssistantLang; onClick: () => void }) {
  const t = labels(lang);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={available ? t.voiceStart : t.voiceNotAvailable}
      aria-disabled={!available || undefined}
      aria-pressed={active}
      title={available ? t.voiceStart : t.voiceNotAvailable}
      data-testid="mic-button"
      className={`${ICON_BTN} border ${available ? "border-slate-300 bg-white text-[#2563EB] hover:bg-blue-50" : "border-slate-200 bg-slate-50 text-slate-400"}`}
    >
      <Mic className="h-5 w-5" aria-hidden />
    </button>
  );
}

/** Play, pause, replay and mute for one spoken reply. */
export function VoicePlayerView({
  phase,
  muted,
  progress,
  lang = "en",
  onToggle,
  onReplay,
  onMute,
}: {
  phase: PlayerPhase;
  muted: boolean;
  progress: number;
  lang?: AssistantLang;
  onToggle: () => void;
  onReplay: () => void;
  onMute: () => void;
}) {
  const t = labels(lang);
  const playing = phase === "playing";
  const busy = phase === "loading";
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-1.5 py-1" role="group" aria-label={t.voicePlayer} data-testid="voice-player" data-phase={phase}>
      <button type="button" onClick={onToggle} disabled={busy} aria-label={playing ? t.voicePause : phase === "idle" || phase === "error" ? t.voiceListen : t.voicePlay} className="flex h-8 w-8 items-center justify-center rounded-full bg-[#2563EB] text-white disabled:opacity-60">
        {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-r-transparent" aria-hidden /> : playing ? <Pause className="h-4 w-4" aria-hidden /> : phase === "ended" ? <Check className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
      </button>
      <div className="h-1 w-16 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-label={t.voiceProgress}>
        <div className="h-full bg-[#2563EB]" style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
      <button type="button" onClick={onReplay} disabled={busy} aria-label={t.voiceReplay} className="flex h-8 w-8 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 disabled:opacity-50">
        <RotateCcw className="h-4 w-4" aria-hidden />
      </button>
      <button type="button" onClick={onMute} aria-label={muted ? t.voiceUnmute : t.voiceMute} aria-pressed={muted} className="flex h-8 w-8 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100">
        {muted ? <VolumeX className="h-4 w-4" aria-hidden /> : <Volume2 className="h-4 w-4" aria-hidden />}
      </button>
      {phase === "error" ? <span className="px-1 text-[11px] text-amber-700">{t.voicePlayFailed}</span> : null}
    </div>
  );
}
