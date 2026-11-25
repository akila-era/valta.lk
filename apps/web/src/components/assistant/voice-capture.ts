/**
 * Records one spoken sentence from the microphone and hands it back as a 16 kHz mono WAV (base64), ready to be
 * transcribed on the server. The recording ends by itself when the shopper stops talking, so no language has to be
 * chosen up front: the transcriber works out whether it was English, Sinhala or Tamil.
 *
 * Raw samples are collected with Web Audio (no MediaRecorder), so every browser produces the same WAV that Gemini accepts.
 */
export type CaptureResult =
  | { ok: true; wav: string; maxLevel: number }
  | { ok: false; reason: "denied" | "no-mic" | "silence" | "failed"; maxLevel: number };

export interface Capture {
  /** Finish now: whatever was said so far is still returned. */
  stop(): void;
  result: Promise<CaptureResult>;
}

const TARGET_RATE = 16_000;
const NO_SPEECH_MS = 7_000; // nobody started talking
const SILENCE_MS = 1_500; // quiet after talking: the sentence is over
const MAX_MS = 15_000; // hard limit per sentence (keeps uploads small)

export const canCapture = () => typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof AudioContext !== "undefined";

function toWav(parts: Int16Array[]): string {
  const samples = parts.reduce((n, p) => n + p.length, 0);
  const bytes = new Uint8Array(44 + samples * 2);
  const v = new DataView(bytes.buffer);
  const tag = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  tag(0, "RIFF");
  v.setUint32(4, 36 + samples * 2, true);
  tag(8, "WAVE");
  tag(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, TARGET_RATE, true);
  v.setUint32(28, TARGET_RATE * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  tag(36, "data");
  v.setUint32(40, samples * 2, true);
  let o = 44;
  for (const p of parts) {
    for (let i = 0; i < p.length; i++, o += 2) v.setInt16(o, p[i], true);
  }
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function captureUtterance(onLevel: (v: number) => void): Capture {
  let stopRequested = false;
  let finish: (r: CaptureResult) => void = () => {};
  const result = new Promise<CaptureResult>((resolve) => (finish = resolve));

  void (async () => {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch (e) {
      const name = (e as DOMException)?.name;
      finish({ ok: false, reason: name === "NotFoundError" || name === "OverconstrainedError" ? "no-mic" : "denied", maxLevel: 0 });
      return;
    }
    try {
      const ctx = new AudioContext();
      await ctx.resume().catch(() => undefined);
      const source = ctx.createMediaStreamSource(stream);
      const proc = ctx.createScriptProcessor(4096, 1, 1);
      const mute = ctx.createGain();
      mute.gain.value = 0; // the processor must be wired to the output to run; silence so the shopper never hears themselves
      source.connect(proc);
      proc.connect(mute);
      mute.connect(ctx.destination);

      const ratio = ctx.sampleRate / TARGET_RATE;
      const parts: Int16Array[] = [];
      const startedAt = performance.now();
      let spoke = false;
      let loudMs = 0;
      let lastLoud = startedAt;
      let noise = 0.03;
      let maxLevel = 0;
      let done = false;

      const end = (r: (maxLevel: number) => CaptureResult) => {
        if (done) return;
        done = true;
        proc.onaudioprocess = null;
        try {
          proc.disconnect();
          source.disconnect();
          mute.disconnect();
        } catch {
          /* already disconnected */
        }
        stream.getTracks().forEach((t) => t.stop());
        void ctx.close();
        onLevel(0);
        finish(r(maxLevel));
      };

      proc.onaudioprocess = (e) => {
        if (done) return;
        const input = e.inputBuffer.getChannelData(0);
        let sum = 0;
        for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
        const level = Math.min(1, Math.sqrt(sum / input.length) * 6);
        maxLevel = Math.max(maxLevel, level);
        onLevel(level);
        const now = performance.now();
        const chunkMs = (input.length / ctx.sampleRate) * 1000;
        if (!spoke) noise = noise * 0.95 + level * 0.05; // learn the room's background level before the shopper speaks
        const threshold = Math.max(0.1, noise * 3);
        if (level > threshold) {
          loudMs += chunkMs;
          lastLoud = now;
          if (loudMs >= 150) spoke = true;
        }
        // Downsample to 16 kHz by averaging each window.
        const outLen = Math.floor(input.length / ratio);
        const out = new Int16Array(outLen);
        for (let i = 0; i < outLen; i++) {
          const from = Math.floor(i * ratio);
          const to = Math.max(from + 1, Math.floor((i + 1) * ratio));
          let s = 0;
          for (let j = from; j < to && j < input.length; j++) s += input[j];
          const avg = Math.max(-1, Math.min(1, s / (to - from)));
          out[i] = avg < 0 ? avg * 0x8000 : avg * 0x7fff;
        }
        parts.push(out);

        const finished = spoke && (now - lastLoud > SILENCE_MS || stopRequested);
        if (finished || now - startedAt > MAX_MS) end((m) => ({ ok: true, wav: toWav(parts), maxLevel: m }));
        else if (!spoke && (now - startedAt > NO_SPEECH_MS || stopRequested)) end((m) => ({ ok: false, reason: "silence", maxLevel: m }));
      };
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      onLevel(0);
      finish({ ok: false, reason: "failed", maxLevel: 0 });
    }
  })();

  return { stop: () => void (stopRequested = true), result };
}
