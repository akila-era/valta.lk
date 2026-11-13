/**
 * The recording flow as a small pure state machine, so every state and transition can be tested without a browser:
 *   idle -> requesting (asking for the microphone) -> recording -> transcribing -> preview (editable text) -> idle (sent or discarded)
 * with cancel from requesting/recording, and error states that always lead back to idle.
 */
export type VoiceErrorCode = "unsupported" | "denied" | "no_device" | "too_short" | "unavailable" | "too_large" | "rate_limited" | "failed";

export type RecorderState =
  | { phase: "idle" }
  | { phase: "requesting" }
  | { phase: "recording"; seconds: number }
  | { phase: "transcribing" }
  | { phase: "preview"; text: string }
  | { phase: "error"; code: VoiceErrorCode };

export type RecorderEvent =
  | { type: "request" }
  | { type: "granted" }
  | { type: "tick"; seconds: number }
  | { type: "stop" }
  | { type: "cancel" }
  | { type: "transcribed"; text: string }
  | { type: "edit"; text: string }
  | { type: "failed"; code: VoiceErrorCode }
  | { type: "reset" };

export const MAX_RECORD_SECONDS = 60;
export const MIN_RECORD_SECONDS = 0.6;

export const initialRecorder: RecorderState = { phase: "idle" };

export function recorderReducer(state: RecorderState, event: RecorderEvent): RecorderState {
  switch (event.type) {
    case "request":
      return state.phase === "idle" || state.phase === "error" ? { phase: "requesting" } : state;
    case "granted":
      return state.phase === "requesting" ? { phase: "recording", seconds: 0 } : state;
    case "tick":
      return state.phase === "recording" ? { phase: "recording", seconds: Math.min(MAX_RECORD_SECONDS, event.seconds) } : state;
    case "stop":
      return state.phase === "recording" ? { phase: "transcribing" } : state;
    case "cancel":
      return state.phase === "requesting" || state.phase === "recording" || state.phase === "transcribing" ? initialRecorder : state;
    case "transcribed":
      // An empty result is not a preview: nothing was heard.
      return state.phase === "transcribing" ? (event.text.trim() === "" ? { phase: "error", code: "failed" } : { phase: "preview", text: event.text }) : state;
    case "edit":
      return state.phase === "preview" ? { phase: "preview", text: event.text.slice(0, 800) } : state;
    case "failed":
      return state.phase === "idle" ? state : { phase: "error", code: event.code };
    case "reset":
      return initialRecorder;
  }
}

export const formatDuration = (seconds: number): string => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
