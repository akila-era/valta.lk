import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ClearConfirm, LanguageSelector, PanelHeader, TypingIndicator, Welcome } from "@/components/assistant/panel-parts";
import { labels } from "@/components/assistant/labels";
import type { RecorderState } from "@/components/assistant/voice/recorder-state";
import { MicButton, VoiceComposer, VoicePlayerView, Waveform } from "@/components/assistant/voice/voice-ui";

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);
const noop = () => {};
const levels = Array.from({ length: 24 }, (_, i) => i / 24);

const composer = (state: RecorderState, lang: "en" | "si" = "en") =>
  html(createElement(VoiceComposer, { state, levels, lang, onStop: noop, onCancel: noop, onEdit: noop, onSend: noop, onRetry: noop, onDismiss: noop }));

describe("microphone button", () => {
  it("is a normal, labelled button when voice input is available", () => {
    const out = html(createElement(MicButton, { available: true, active: false, onClick: noop }));
    expect(out).toContain('aria-label="Record a voice message"');
    expect(out).not.toContain("aria-disabled");
  });

  it("stays visible and says plainly that voice input is not available yet when it is not", () => {
    const out = html(createElement(MicButton, { available: false, active: false, onClick: noop }));
    expect(out).toContain("Voice input is not available yet");
    expect(out).toContain('aria-disabled="true"');
    expect(out).toContain("text-slate-400");
  });
});

describe("recording, transcribing and preview states", () => {
  it("shows the recording timer, a waveform and both stop and cancel controls", () => {
    const out = composer({ phase: "recording", seconds: 7 });
    expect(out).toContain('data-testid="voice-recording"');
    expect(out).toContain(">0:07<");
    expect(out.match(/<span class="w-\[3px\]/g)).toHaveLength(24);
    expect(out).toContain('aria-label="Stop recording and transcribe"');
    expect(out).toContain('aria-label="Cancel recording"');
  });

  it("asks the shopper to allow the microphone, with a way to cancel", () => {
    const out = composer({ phase: "requesting" });
    expect(out).toContain("Allow the microphone");
    expect(out).toContain("Cancel");
  });

  it("shows progress while turning the voice into text", () => {
    expect(composer({ phase: "transcribing" })).toContain("Turning your voice into text");
  });

  it("shows the recognised text in an editable box with Send, Discard and Record again", () => {
    const out = composer({ phase: "preview", text: "show me phones" });
    expect(out).toContain("<textarea");
    expect(out).toContain("show me phones");
    expect(out).toContain("Check what I heard");
    for (const word of ["Send", "Discard", "Record again"]) expect(out).toContain(word);
    expect(out).not.toMatch(/<button[^>]*disabled=""[^>]*>[^<]*<svg[^>]*><\/svg>Send/);
  });

  it("disables Send when the edited text is empty", () => {
    expect(composer({ phase: "preview", text: "   " })).toMatch(/disabled=""[^>]*>[\s\S]*?Send/);
  });

  it.each([
    ["unsupported", "cannot record audio"],
    ["denied", "blocked"],
    ["no_device", "No microphone"],
    ["too_short", "too short"],
    ["unavailable", "not available yet"],
    ["too_large", "too long"],
    ["rate_limited", "Too many voice messages"],
    ["failed", "could not understand"],
  ] as const)("shows a clear message for %s", (code, text) => {
    const out = composer({ phase: "error", code });
    expect(out).toContain('role="alert"');
    expect(out).toContain(text);
  });

  it("offers Try again only for errors a retry can fix", () => {
    for (const code of ["too_short", "failed", "rate_limited", "too_large"] as const) expect(composer({ phase: "error", code }), code).toContain("Try again");
    for (const code of ["unavailable", "unsupported", "denied", "no_device"] as const) expect(composer({ phase: "error", code }), code).not.toContain("Try again");
  });

  it("renders nothing while idle, and has Sinhala wording (provisional) for the same states", () => {
    expect(composer({ phase: "idle" })).toBe("");
    expect(composer({ phase: "recording", seconds: 3 }, "si")).toContain("පටිගත කරමින්");
  });

  it("waveform bars respect reduced motion and dim when inactive", () => {
    const out = html(createElement(Waveform, { levels, active: false }));
    expect(out).toContain("motion-reduce:transition-none");
    expect(out).toContain("opacity-40");
  });
});

describe("voice reply player", () => {
  const view = (phase: Parameters<typeof VoicePlayerView>[0]["phase"], muted = false, progress = 0) => html(createElement(VoicePlayerView, { phase, muted, progress, onToggle: noop, onReplay: noop, onMute: noop }));

  it("offers Listen before anything is loaded and after a failure", () => {
    expect(view("idle")).toContain('aria-label="Listen to this reply"');
    expect(view("error")).toContain("Could not play audio");
  });

  it("shows Play when ready or paused, and Pause while playing", () => {
    expect(view("ready")).toContain('aria-label="Play"');
    expect(view("paused")).toContain('aria-label="Play"');
    expect(view("playing")).toContain('aria-label="Pause"');
  });

  it("has replay, a mute toggle that reflects its state, and a progress bar", () => {
    expect(view("playing")).toContain('aria-label="Replay"');
    expect(view("playing", false)).toContain('aria-label="Mute"');
    const muted = view("playing", true, 0.5);
    expect(muted).toContain('aria-label="Unmute"');
    expect(muted).toContain('aria-pressed="true"');
    expect(muted).toContain('aria-valuenow="50"');
  });

  it("disables the controls while the audio is loading", () => {
    expect(view("loading")).toMatch(/disabled=""/);
    expect(view("loading")).toContain('data-phase="loading"');
  });
});

describe("modal header, language, welcome, typing and clear confirmation", () => {
  const header = (over: Partial<Parameters<typeof PanelHeader>[0]> = {}) =>
    html(createElement(PanelHeader, { lang: "en", demo: true, ttsAvailable: false, voiceOutput: false, canClear: false, onToggleVoiceOutput: noop, onClear: noop, onClose: noop, ...over }));

  it("brands the modal as VOLTA AI with its tagline and the demo-data label", () => {
    const out = header();
    expect(out).toContain("VOLTA AI");
    expect(out).toContain("Shopping assistant");
    expect(out).toContain("Beta");
    expect(out).toContain("demo data");
    expect(header({ demo: false })).not.toContain("demo data");
  });

  it("disables the spoken-replies switch with an honest label when text to speech is not available, and the clear button when there is nothing to clear", () => {
    const out = header();
    expect(out).toMatch(/aria-label="Voice replies are not available yet"[^>]*disabled=""|disabled=""[^>]*aria-label="Voice replies are not available yet"/);
    expect(out).toMatch(/disabled=""[^>]*data-testid="clear-conversation"|data-testid="clear-conversation"[^>]*disabled=""|aria-label="Clear conversation"[^>]*disabled=""/);
    const on = header({ ttsAvailable: true, voiceOutput: true, canClear: true });
    expect(on).toContain('aria-label="Voice replies on"');
    expect(on).toContain('aria-pressed="true"');
  });

  it("offers Auto, English and Sinhala as a radio group with the current choice checked", () => {
    const out = html(createElement(LanguageSelector, { value: "si", lang: "en", onChange: noop }));
    expect(out).toContain('role="radiogroup"');
    for (const name of ["Auto", "English", "සිංහල"]) expect(out).toContain(name);
    expect(out.match(/aria-checked="true"/g)).toHaveLength(1);
    expect(out).toMatch(/aria-checked="true"[^>]*>සිංහල/);
  });

  it("welcomes with the brand, the testing note when on demo data, and starter suggestions", () => {
    const out = html(createElement(Welcome, { lang: "en", demo: true, starters: ["Show me phones"], onPick: noop }));
    expect(out).toContain("Hi, I&#x27;m VOLTA AI");
    expect(out).toContain("demo data");
    expect(out).toContain("Show me phones");
    expect(html(createElement(Welcome, { lang: "en", demo: false, starters: [], onPick: noop }))).not.toContain("demo data");
  });

  it("shows a polite, busy 'thinking' indicator", () => {
    const out = html(createElement(TypingIndicator, { lang: "en" }));
    expect(out).toContain('role="status"');
    expect(out).toContain('aria-busy="true"');
    expect(out).toContain("VOLTA AI is thinking");
  });

  it("asks before clearing, with the cart reassurance and both choices", () => {
    const out = html(createElement(ClearConfirm, { lang: "en", onConfirm: noop, onCancel: noop }));
    expect(out).toContain('role="alertdialog"');
    expect(out).toContain("Clear this conversation?");
    expect(out).toContain("Your cart is not affected");
    expect(out).toContain("Keep chatting");
  });
});

describe("labels", () => {
  it("have provisional Sinhala wording for every voice and modal label", () => {
    const en = labels("en");
    const si = labels("si");
    for (const k of Object.keys(en) as (keyof typeof en)[]) {
      expect(si[k], k).toBeTruthy();
      if (!["assistantName", "langEn", "langSi"].includes(k)) expect(si[k], k).not.toBe(en[k]);
    }
  });
});

