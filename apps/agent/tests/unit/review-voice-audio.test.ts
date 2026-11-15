import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { inspectAudio, MAX_AUDIO_BYTES } from "../../src/voice/audio";
import { cleanText } from "../../src/voice/text";
import { box, el, mp4, ogg, wav, webm } from "./voice-fixtures";

/**
 * INDEPENDENT REVIEW (Agent F), audio validation. Inputs that are NOT in the authors' fuzz set. `it.fails` marks a REAL DEFECT: the test asserts
 * the secure behaviour, currently fails, and turns red the day the defect is fixed.
 */
const u32 = (n: number) => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
};

// ---- crafted containers whose declared duration LIES about how much audio they carry

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let r = i << 24;
    for (let k = 0; k < 8; k++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1;
    t[i] = r >>> 0;
  }
  return t;
})();
function oggPage(serial: number, seq: number, type: number, granule: bigint, segs: number[], payload: Buffer): Buffer {
  const h = Buffer.alloc(27 + segs.length);
  h.write("OggS", 0, "latin1");
  h.writeUInt8(type, 5);
  h.writeBigInt64LE(granule, 6);
  h.writeUInt32LE(serial, 14);
  h.writeUInt32LE(seq, 18);
  h.writeUInt8(segs.length, 26);
  Buffer.from(segs).copy(h, 27);
  const page = Buffer.concat([h, payload]);
  let c = 0;
  for (let i = 0; i < page.length; i++) c = ((c << 8) ^ CRC[((c >>> 24) ^ page[i]!) & 0xff]!) >>> 0;
  page.writeUInt32LE(c, 22);
  return page;
}
function oggLying(declaredSeconds: number, payloadBytes: number): Buffer {
  const head = Buffer.alloc(19);
  head.write("OpusHead", 0, "latin1");
  head.writeUInt8(1, 8);
  head.writeUInt8(1, 9);
  head.writeUInt16LE(312, 10);
  head.writeUInt32LE(48_000, 12);
  const tags = Buffer.concat([Buffer.from("OpusTags", "latin1"), Buffer.from([4, 0, 0, 0]), Buffer.from("test"), Buffer.from([0, 0, 0, 0])]);
  const pages: Buffer[] = [oggPage(1, 0, 0x02, 0n, [19], head), oggPage(1, 1, 0, 0n, [tags.length], tags)];
  const perPage = 254 * 255 + 100;
  const segs = [...Array<number>(254).fill(255), 100];
  const n = Math.floor(payloadBytes / perPage);
  const total = BigInt(Math.round(declaredSeconds * 48_000) + 312);
  for (let i = 0; i < n; i++) pages.push(oggPage(1, 2 + i, i === n - 1 ? 0x04 : 0, i === n - 1 ? total : BigInt(i + 1), segs, randomBytes(perPage)));
  return Buffer.concat(pages);
}
function webmLying(declaredSeconds: number, blocks: number, blockBytes: number, honestTimes: boolean): Buffer {
  const f32 = Buffer.alloc(4);
  f32.writeFloatBE(declaredSeconds * 1000);
  const ebml = el(0x1a45dfa3, Buffer.concat([el(0x4282, "webm")]));
  const info = el(0x1549a966, Buffer.concat([el(0x2ad7b1, [0x0f, 0x42, 0x40]), el(0x4489, f32)]));
  const tracks = el(0x1654ae6b, el(0xae, Buffer.concat([el(0x83, [2]), el(0x86, "A_OPUS")])));
  const blks: Buffer[] = [];
  for (let k = 0; k < blocks; k++) {
    const t = honestTimes ? (k * 20) % 30_000 : 0;
    const tb = Buffer.alloc(2);
    tb.writeInt16BE(t > 32_000 ? 0 : t);
    blks.push(el(0xa3, Buffer.concat([Buffer.from([0x81]), tb, Buffer.from([0x80]), randomBytes(blockBytes)])));
  }
  const clusters: Buffer[] = [];
  for (let i = 0; i < blks.length; i += 1500) clusters.push(el(0x1f43b675, Buffer.concat([el(0xe7, [0]), ...blks.slice(i, i + 1500)])));
  return Buffer.concat([ebml, el(0x18538067, Buffer.concat([info, tracks, ...clusters]))]);
}

describe("lying durations: a file that declares a short recording but carries a huge one", () => {
  it("FIXED: WebM declaring 2 s (Duration element) but carrying ~4.9 MB of Opus blocks is refused", () => {
    const f = webmLying(2, 4_900, 1_000, true);
    expect(f.length).toBeGreaterThan(4_800_000);
    expect(f.length).toBeLessThanOrEqual(MAX_AUDIO_BYTES);
    const r = inspectAudio(f);
    expect(r.ok, JSON.stringify(r)).toBe(false);
  });

  it("FIXED: Ogg/Opus declaring 2 s (final granule position) but carrying ~4.9 MB is refused", () => {
    const f = oggLying(2, 4_900_000);
    expect(f.length).toBeGreaterThan(4_800_000);
    expect(f.length).toBeLessThanOrEqual(MAX_AUDIO_BYTES);
    const r = inspectAudio(f);
    expect(r.ok, JSON.stringify(r)).toBe(false);
  });

  it("FIXED: MP4 declaring 2 s (mdhd) but carrying ~4.9 MB in mdat is refused", () => {
    const f = mp4({ seconds: 2, mdatBytes: 4_900_000 });
    const r = inspectAudio(f);
    expect(r.ok, JSON.stringify(r)).toBe(false);
  });

  it("the honest sizes of the same containers ARE accepted (so the three failures above are the lie, not a broken builder)", () => {
    expect(inspectAudio(webm({ seconds: 2, withDuration: true })).ok).toBe(true);
    expect(inspectAudio(ogg({ seconds: 2 })).ok).toBe(true);
    expect(inspectAudio(mp4({ seconds: 2 })).ok).toBe(true);
  });
});

describe("worst-case parse cost of a 5 MB hostile upload stays small (measured)", () => {
  const time = (label: string, buf: Buffer): number => {
    const t0 = performance.now();
    inspectAudio(buf);
    const ms = performance.now() - t0;
    console.log(`PARSE-COST ${label}: ${ms.toFixed(1)} ms for ${buf.length} bytes`);
    return ms;
  };

  it("webm with ~1.2M tiny elements (step budget), ogg with 76 max pages, mp4 with 20,000 boxes, wav with 2.5M samples", () => {
    const tiny = Buffer.concat(Array.from({ length: 400_000 }, () => Buffer.from([0xec, 0x81, 0x00]))); // Void elements
    const w = Buffer.concat([
      el(0x1a45dfa3, el(0x4282, "webm")),
      Buffer.concat([Buffer.from([0x18, 0x53, 0x80, 0x67]), Buffer.from([0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]), el(0x1549a966, el(0x2ad7b1, [0x0f, 0x42, 0x40])), tiny]),
    ]);
    const boxes = Buffer.concat([box("ftyp", Buffer.from("M4A ", "latin1"), u32(0)), ...Array.from({ length: 150_000 }, () => box("free")), box("moov", box("mvhd", Buffer.alloc(100)))]);
    const times = [time("webm tiny elements", w), time("ogg max pages", oggLying(2, 4_900_000)), time("mp4 many boxes", boxes), time("wav 5MB", wav({ seconds: 1, rate: 8000, bits: 8 }))];
    for (const t of times) expect(t).toBeLessThan(1_500);
  });
});

describe("crafted malformed containers are refused cleanly (never thrown, never hung)", () => {
  const verdict = (b: Buffer) => {
    const t0 = performance.now();
    const r = inspectAudio(b);
    expect(performance.now() - t0).toBeLessThan(500);
    return r;
  };

  it("huge declared sizes in headers", () => {
    const w = Buffer.from(wav());
    w.writeUInt32LE(0xffffffff, 4); // RIFF size
    expect(verdict(w).ok).toBe(false);
    const w2 = Buffer.from(wav());
    w2.writeUInt32LE(0xffffffff, 40); // data chunk size
    expect(verdict(w2).ok).toBe(false);
    const m = Buffer.from(mp4());
    m.writeUInt32BE(0xffffffff, 0); // ftyp size
    expect(verdict(m).ok).toBe(false);
    const big = Buffer.concat([Buffer.from([0, 0, 0, 1]), Buffer.from("ftyp", "latin1"), Buffer.from([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]), Buffer.alloc(32)]);
    expect(verdict(big).ok).toBe(false); // 64-bit largesize beyond the buffer
  });

  it("nested boxes, zero-length boxes, and a box that claims to start inside itself", () => {
    const nested = Array.from({ length: 5_000 }).reduce<Buffer>((inner) => box("free", inner), Buffer.alloc(4));
    expect(verdict(Buffer.concat([box("ftyp", Buffer.from("M4A ", "latin1"), u32(0)), nested])).ok).toBe(false);
    const zero = Buffer.concat([box("ftyp", Buffer.from("M4A ", "latin1"), u32(0)), Buffer.from([0, 0, 0, 0]), Buffer.from("moov", "latin1"), Buffer.alloc(64)]);
    expect(verdict(zero).ok).toBe(false);
    const selfRef = Buffer.concat([box("ftyp", Buffer.from("M4A ", "latin1"), u32(0)), Buffer.from([0, 0, 0, 4]), Buffer.from("moov", "latin1")]);
    expect(verdict(selfRef).ok).toBe(false);
  });

  it("overlapping / duplicated WAV chunks and a second fmt chunk", () => {
    const base = wav({ seconds: 1 });
    const dup = Buffer.concat([base.subarray(0, 12), base.subarray(12, 36), base.subarray(12, 36), base.subarray(36)]);
    dup.writeUInt32LE(dup.length - 8, 4);
    verdict(dup); // may be accepted or refused: must not throw; the next line proves the data length stayed consistent
    const r = inspectAudio(dup);
    if (r.ok) expect(r.durationMs).toBeLessThan(2_000);
  });

  it("an Ogg whose pages repeat a sequence number or switch serial mid-stream (valid CRCs): refused", () => {
    const head = Buffer.alloc(19);
    head.write("OpusHead", 0, "latin1");
    head.writeUInt8(1, 8);
    head.writeUInt8(1, 9);
    head.writeUInt16LE(312, 10);
    const tags = Buffer.concat([Buffer.from("OpusTags", "latin1"), Buffer.from([4, 0, 0, 0]), Buffer.from("test"), Buffer.from([0, 0, 0, 0])]);
    const data = (serial: number, seq: number, type: number, g: bigint) => oggPage(serial, seq, type, g, [100], randomBytes(100));
    const good = Buffer.concat([oggPage(1, 0, 0x02, 0n, [19], head), oggPage(1, 1, 0, 0n, [tags.length], tags), data(1, 2, 0, 24_000n), data(1, 3, 0x04, 48_312n)]);
    expect(verdict(good).ok).toBe(true);
    const loop = Buffer.concat([oggPage(1, 0, 0x02, 0n, [19], head), oggPage(1, 1, 0, 0n, [tags.length], tags), data(1, 2, 0, 24_000n), data(1, 2, 0x04, 48_312n)]);
    expect(verdict(loop).ok).toBe(false);
    const serial = Buffer.concat([oggPage(1, 0, 0x02, 0n, [19], head), oggPage(1, 1, 0, 0n, [tags.length], tags), data(1, 2, 0, 24_000n), data(2, 3, 0x04, 48_312n)]);
    expect(verdict(serial).ok).toBe(false);
  });

  it("EBML: unknown-size cluster nested in an unknown-size segment, ID of 5 bytes, size of 9 bytes, truncated tracks", () => {
    const unknown = Buffer.from([0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
    const body = Buffer.concat([Buffer.from([0x1f, 0x43, 0xb6, 0x75]), unknown, Buffer.from([0x1f, 0x43, 0xb6, 0x75]), unknown, el(0xe7, [0])]);
    const f = Buffer.concat([el(0x1a45dfa3, el(0x4282, "webm")), Buffer.from([0x18, 0x53, 0x80, 0x67]), unknown, el(0x1654ae6b, el(0xae, Buffer.concat([el(0x83, [2]), el(0x86, "A_OPUS")]))), body]);
    expect(verdict(f).ok).toBe(false);
    expect(verdict(Buffer.concat([Buffer.from([0x08, 0x1a, 0x45, 0xdf, 0xa3, 0x80]), Buffer.alloc(40)])).ok).toBe(false);
    expect(verdict(Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.from([0x00]), Buffer.alloc(40)])).ok).toBe(false);
  });

  it("an independent mutation fuzz (600 inputs, different seed than the authors' set): never throws, always a verdict, bounded time", () => {
    let seed = 0xc0ffee;
    const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32);
    const seeds = [wav({ seconds: 1 }), ogg({ seconds: 1 }), webm({ seconds: 1, withDuration: true }), mp4({ seconds: 1 }), mp4({ seconds: 1, fragmented: true })];
    let accepted = 0;
    const t0 = performance.now();
    for (let i = 0; i < 600; i++) {
      const b = Buffer.from(seeds[i % seeds.length]!);
      const flips = 1 + Math.floor(rnd() * 6);
      for (let k = 0; k < flips; k++) b[Math.floor(rnd() * b.length)] = Math.floor(rnd() * 256);
      const cut = rnd() < 0.3 ? b.subarray(0, Math.floor(rnd() * b.length)) : b;
      const r = inspectAudio(cut);
      expect(typeof r.ok).toBe("boolean");
      if (r.ok) accepted++;
    }
    console.log(`FUZZ: 600 mutated inputs in ${(performance.now() - t0).toFixed(0)} ms, ${accepted} still accepted (structurally valid after mutation)`);
    expect(performance.now() - t0).toBeLessThan(15_000);
  });
});

describe("transcript text hygiene", () => {
  it("FIXED: Unicode TAG characters (invisible, readable by a model: 'ASCII smuggling') and ARABIC LETTER MARK are stripped from a transcript", () => {
    const smuggled = `hello ${String.fromCodePoint(0xe0049, 0xe0067, 0xe006e)} world؜`;
    const clean = cleanText(smuggled, 800);
    expect(/[\u{E0000}-\u{E007F}؜]/u.test(clean)).toBe(false);
  });

  it("control, bidi, zero-width and separator characters are replaced; length is cut on a code-point boundary", () => {
    const dirty = `a\u0000b‮c​d e\u{1F600}`;
    expect(cleanText(dirty, 800)).toBe("a b c d e\u{1F600}");
    expect(Array.from(cleanText("😀".repeat(900), 800)).length).toBe(800);
  });
});
