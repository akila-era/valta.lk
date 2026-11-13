import type { ProductView } from "../backend/types";

/**
 * Numbers a product's own catalogue data states: specification rows first, then its plain-text description. Only what is written
 * there is read; a missing number stays missing (never estimated from the name or the price). `source` records where it came from so a
 * claim made from a description is never presented as a staff-entered specification.
 */
export interface SpecFacts {
  cameraMp?: number;
  batteryMah?: number;
  memoryGb?: number;
  storageGb?: number;
  source: { cameraMp?: "spec" | "description"; batteryMah?: "spec" | "description"; memoryGb?: "spec" | "description" };
}

const num = (s: string | undefined): number | undefined => {
  if (!s) return undefined;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

function fromRows(p: ProductView): Pick<SpecFacts, "cameraMp" | "batteryMah" | "memoryGb" | "storageGb"> & { src: SpecFacts["source"] } {
  const out: { cameraMp?: number; batteryMah?: number; memoryGb?: number; storageGb?: number; src: SpecFacts["source"] } = { src: {} };
  for (const s of p.specs) {
    const name = s.name.toLowerCase();
    const v = s.value;
    if (/camera/.test(name)) {
      const mp = [...v.matchAll(/(\d{1,3}(?:\.\d)?)\s*mp/gi)].map((m) => num(m[1])).filter((x): x is number => x !== undefined);
      if (mp.length) {
        out.cameraMp = Math.max(...mp);
        out.src.cameraMp = "spec";
      }
    } else if (/battery/.test(name)) {
      const n = num(/(\d{3,5})\s*mah/i.exec(v)?.[1]);
      if (n) {
        out.batteryMah = n;
        out.src.batteryMah = "spec";
      }
    } else if (/^(ram|memory)$/.test(name) || /\bram\b/.test(name)) {
      const n = num(/(\d{1,3})\s*gb/i.exec(v)?.[1]);
      if (n) {
        out.memoryGb = n;
        out.src.memoryGb = "spec";
      }
    } else if (/storage|rom/.test(name)) {
      const n = num(/(\d{2,4})\s*(gb|tb)/i.exec(v)?.[1]);
      if (n) out.storageGb = /tb/i.test(v) ? n * 1024 : n;
    }
  }
  return out;
}

export function specFacts(p: ProductView): SpecFacts {
  const rows = fromRows(p);
  const facts: SpecFacts = { source: { ...rows.src } };
  if (rows.cameraMp !== undefined) facts.cameraMp = rows.cameraMp;
  if (rows.batteryMah !== undefined) facts.batteryMah = rows.batteryMah;
  if (rows.memoryGb !== undefined) facts.memoryGb = rows.memoryGb;
  if (rows.storageGb !== undefined) facts.storageGb = rows.storageGb;

  const d = p.description ?? "";
  if (facts.cameraMp === undefined) {
    const mp = [...d.matchAll(/(\d{1,3}(?:\.\d)?)\s*mp\b/gi)].map((m) => num(m[1])).filter((x): x is number => x !== undefined);
    if (mp.length) {
      facts.cameraMp = Math.max(...mp);
      facts.source.cameraMp = "description";
    }
  }
  if (facts.batteryMah === undefined) {
    const n = num(/(\d{3,5})\s*mah/i.exec(d)?.[1]);
    if (n) {
      facts.batteryMah = n;
      facts.source.batteryMah = "description";
    }
  }
  if (facts.memoryGb === undefined) {
    const n = num(/(\d{1,3})\s*gb\s*ram/i.exec(d)?.[1] ?? /ram\s*[:\-]?\s*(\d{1,3})\s*gb/i.exec(d)?.[1]);
    if (n) {
      facts.memoryGb = n;
      facts.source.memoryGb = "description";
    }
  }
  if (facts.storageGb === undefined) {
    const sizes = p.variants.map((v) => /(\d{2,4})\s*(gb|tb)/i.exec(v.storage ?? "")).filter((m): m is RegExpExecArray => m !== null).map((m) => Number(m[1]) * (/tb/i.test(m[2]!) ? 1024 : 1));
    if (sizes.length) facts.storageGb = Math.max(...sizes);
  }
  return facts;
}
