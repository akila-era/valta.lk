/**
 * Audio inspection for the voice routes: what the bytes REALLY are (never what a Content-Type header claims), whether they are
 * well formed, and whether they fit the size and duration limits.
 *
 * RESTORED: this file was truncated to 0 bytes by an unrelated process on 2026-11-14 at 23:58 and was rebuilt from the compiled bundle
 * `dist/agent.mjs` (built after the VO-01 duration fixes). The logic and every constant are identical to that bundle; the type
 * annotations and comments were rewritten. Verify with the voice tests (tests/unit/voice-audio.test.ts, review-voice-audio.test.ts).
 *
 * Accepted input containers: WAV (PCM/float), Ogg/Opus, WebM/Opus, MP4/M4A (AAC or Opus). Only WAV carries an EXACT duration;
 * for the others the duration is whatever the sender wrote in the header, so a bytes-per-second ceiling and a hard byte ceiling
 * are applied as well (VO-01).
 */
export type AudioFormat = "wav" | "ogg" | "webm" | "mp4";

export type AudioRefusal =
  | "empty"
  | "too_large"
  | "too_long"
  | "too_short"
  | "truncated"
  | "trailing_data"
  | "malformed"
  | "unsupported_codec"
  | "unrecognised";

export type AudioInspection =
  | { ok: true; format: AudioFormat; durationMs: number | null; exact: boolean; silent: boolean }
  | { ok: false; reason: AudioRefusal };

export type SpeechInspection =
  | { ok: true; contentType: "audio/wav" | "audio/mpeg"; durationMs: number }
  | { ok: false; reason: AudioRefusal };

export interface InspectOptions {
  maxBytes?: number;
  maxSeconds?: number;
}

export const MAX_AUDIO_BYTES = 5_000_000;
export const DEFAULT_MAX_SECONDS = 30;
const MIN_AUDIO_MS = 300;
/** When no duration can be read at all: refuse anything bigger than this many bytes per allowed second. */
const UNKNOWN_DURATION_BYTES_PER_SEC = 24_000;
/** Compressed speech (Opus/AAC) never legitimately needs more than this; used against a duration the sender wrote. */
const MAX_COMPRESSED_BYTES_PER_SEC = 80_000;
const COMPRESSED_OVERHEAD_BYTES = 32_768;

class Refuse extends Error {
  constructor(readonly reason: AudioRefusal) {
    super(reason);
  }
}

function refuse(r: AudioRefusal): never {
  throw new Refuse(r);
}

const ascii = (b: Buffer, start: number, end: number): string => b.toString("latin1", start, end);

interface Parsed {
  format: AudioFormat;
  durationMs: number | null;
  exact: boolean;
  silent?: boolean;
}

// ---------------------------------------------------------------------------------------------------------------- WAV

function parseWav(b: Buffer): Parsed {
  if (b.length < 44) refuse("truncated");
  const total = b.readUInt32LE(4) + 8;
  if (total > b.length) refuse("truncated");
  if (total < b.length) refuse("trailing_data");
  let off = 12;
  let fmt: { tag: number; channels: number; rate: number; byteRate: number; align: number; bits: number } | null = null;
  let dataStart = -1;
  let dataLen = 0;
  for (let n = 0; off + 8 <= b.length && n < 64; n++) {
    const id = ascii(b, off, off + 4);
    const size = b.readUInt32LE(off + 4);
    const body = off + 8;
    if (body + size > b.length) refuse("truncated");
    if (id === "fmt ") {
      if (size < 16) refuse("malformed");
      let tag = b.readUInt16LE(body);
      if (tag === 65534) {
        // WAVE_FORMAT_EXTENSIBLE: the real format tag is the first two bytes of the sub-format GUID.
        if (size < 40) refuse("malformed");
        tag = b.readUInt16LE(body + 24);
      }
      fmt = { tag, channels: b.readUInt16LE(body + 2), rate: b.readUInt32LE(body + 4), byteRate: b.readUInt32LE(body + 8), align: b.readUInt16LE(body + 12), bits: b.readUInt16LE(body + 14) };
    } else if (id === "data") {
      if (dataStart >= 0) refuse("malformed");
      dataStart = body;
      dataLen = size;
    }
    off = body + size + (size % 2);
  }
  if (!fmt || dataStart < 0) refuse("malformed");
  const f = fmt;
  if (f.tag !== 1 && f.tag !== 3) refuse("unsupported_codec");
  if (f.channels < 1 || f.channels > 2 || f.rate < 8000 || f.rate > 48000 || ![8, 16, 24, 32].includes(f.bits)) refuse("malformed");
  if (f.align !== (f.channels * f.bits) / 8 || f.byteRate !== f.rate * f.align) refuse("malformed");
  if (dataLen === 0) refuse("too_short");
  let silent = false;
  if (f.tag === 1 && f.bits === 16) {
    let peak = 0;
    const end = dataStart + dataLen - (dataLen % 2);
    for (let i = dataStart; i < end; i += 2) {
      const v = Math.abs(b.readInt16LE(i));
      if (v > peak) peak = v;
    }
    silent = peak < 64;
  }
  return { format: "wav", durationMs: Math.round((dataLen / f.byteRate) * 1000), exact: true, silent };
}

// ---------------------------------------------------------------------------------------------------------------- Ogg/Opus

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let r = i << 24;
    for (let k = 0; k < 8; k++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1;
    t[i] = r >>> 0;
  }
  return t;
})();

/** Ogg page checksum (CRC-32, polynomial 0x04C11DB7) with the page's own checksum field (bytes 22..25) counted as zero. */
function oggCrc(b: Buffer, start: number, end: number): number {
  let crc = 0;
  for (let i = start; i < end; i++) {
    const byte = i >= start + 22 && i < start + 26 ? 0 : b.readUInt8(i);
    crc = ((crc << 8) ^ CRC_TABLE[((crc >>> 24) ^ byte) & 255]!) >>> 0;
  }
  return crc;
}

function parseOgg(b: Buffer): Parsed {
  let off = 0;
  let pages = 0;
  let serial: number | null = null;
  let seq = -1;
  let preSkip = 0;
  let lastGranule = -1n;
  while (off < b.length) {
    if (pages++ > 20_000) refuse("malformed");
    if (off + 27 > b.length) refuse("truncated");
    if (ascii(b, off, off + 4) !== "OggS" || b.readUInt8(off + 4) !== 0) refuse("malformed");
    const type = b.readUInt8(off + 5);
    if (type & 0xf8) refuse("malformed");
    const segs = b.readUInt8(off + 26);
    const headerLen = 27 + segs;
    if (off + headerLen > b.length) refuse("truncated");
    let payload = 0;
    for (let i = 0; i < segs; i++) payload += b.readUInt8(off + 27 + i);
    const end = off + headerLen + payload;
    if (end > b.length) refuse("truncated");
    if (oggCrc(b, off, end) !== b.readUInt32LE(off + 22)) refuse("malformed");
    const pageSerial = b.readUInt32LE(off + 14);
    const pageSeq = b.readUInt32LE(off + 18);
    if (serial === null) {
      serial = pageSerial;
      if (!(type & 2)) refuse("malformed"); // the first page must be marked beginning-of-stream
      const head = off + headerLen;
      if (payload < 19 || ascii(b, head, head + 8) !== "OpusHead") refuse("unsupported_codec");
      if ((b.readUInt8(head + 8) & 0xf0) !== 0) refuse("unsupported_codec"); // OpusHead major version
      const channels = b.readUInt8(head + 9);
      if (channels < 1 || channels > 2 || b.readUInt8(head + 18) !== 0) refuse("unsupported_codec");
      preSkip = b.readUInt16LE(head + 10);
      seq = pageSeq;
    } else {
      if (pageSerial !== serial || pageSeq !== seq + 1 || type & 2) refuse("malformed");
      seq = pageSeq;
    }
    const granule = b.readBigInt64LE(off + 6);
    if (granule >= 0n) lastGranule = granule;
    off = end;
  }
  if (pages < 2) refuse("truncated");
  if (lastGranule <= 0n) refuse("malformed");
  const samples = Number(lastGranule) - preSkip;
  if (!Number.isFinite(samples) || samples <= 0) refuse("malformed");
  return { format: "ogg", durationMs: Math.round((samples / 48_000) * 1000), exact: false };
}

// ---------------------------------------------------------------------------------------------------------------- WebM/Opus (Matroska/EBML)

const ID = {
  ebml: 440786851,
  docType: 17026,
  segment: 408125543,
  seekHead: 290298740,
  info: 357149030,
  tracks: 374648427,
  cluster: 524531317,
  cues: 475249515,
  tags: 307544935,
  chapters: 272869232,
  attachments: 423732329,
  timecodeScale: 2807729,
  duration: 17545,
  trackEntry: 174,
  trackType: 131,
  codecId: 134,
  timecode: 231,
  simpleBlock: 163,
  blockGroup: 160,
  block: 161,
} as const;

const SEGMENT_LEVEL = new Set<number>([ID.seekHead, ID.info, ID.tracks, ID.cluster, ID.cues, ID.tags, ID.chapters, ID.attachments]);

interface Element {
  id: number;
  dataStart: number;
  dataEnd: number;
  unknown: boolean;
}

function readEl(b: Buffer, off: number, limit: number): Element {
  if (off >= limit) refuse("truncated");
  const first = b.readUInt8(off);
  if (first === 0) refuse("malformed");
  const idLen = Math.clz32(first) - 24 + 1;
  if (idLen > 4) refuse("malformed");
  if (off + idLen > limit) refuse("truncated");
  let id = 0;
  for (let i = 0; i < idLen; i++) id = id * 256 + b.readUInt8(off + i);
  const sOff = off + idLen;
  if (sOff >= limit) refuse("truncated");
  const s0 = b.readUInt8(sOff);
  if (s0 === 0) refuse("malformed");
  const sLen = Math.clz32(s0) - 24 + 1;
  if (sOff + sLen > limit) refuse("truncated");
  let value = BigInt(s0 & (255 >> sLen));
  let allOnes = (s0 & (255 >> sLen)) === 255 >> sLen;
  for (let i = 1; i < sLen; i++) {
    const v = b.readUInt8(sOff + i);
    if (v !== 255) allOnes = false;
    value = (value << 8n) | BigInt(v);
  }
  const dataStart = sOff + sLen;
  // An all-ones size means "unknown size" (live streams): the element runs to the end of its parent.
  if (allOnes) return { id, dataStart, dataEnd: limit, unknown: true };
  if (value > BigInt(limit - dataStart)) refuse("truncated");
  return { id, dataStart, dataEnd: dataStart + Number(value), unknown: false };
}

function readUint(b: Buffer, s: number, e: number): number {
  if (e - s < 1 || e - s > 6) refuse("malformed");
  let v = 0;
  for (let i = s; i < e; i++) v = v * 256 + b.readUInt8(i);
  return v;
}

function blockTime(b: Buffer, s: number, e: number): number {
  if (e - s < 4) refuse("malformed");
  const first = b.readUInt8(s);
  if (first === 0) refuse("malformed");
  const trackLen = Math.clz32(first) - 24 + 1;
  if (s + trackLen + 3 > e) refuse("malformed");
  return b.readInt16BE(s + trackLen);
}

function parseWebm(b: Buffer): Parsed {
  const budget = { steps: 0 };
  const step = (): void => {
    if (++budget.steps > 200_000) refuse("malformed");
  };
  const head = readEl(b, 0, b.length);
  if (head.id !== ID.ebml || head.unknown) refuse("malformed");
  let docType = "";
  for (let o = head.dataStart; o < head.dataEnd; ) {
    step();
    const e = readEl(b, o, head.dataEnd);
    if (e.id === ID.docType) docType = ascii(b, e.dataStart, e.dataEnd);
    o = e.dataEnd;
  }
  if (docType !== "webm") refuse("unrecognised");
  const seg = readEl(b, head.dataEnd, b.length);
  if (seg.id !== ID.segment) refuse("malformed");
  if (!seg.unknown && seg.dataEnd < b.length) refuse("trailing_data");
  let scale = 1_000_000;
  let infoDuration: number | null = null;
  let tracks = 0;
  let audioOpus = 0;
  let clusters = 0;
  let blocks = 0;
  let lastMs = 0;
  for (let o = seg.dataStart; o < seg.dataEnd; ) {
    step();
    const e = readEl(b, o, seg.dataEnd);
    let next = e.dataEnd;
    if (e.id === ID.info) {
      for (let p = e.dataStart; p < e.dataEnd; ) {
        step();
        const c = readEl(b, p, e.dataEnd);
        if (c.id === ID.timecodeScale) scale = readUint(b, c.dataStart, c.dataEnd);
        if (c.id === ID.duration) {
          const n = c.dataEnd - c.dataStart;
          if (n === 4) infoDuration = b.readFloatBE(c.dataStart);
          else if (n === 8) infoDuration = b.readDoubleBE(c.dataStart);
        }
        p = c.dataEnd;
      }
    } else if (e.id === ID.tracks) {
      for (let p = e.dataStart; p < e.dataEnd; ) {
        step();
        const t = readEl(b, p, e.dataEnd);
        if (t.id === ID.trackEntry) {
          tracks++;
          let type = 0;
          let codec = "";
          for (let q = t.dataStart; q < t.dataEnd; ) {
            step();
            const f = readEl(b, q, t.dataEnd);
            if (f.id === ID.trackType) type = readUint(b, f.dataStart, f.dataEnd);
            if (f.id === ID.codecId) codec = ascii(b, f.dataStart, f.dataEnd);
            q = f.dataEnd;
          }
          if (type !== 2 || codec !== "A_OPUS") refuse("unsupported_codec");
          audioOpus++;
        }
        p = t.dataEnd;
      }
    } else if (e.id === ID.cluster) {
      clusters++;
      let clusterTc = 0;
      let p = e.dataStart;
      const stopAt = e.dataEnd;
      let ended = false;
      while (p < stopAt && !ended) {
        step();
        if (e.unknown) {
          // An unknown-size cluster ends where the next segment-level element begins.
          const peek = readEl(b, p, stopAt);
          if (SEGMENT_LEVEL.has(peek.id)) {
            ended = true;
            break;
          }
        }
        const c = readEl(b, p, stopAt);
        if (c.id === ID.timecode) clusterTc = readUint(b, c.dataStart, c.dataEnd);
        else if (c.id === ID.simpleBlock || c.id === ID.block) {
          const bl = blockTime(b, c.dataStart, c.dataEnd);
          blocks++;
          lastMs = Math.max(lastMs, ((clusterTc + bl) * scale) / 1e6);
        } else if (c.id === ID.blockGroup) {
          for (let q = c.dataStart; q < c.dataEnd; ) {
            step();
            const g = readEl(b, q, c.dataEnd);
            if (g.id === ID.block) {
              const bl = blockTime(b, g.dataStart, g.dataEnd);
              blocks++;
              lastMs = Math.max(lastMs, ((clusterTc + bl) * scale) / 1e6);
            }
            q = g.dataEnd;
          }
        }
        p = c.dataEnd;
      }
      next = p;
    }
    o = next;
  }
  if (tracks === 0 || audioOpus !== tracks) refuse("unsupported_codec");
  if (clusters === 0 || blocks === 0) refuse("truncated");
  const fromInfo = infoDuration !== null && Number.isFinite(infoDuration) && infoDuration > 0 ? (infoDuration * scale) / 1e6 : null;
  // The larger of the header's Duration element and the last block time: a sender who lies in the header cannot shrink the estimate.
  const ms = Math.max(fromInfo ?? 0, lastMs + 20);
  return { format: "webm", durationMs: Math.round(ms), exact: false };
}

// ---------------------------------------------------------------------------------------------------------------- MP4/M4A

interface Box {
  type: string;
  dataStart: number;
  end: number;
}

function readBox(b: Buffer, off: number, limit: number): Box {
  if (off + 8 > limit) refuse("truncated");
  let size = b.readUInt32BE(off);
  const type = ascii(b, off + 4, off + 8);
  let header = 8;
  if (size === 1) {
    if (off + 16 > limit) refuse("truncated");
    const big = b.readBigUInt64BE(off + 8);
    if (big > BigInt(limit - off)) refuse("truncated");
    size = Number(big);
    header = 16;
  } else if (size === 0) {
    size = limit - off; // the box runs to the end
  }
  if (size < header) refuse("malformed");
  if (off + size > limit) refuse("truncated");
  return { type, dataStart: off + header, end: off + size };
}

const AUDIO_BRANDS = new Set(["M4A ", "M4B ", "mp42", "mp41", "isom", "iso2", "iso5", "iso6", "dash", "MSNV"]);

function parseMp4(b: Buffer): Parsed {
  let steps = 0;
  const step = (): void => {
    if (++steps > 20_000) refuse("malformed");
  };
  const ftyp = readBox(b, 0, b.length);
  if (ftyp.type !== "ftyp" || ftyp.end - ftyp.dataStart < 8) refuse("unrecognised");
  let brandOk = AUDIO_BRANDS.has(ascii(b, ftyp.dataStart, ftyp.dataStart + 4));
  for (let p = ftyp.dataStart + 8; p + 4 <= ftyp.end; p += 4) if (AUDIO_BRANDS.has(ascii(b, p, p + 4))) brandOk = true;
  if (!brandOk) refuse("unrecognised");
  let moov: Box | null = null;
  let mdat = false;
  const moofs: Box[] = [];
  let off = ftyp.end;
  while (off < b.length) {
    step();
    const bx = readBox(b, off, b.length);
    if (bx.type === "moov") {
      if (moov) refuse("malformed");
      moov = bx;
    } else if (bx.type === "mdat") mdat = true;
    else if (bx.type === "moof") moofs.push(bx);
    off = bx.end;
  }
  if (!moov) refuse("truncated");
  if (!mdat && moofs.length === 0) refuse("truncated");
  let timescale = 0;
  let mdhdDuration = 0;
  let audioTracks = 0;
  let fragmented = false;
  let defaultDur = 0;
  const children = (bx: Box): Box[] => {
    const out: Box[] = [];
    for (let p = bx.dataStart; p < bx.end; ) {
      step();
      const c = readBox(b, p, bx.end);
      out.push(c);
      p = c.end;
    }
    return out;
  };
  const find = (bx: Box, type: string): Box | undefined => children(bx).find((c) => c.type === type);
  for (const c of children(moov)) {
    if (c.type === "mvex") {
      fragmented = true;
      for (const t of children(c)) {
        if (t.type === "trex" && t.end - t.dataStart >= 20) defaultDur = b.readUInt32BE(t.dataStart + 12);
      }
    } else if (c.type === "trak") {
      const mdia = find(c, "mdia");
      if (!mdia) refuse("malformed");
      const hdlr = find(mdia, "hdlr");
      if (!hdlr || hdlr.end - hdlr.dataStart < 12) refuse("malformed");
      if (ascii(b, hdlr.dataStart + 8, hdlr.dataStart + 12) !== "soun") refuse("unsupported_codec");
      audioTracks++;
      const mdhd = find(mdia, "mdhd");
      if (!mdhd || mdhd.end - mdhd.dataStart < 24) refuse("malformed");
      const v = b.readUInt8(mdhd.dataStart);
      if (v === 1) {
        timescale = b.readUInt32BE(mdhd.dataStart + 20);
        mdhdDuration = Number(b.readBigUInt64BE(mdhd.dataStart + 24));
      } else {
        timescale = b.readUInt32BE(mdhd.dataStart + 12);
        mdhdDuration = b.readUInt32BE(mdhd.dataStart + 16);
      }
      const minf = find(mdia, "minf");
      const stbl = minf ? find(minf, "stbl") : undefined;
      const stsd = stbl ? find(stbl, "stsd") : undefined;
      if (!stsd || stsd.end - stsd.dataStart < 16) refuse("malformed");
      const entry = ascii(b, stsd.dataStart + 12, stsd.dataStart + 16);
      if (entry !== "mp4a" && entry !== "Opus") refuse("unsupported_codec");
    }
  }
  if (audioTracks !== 1 || timescale <= 0) refuse("unsupported_codec");
  let ms: number | null = null;
  if (mdhdDuration > 0) ms = (mdhdDuration / timescale) * 1000;
  else if (fragmented) {
    // Fragmented MP4 (what browsers' MediaRecorder produces): the duration is the sum of the fragment sample durations.
    let ticks = 0;
    for (const m of moofs) {
      for (const traf of children(m).filter((x) => x.type === "traf")) {
        let tfhdDur = defaultDur;
        for (const x of children(traf)) {
          if (x.type === "tfhd" && x.end - x.dataStart >= 8) {
            const flags = b.readUInt32BE(x.dataStart) & 0xffffff;
            let p = x.dataStart + 8;
            if (flags & 1) p += 8;
            if (flags & 2) p += 4;
            if (flags & 8 && p + 4 <= x.end) tfhdDur = b.readUInt32BE(p);
          } else if (x.type === "trun" && x.end - x.dataStart >= 8) {
            const flags = b.readUInt32BE(x.dataStart) & 0xffffff;
            const count = b.readUInt32BE(x.dataStart + 4);
            if (count > 1_000_000) refuse("malformed");
            let p = x.dataStart + 8;
            if (flags & 1) p += 4;
            if (flags & 4) p += 4;
            const per = (flags & 256 ? 4 : 0) + (flags & 512 ? 4 : 0) + (flags & 1024 ? 4 : 0) + (flags & 2048 ? 4 : 0);
            if (flags & 256) {
              for (let i = 0; i < count; i++) {
                const at = p + i * per;
                if (at + 4 > x.end) refuse("truncated");
                ticks += b.readUInt32BE(at);
              }
            } else ticks += count * tfhdDur;
          }
        }
      }
    }
    if (ticks > 0) ms = (ticks / timescale) * 1000;
  }
  return { format: "mp4", durationMs: ms === null ? null : Math.round(ms), exact: false };
}

// ---------------------------------------------------------------------------------------------------------------- public API

/** Inspects audio a shopper uploaded. Never throws: every problem is a typed refusal. */
export function inspectAudio(buf: Buffer, opts: InspectOptions = {}): AudioInspection {
  const maxBytes = Math.min(opts.maxBytes ?? MAX_AUDIO_BYTES, MAX_AUDIO_BYTES);
  const maxMs = Math.min(opts.maxSeconds ?? DEFAULT_MAX_SECONDS, 60) * 1000;
  if (buf.length === 0) return { ok: false, reason: "empty" };
  if (buf.length > maxBytes) return { ok: false, reason: "too_large" };
  if (buf.length < 12) return { ok: false, reason: "unrecognised" };
  try {
    let parsed: Parsed;
    if (ascii(buf, 0, 4) === "RIFF" && ascii(buf, 8, 12) === "WAVE") parsed = parseWav(buf);
    else if (ascii(buf, 0, 4) === "OggS") parsed = parseOgg(buf);
    else if (buf.readUInt32BE(0) === ID.ebml) parsed = parseWebm(buf);
    else if (ascii(buf, 4, 8) === "ftyp") parsed = parseMp4(buf);
    else return { ok: false, reason: "unrecognised" };
    if (parsed.durationMs !== null) {
      if (parsed.durationMs > maxMs) return { ok: false, reason: "too_long" };
      if (parsed.durationMs < MIN_AUDIO_MS) return { ok: false, reason: "too_short" };
    } else if (buf.length > (maxMs / 1000) * UNKNOWN_DURATION_BYTES_PER_SEC) {
      return { ok: false, reason: "too_long" };
    }
    if (parsed.format !== "wav") {
      // VO-01: a compressed file may not be bigger than the cap allows, whatever duration its header claims,
      // and may not be denser than speech can be for the duration it claims.
      if (buf.length > (maxMs / 1000) * MAX_COMPRESSED_BYTES_PER_SEC + COMPRESSED_OVERHEAD_BYTES) return { ok: false, reason: "too_long" };
      if (parsed.durationMs !== null && buf.length > (parsed.durationMs / 1000) * MAX_COMPRESSED_BYTES_PER_SEC + COMPRESSED_OVERHEAD_BYTES) return { ok: false, reason: "too_long" };
    }
    return { ok: true, format: parsed.format, durationMs: parsed.durationMs, exact: parsed.format === "wav" && parsed.exact, silent: parsed.silent === true };
  } catch (e) {
    if (e instanceof Refuse) return { ok: false, reason: e.reason };
    return { ok: false, reason: "malformed" };
  }
}

/** Inspects audio an engine produced (text-to-speech output): WAV, or MPEG audio (MP3) with an optional ID3 tag. */
export function inspectSpeechOutput(buf: Buffer, opts: InspectOptions = {}): SpeechInspection {
  const maxBytes = Math.min(opts.maxBytes ?? MAX_AUDIO_BYTES, MAX_AUDIO_BYTES);
  const maxMs = (opts.maxSeconds ?? 60) * 1000;
  if (buf.length === 0) return { ok: false, reason: "empty" };
  if (buf.length > maxBytes) return { ok: false, reason: "too_large" };
  try {
    if (buf.length >= 12 && ascii(buf, 0, 4) === "RIFF" && ascii(buf, 8, 12) === "WAVE") {
      const w = parseWav(buf);
      const wavMs = w.durationMs ?? 0;
      if (wavMs > maxMs) return { ok: false, reason: "too_long" };
      if (wavMs < 100) return { ok: false, reason: "too_short" };
      return { ok: true, contentType: "audio/wav", durationMs: wavMs };
    }
    let off = 0;
    if (buf.length >= 10 && ascii(buf, 0, 3) === "ID3") {
      const size = ((buf.readUInt8(6) & 127) << 21) | ((buf.readUInt8(7) & 127) << 14) | ((buf.readUInt8(8) & 127) << 7) | (buf.readUInt8(9) & 127);
      off = 10 + size;
    }
    if (off + 4 > buf.length) return { ok: false, reason: "truncated" };
    const h = buf.readUInt32BE(off);
    if (((h & 0xffe00000) >>> 0) !== 0xffe00000) return { ok: false, reason: "unrecognised" };
    const version = (h >>> 19) & 3;
    const layer = (h >>> 17) & 3;
    const bitrateIdx = (h >>> 12) & 15;
    const rateIdx = (h >>> 10) & 3;
    if (version === 1 || layer !== 1 || bitrateIdx === 0 || bitrateIdx === 15 || rateIdx === 3) return { ok: false, reason: "unsupported_codec" };
    const v1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
    const v2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
    const kbps = (version === 3 ? v1 : v2)[bitrateIdx]!;
    const ms = ((buf.length - off) * 8) / kbps;
    if (ms > maxMs) return { ok: false, reason: "too_long" };
    if (ms < 100) return { ok: false, reason: "too_short" };
    return { ok: true, contentType: "audio/mpeg", durationMs: Math.round(ms) };
  } catch (e) {
    if (e instanceof Refuse) return { ok: false, reason: e.reason };
    return { ok: false, reason: "malformed" };
  }
}
