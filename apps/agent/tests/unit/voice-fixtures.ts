/** Builders for small, valid synthetic audio containers (no real speech) used by the voice tests. */
import { randomBytes } from "node:crypto";

export function wav(o: { seconds?: number; rate?: number; bits?: 8 | 16 | 24 | 32; channels?: 1 | 2; amplitude?: number; float?: boolean } = {}): Buffer {
  const rate = o.rate ?? 16_000;
  const bits = o.bits ?? 16;
  const channels = o.channels ?? 1;
  const seconds = o.seconds ?? 1;
  const align = (channels * bits) / 8;
  const dataLen = Math.round(seconds * rate) * align;
  const b = Buffer.alloc(44 + dataLen);
  b.write("RIFF", 0, "latin1");
  b.writeUInt32LE(36 + dataLen, 4);
  b.write("WAVE", 8, "latin1");
  b.write("fmt ", 12, "latin1");
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(o.float ? 3 : 1, 20);
  b.writeUInt16LE(channels, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * align, 28);
  b.writeUInt16LE(align, 32);
  b.writeUInt16LE(bits, 34);
  b.write("data", 36, "latin1");
  b.writeUInt32LE(dataLen, 40);
  const amp = o.amplitude ?? 8000;
  if (bits === 16) for (let i = 0; i < dataLen / 2; i++) b.writeInt16LE(Math.round(Math.sin(i / 20) * amp), 44 + i * 2);
  return b;
}

// ---- Ogg / Opus
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let r = i << 24;
    for (let k = 0; k < 8; k++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1;
    t[i] = r >>> 0;
  }
  return t;
})();
const crc = (b: Buffer): number => {
  let c = 0;
  for (const byte of b) c = ((c << 8) ^ CRC[((c >>> 24) ^ byte) & 0xff]!) >>> 0;
  return c;
};

function oggPage(serial: number, seq: number, type: number, granule: bigint, payload: Buffer): Buffer {
  const segs: number[] = [];
  let left = payload.length;
  while (left >= 255) {
    segs.push(255);
    left -= 255;
  }
  segs.push(left);
  const h = Buffer.alloc(27 + segs.length);
  h.write("OggS", 0, "latin1");
  h.writeUInt8(0, 4);
  h.writeUInt8(type, 5);
  h.writeBigInt64LE(granule, 6);
  h.writeUInt32LE(serial, 14);
  h.writeUInt32LE(seq, 18);
  h.writeUInt8(segs.length, 26);
  Buffer.from(segs).copy(h, 27);
  const page = Buffer.concat([h, payload]);
  page.writeUInt32LE(crc(page), 22);
  return page;
}

export function ogg(o: { seconds?: number; preSkip?: number; channels?: number; serial?: number } = {}): Buffer {
  const serial = o.serial ?? 0x1234;
  const preSkip = o.preSkip ?? 312;
  const head = Buffer.alloc(19);
  head.write("OpusHead", 0, "latin1");
  head.writeUInt8(1, 8);
  head.writeUInt8(o.channels ?? 1, 9);
  head.writeUInt16LE(preSkip, 10);
  head.writeUInt32LE(48_000, 12);
  head.writeInt16LE(0, 16);
  head.writeUInt8(0, 18);
  const tags = Buffer.concat([Buffer.from("OpusTags", "latin1"), Buffer.from([4, 0, 0, 0]), Buffer.from("test"), Buffer.from([0, 0, 0, 0])]);
  const total = BigInt(Math.round((o.seconds ?? 1) * 48_000) + preSkip);
  return Buffer.concat([
    oggPage(serial, 0, 0x02, 0n, head),
    oggPage(serial, 1, 0, 0n, tags),
    oggPage(serial, 2, 0, total / 2n, randomBytes(300)),
    oggPage(serial, 3, 0x04, total, randomBytes(300)),
  ]);
}

// ---- WebM / Opus (EBML)
const vintSize = (n: number): Buffer => {
  if (n < 0x7f) return Buffer.from([0x80 | n]);
  if (n < 0x3fff) return Buffer.from([0x40 | (n >> 8), n & 0xff]);
  return Buffer.from([0x10 | (n >> 24), (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]);
};
const idBytes = (id: number): Buffer => {
  const out: number[] = [];
  for (let v = id; v > 0; v = Math.floor(v / 256)) out.unshift(v & 0xff);
  return Buffer.from(out);
};
export const el = (id: number, payload: Buffer | string | number[]): Buffer => {
  const p = typeof payload === "string" ? Buffer.from(payload, "latin1") : Buffer.from(payload);
  return Buffer.concat([idBytes(id), vintSize(p.length), p]);
};
const UNKNOWN = Buffer.from([0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);

export function webm(o: { seconds?: number; codec?: string; trackType?: number; docType?: string; knownSegment?: boolean; clusters?: number; withDuration?: boolean } = {}): Buffer {
  const seconds = o.seconds ?? 1;
  const ebml = el(0x1a45dfa3, Buffer.concat([el(0x4282, o.docType ?? "webm"), el(0x4287, [4])]));
  const info = el(0x1549a966, Buffer.concat([el(0x2ad7b1, [0x0f, 0x42, 0x40]), ...(o.withDuration ? [el(0x4489, f32(seconds * 1000))] : [])]));
  const tracks = el(0x1654ae6b, el(0xae, Buffer.concat([el(0x83, [o.trackType ?? 2]), el(0x86, o.codec ?? "A_OPUS")])));
  const n = o.clusters ?? 2;
  const clusters: Buffer[] = [];
  for (let i = 0; i < n; i++) {
    const startMs = Math.floor((seconds * 1000 * i) / n);
    const blocks: Buffer[] = [];
    const per = Math.floor((seconds * 1000) / n / 20);
    for (let k = 0; k < per; k++) blocks.push(el(0xa3, Buffer.concat([Buffer.from([0x81]), i16(k * 20), Buffer.from([0x80]), randomBytes(40)])));
    clusters.push(el(0x1f43b675, Buffer.concat([el(0xe7, u32(startMs)), ...blocks])));
  }
  const body = Buffer.concat([info, tracks, ...clusters]);
  const segment = o.knownSegment ? el(0x18538067, body) : Buffer.concat([idBytes(0x18538067), UNKNOWN, body]);
  return Buffer.concat([ebml, segment]);
}
const f32 = (v: number): Buffer => {
  const b = Buffer.alloc(4);
  b.writeFloatBE(v, 0);
  return b;
};
const i16 = (v: number): Buffer => {
  const b = Buffer.alloc(2);
  b.writeInt16BE(v, 0);
  return b;
};
const u32 = (v: number): Buffer => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(v, 0);
  return b;
};

// ---- MP4 / M4A
export const box = (type: string, ...payload: Buffer[]): Buffer => {
  const p = Buffer.concat(payload);
  const h = Buffer.alloc(8);
  h.writeUInt32BE(8 + p.length, 0);
  h.write(type, 4, "latin1");
  return Buffer.concat([h, p]);
};

export function mp4(o: { seconds?: number; handler?: string; entry?: string; brand?: string; fragmented?: boolean; mdatBytes?: number } = {}): Buffer {
  const ts = 44_100;
  const dur = o.fragmented ? 0 : Math.round((o.seconds ?? 1) * ts);
  const full = (v: number, ...rest: Buffer[]): Buffer => Buffer.concat([Buffer.from([v, 0, 0, 0]), ...rest]);
  const mdhd = box("mdhd", full(0, u32(0), u32(0), u32(ts), u32(dur), Buffer.alloc(4)));
  const hdlr = box("hdlr", full(0, u32(0), Buffer.from(o.handler ?? "soun", "latin1"), Buffer.alloc(12), Buffer.from([0])));
  const entry = box(o.entry ?? "mp4a", Buffer.alloc(28));
  const stsd = box("stsd", full(0, u32(1), entry));
  const trak = box("trak", box("mdia", mdhd, hdlr, box("minf", box("stbl", stsd))));
  const trex = box("trex", full(0, u32(1), u32(1), u32(1024), u32(0), u32(0)));
  const moov = box("moov", box("mvhd", Buffer.alloc(100)), trak, ...(o.fragmented ? [box("mvex", trex)] : []));
  const ftyp = box("ftyp", Buffer.from(o.brand ?? "M4A ", "latin1"), u32(0), Buffer.from("isom", "latin1"));
  const parts = [ftyp, moov];
  if (o.fragmented) {
    const sampleCount = Math.round(((o.seconds ?? 1) * ts) / 1024);
    const trun = box("trun", Buffer.concat([Buffer.from([0, 0, 0, 0]), u32(sampleCount)]));
    parts.push(box("moof", box("mfhd", Buffer.alloc(8)), box("traf", box("tfhd", Buffer.concat([Buffer.from([0, 0, 0, 0]), u32(1)])), trun)));
  }
  parts.push(box("mdat", randomBytes(o.mdatBytes ?? 2000)));
  return Buffer.concat(parts);
}
