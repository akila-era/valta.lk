import { readFile } from "node:fs/promises";

export interface MemoryReading {
  availableMb: number | null;
  swapUsedMb: number | null;
}

/** Linux only (the AI server). Returns nulls elsewhere, for example on the Windows dev machine. */
export async function readMemory(): Promise<MemoryReading> {
  try {
    const text = await readFile("/proc/meminfo", "utf8");
    const kb = (key: string): number | null => {
      const m = new RegExp(`^${key}:\\s+(\\d+)\\s+kB`, "m").exec(text);
      return m ? Number(m[1]) : null;
    };
    const available = kb("MemAvailable");
    const swapTotal = kb("SwapTotal");
    const swapFree = kb("SwapFree");
    return {
      availableMb: available === null ? null : Math.round(available / 1024),
      swapUsedMb: swapTotal === null || swapFree === null ? null : Math.round((swapTotal - swapFree) / 1024),
    };
  } catch {
    return { availableMb: null, swapUsedMb: null };
  }
}
