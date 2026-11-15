import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MicButton, VoiceComposer, VoicePlayerView } from "@/components/assistant/voice/voice-ui";

/** Audit of the existing voice UI against the new routes' behaviour. Static markup only. Says nothing about speech quality: Sinhala/Singlish voice is unevaluated. */
const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);
const noop = () => {};
const composer = (state: Parameters<typeof VoiceComposer>[0]["state"]) => html(createElement(VoiceComposer, { state, levels: [], lang: "en", onStop: noop, onCancel: noop, onEdit: noop, onSend: noop, onRetry: noop, onDismiss: noop }));

describe("voice UI error handling matches what the routes can answer", () => {
  it("announces a playback failure to assistive technology (status), not only as coloured text", () => {
    const out = html(createElement(VoicePlayerView, { phase: "error", muted: false, progress: 0, lang: "en", onToggle: noop, onReplay: noop, onMute: noop }));
    expect(out).toContain('role="status"');
    expect(out).toContain("Could not play audio");
  });

  it("every route failure has plain wording, and only the transient ones offer a retry", () => {
    const retryable = ["too_short", "too_large", "rate_limited", "failed"] as const;
    const final = ["unavailable", "unsupported", "denied", "no_device"] as const;
    for (const code of retryable) {
      const out = composer({ phase: "error", code });
      expect(out, code).toContain('role="alert"');
      expect(out, code).toContain("Try again");
    }
    for (const code of final) {
      const out = composer({ phase: "error", code });
      expect(out, code).toContain('role="alert"');
      expect(out, code).not.toContain("Try again"); // retrying cannot help: voice is off, or the browser/permission blocks it
    }
  });

  it("the recognised text is shown for the shopper to read and edit before anything is sent, and an empty text cannot be sent", () => {
    const out = composer({ phase: "preview", text: "" });
    expect(out).toContain("<textarea");
    expect(out).toContain("Check what I heard");
    expect(out).toMatch(/<button[^>]*disabled=""[^>]*>[^]*Send/);
  });

  it("the unavailable microphone stays visible, labelled, and does not look like a working control", () => {
    const out = html(createElement(MicButton, { available: false, active: false, onClick: noop }));
    expect(out).toContain('aria-disabled="true"');
    expect(out).toContain("Voice input is not available yet");
  });
});
