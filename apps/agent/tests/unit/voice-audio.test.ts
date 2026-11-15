import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { inspectAudio, inspectSpeechOutput, MAX_AUDIO_BYTES } from "../../src/voice/audio";
import { box, el, mp4, ogg, wav, webm } from "./voice-fixtures";

const ok = (b: Buffer, o?: Parameters<typeof inspectAudio>[1]) => {
  const r = inspectAudio(b, o);
  if (!r.ok) throw new Error(`refused: ${r.reason}`);
  return r;
};
const refused = (b: Buffer, o?: Parameters<typeof inspectAudio>[1]) => {
  const r = inspectAudio(b, o);
  return r.ok ? "accepted" : r.reason;
};

describe("accepts real structures and reports the duration", () => {
  it("wav: exact duration", () => {
    const r = ok(wav({ seconds: 2 }));
    expect(r).toMatchObject({ format: "wav", durationMs: 2000, exact: true, silent: false });
  });
  it("ogg/opus: duration from the last granule position minus pre-skip, never labelled exact (the sender wrote it)", () => {
    expect(ok(ogg({ seconds: 3 }))).toMatchObject({ format: "ogg", durationMs: 3000, exact: false });
  });
  it("webm/opus: duration estimated from block times (live recordings carry none), or read from Info", () => {
    const live = ok(webm({ seconds: 2 }));
    expect(live.format).toBe("webm");
    expect(live.exact).toBe(false);
    expect(live.durationMs).toBeGreaterThan(1800);
    expect(live.durationMs).toBeLessThan(2200);
    expect(ok(webm({ seconds: 2, withDuration: true, knownSegment: true })).durationMs).toBe(2000);
  });
  it("mp4/m4a: duration from mdhd; fragmented files from trun sums", () => {
    expect(ok(mp4({ seconds: 4 }))).toMatchObject({ format: "mp4", durationMs: 4000, exact: false });
    const frag = ok(mp4({ seconds: 4, fragmented: true }));
    expect(frag.durationMs).toBeGreaterThan(3900);
    expect(frag.durationMs).toBeLessThan(4100);
  });
  it("the file's own content decides, whatever a client would call it", () => {
    // There is no content-type parameter at all: a webm is a webm.
    expect(ok(webm()).format).toBe("webm");
  });
});

describe("refuses what is not valid audio", () => {
  it("empty, tiny, random and text files", () => {
    expect(refused(Buffer.alloc(0))).toBe("empty");
    expect(refused(Buffer.from("RIFF"))).toBe("unrecognised");
    expect(refused(randomBytes(4000))).toBe("unrecognised");
    expect(refused(Buffer.from("<html><script>alert(1)</script></html>"))).toBe("unrecognised");
    expect(refused(Buffer.from("GIF89a" + "x".repeat(100)))).toBe("unrecognised");
  });
  it("over the byte cap, before any parsing", () => {
    expect(refused(Buffer.alloc(MAX_AUDIO_BYTES + 1))).toBe("too_large");
    expect(refused(wav({ seconds: 1 }), { maxBytes: 100 })).toBe("too_large");
  });
  it("too long or too short by the header", () => {
    expect(refused(wav({ seconds: 31 }))).toBe("too_long");
    expect(refused(ogg({ seconds: 40 }))).toBe("too_long");
    expect(refused(mp4({ seconds: 45 }))).toBe("too_long");
    expect(refused(webm({ seconds: 45, withDuration: true }))).toBe("too_long");
    expect(refused(wav({ seconds: 0.1 }))).toBe("too_short");
    expect(refused(wav({ seconds: 5 }), { maxSeconds: 3 })).toBe("too_long");
  });
  it("truncated recordings", () => {
    for (const b of [wav({ seconds: 1 }), ogg(), webm(), mp4()]) {
      const cut = b.subarray(0, Math.floor(b.length * 0.6));
      expect(refused(cut)).not.toBe("accepted");
    }
  });
  it("polyglots: valid audio with anything appended is refused", () => {
    const zip = Buffer.concat([Buffer.from("PK\x03\x04", "latin1"), randomBytes(200)]);
    for (const b of [wav(), ogg(), webm({ knownSegment: true }), mp4()]) expect(refused(Buffer.concat([b, zip]))).not.toBe("accepted");
  });
  it("video and unsupported codecs", () => {
    expect(refused(webm({ trackType: 1, codec: "V_VP8" }))).toBe("unsupported_codec");
    expect(refused(webm({ codec: "A_VORBIS" }))).toBe("unsupported_codec");
    expect(refused(webm({ docType: "matroska" }))).toBe("unrecognised");
    expect(refused(mp4({ handler: "vide" }))).toBe("unsupported_codec");
    expect(refused(mp4({ entry: "avc1" }))).toBe("unsupported_codec");
    const qt = mp4({ brand: "qt  " });
    qt.write("xxxx", qt.indexOf("isom"), "latin1"); // no audio brand left in ftyp
    expect(refused(qt)).toBe("unrecognised");
  });
  it("wav with an unsupported format tag or inconsistent header", () => {
    const b = wav();
    b.writeUInt16LE(85, 20); // MP3-in-WAV tag
    expect(refused(b)).toBe("unsupported_codec");
    const c = wav();
    c.writeUInt32LE(1, 28); // wrong byte rate
    expect(refused(c)).toBe("malformed");
  });
  it("ogg: any single changed byte is caught by the page checksum", () => {
    const base = ogg({ seconds: 1 });
    for (let i = 0; i < base.length; i += 7) {
      const m = Buffer.from(base);
      m[i] = m[i]! ^ 0x55;
      expect(refused(m)).not.toBe("accepted");
    }
  });
  it("ogg that is not Opus is refused", () => {
    const b = ogg();
    expect(refused(Buffer.from(b.toString("latin1").replace("OpusHead", "vorbHead"), "latin1"))).not.toBe("accepted");
  });
  it("silent PCM wav is flagged so the engine is not asked to invent words", () => {
    expect(ok(wav({ seconds: 1, amplitude: 0 })).silent).toBe(true);
    expect(ok(wav({ seconds: 1, amplitude: 5000 })).silent).toBe(false);
  });
  it("a compressed file whose duration cannot be read is bounded by size", () => {
    const frag = mp4({ fragmented: true, seconds: 1, mdatBytes: 800_000 });
    // fragmented with a plain trun sum still reports a duration, so build the unknown case by dropping the moof
    const noDur = Buffer.concat([box("ftyp", Buffer.from("M4A ", "latin1"), Buffer.alloc(4), Buffer.from("isom", "latin1")), box("moov", box("mvhd", Buffer.alloc(100))), box("mdat", randomBytes(900_000))]);
    expect(refused(noDur)).not.toBe("accepted");
    expect(frag.length).toBeGreaterThan(800_000);
  });
});

describe("speech output check (what a TTS engine returned)", () => {
  it("accepts wav and an mp3 frame header, refuses everything else", () => {
    expect(inspectSpeechOutput(wav({ seconds: 1 }))).toMatchObject({ ok: true, contentType: "audio/wav" });
    const mp3 = Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x00]), randomBytes(16_000)]); // MPEG-1 Layer III, 128 kb/s
    expect(inspectSpeechOutput(mp3)).toMatchObject({ ok: true, contentType: "audio/mpeg" });
    expect(inspectSpeechOutput(Buffer.from("<html>"))).toMatchObject({ ok: false });
    expect(inspectSpeechOutput(ogg())).toMatchObject({ ok: false });
    expect(inspectSpeechOutput(wav({ seconds: 70 }), { maxBytes: 5_000_000 })).toMatchObject({ ok: false });
    expect(inspectSpeechOutput(Buffer.alloc(0))).toMatchObject({ ok: false, reason: "empty" });
  });
});

describe("fuzz: malformed input never crashes, stays fast and uses bounded memory", () => {
  const seeds = [wav({ seconds: 1 }), ogg({ seconds: 1 }), webm({ seconds: 1 }), mp4({ seconds: 1 }), mp4({ seconds: 1, fragmented: true })];

  it("600 mutated and truncated inputs", () => {
    const heapBefore = process.memoryUsage().heapUsed;
    const t0 = performance.now();
    let accepted = 0;
    for (let n = 0; n < 600; n++) {
      const seed = seeds[n % seeds.length]!;
      const m = Buffer.from(seed);
      const kind = n % 4;
      let b: Buffer = m;
      if (kind === 0) for (let k = 0; k < 1 + (n % 5); k++) m[Math.floor(Math.random() * m.length)] = Math.floor(Math.random() * 256);
      else if (kind === 1) b = m.subarray(0, Math.floor(Math.random() * m.length));
      else if (kind === 2) b = Buffer.concat([m.subarray(0, Math.floor(Math.random() * m.length)), randomBytes(Math.floor(Math.random() * 64))]);
      else {
        const i = Math.floor(Math.random() * Math.max(1, m.length - 8));
        m.writeUInt32BE(0xffffffff, i);
      }
      const r = inspectAudio(b); // must return, never throw
      expect(typeof r.ok).toBe("boolean");
      if (r.ok) accepted++;
    }
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(5_000);
    expect((process.memoryUsage().heapUsed - heapBefore) / 1e6).toBeLessThan(150);
    expect(accepted).toBeLessThan(600); // sanity: mutation is being detected at least sometimes
  });

  it("600 fully random buffers of random lengths with a valid magic prefix", () => {
    const prefixes = [Buffer.from("RIFF\x10\x00\x00\x00WAVE", "latin1"), Buffer.from("OggS\x00\x02", "latin1"), Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f]), Buffer.from("\x00\x00\x00\x18ftypM4A ", "latin1")];
    const t0 = performance.now();
    for (let n = 0; n < 600; n++) {
      const b = Buffer.concat([prefixes[n % prefixes.length]!, randomBytes(Math.floor(Math.random() * 4000))]);
      expect(typeof inspectAudio(b).ok).toBe("boolean");
    }
    expect(performance.now() - t0).toBeLessThan(5_000);
  });

  it("hostile structures: huge declared sizes, deep nesting and endless siblings", () => {
    const hugeEl = Buffer.concat([el(0x1a45dfa3, Buffer.concat([el(0x4282, "webm")])), Buffer.from([0x18, 0x53, 0x80, 0x67, 0x01, 0x00, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff])]);
    expect(refused(hugeEl)).not.toBe("accepted");
    const manyVoids = Buffer.concat([el(0x1a45dfa3, el(0x4282, "webm")), Buffer.from([0x18, 0x53, 0x80, 0x67, 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]), ...Array.from({ length: 5_000 }, () => el(0xec, [0]))]);
    const t0 = performance.now();
    expect(refused(manyVoids)).not.toBe("accepted");
    expect(performance.now() - t0).toBeLessThan(1_000);
    const hugeBox = Buffer.concat([box("ftyp", Buffer.from("M4A ", "latin1"), Buffer.alloc(4)), Buffer.from([0xff, 0xff, 0xff, 0xff, 0x6d, 0x6f, 0x6f, 0x76])]);
    expect(refused(hugeBox)).not.toBe("accepted");
    const loopBoxes = Buffer.concat([box("ftyp", Buffer.from("M4A ", "latin1"), Buffer.alloc(4)), Buffer.from([0, 0, 0, 8, 0x6d, 0x6f, 0x6f, 0x76])]);
    expect(refused(loopBoxes)).not.toBe("accepted");
  });
});
