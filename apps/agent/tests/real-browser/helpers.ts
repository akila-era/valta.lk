import { execFileSync } from "node:child_process";

export interface Proc {
  pid: number;
  ppid: number;
  rssBytes: number;
  name: string;
}

/** All processes on the machine with parent ids and resident memory (working set on Windows, RSS elsewhere). */
export function listProcesses(): Proc[] {
  if (process.platform === "win32") {
    const out = execFileSync("powershell", ["-NoProfile", "-Command", "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,WorkingSetSize,Name | ConvertTo-Json -Compress"], { encoding: "utf8", maxBuffer: 20_000_000 });
    const rows = JSON.parse(out) as { ProcessId: number; ParentProcessId: number; WorkingSetSize: number | null; Name: string }[];
    return rows.map((r) => ({ pid: r.ProcessId, ppid: r.ParentProcessId, rssBytes: Number(r.WorkingSetSize ?? 0), name: r.Name }));
  }
  const out = execFileSync("ps", ["-eo", "pid=,ppid=,rss=,comm="], { encoding: "utf8" });
  return out
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      const m = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/.exec(l)!;
      return { pid: Number(m[1]), ppid: Number(m[2]), rssBytes: Number(m[3]) * 1024, name: m[4]! };
    });
}

/** The root process and every descendant. */
export function processTree(rootPid: number, all: Proc[] = listProcesses()): Proc[] {
  const byParent = new Map<number, Proc[]>();
  for (const p of all) byParent.set(p.ppid, [...(byParent.get(p.ppid) ?? []), p]);
  const out: Proc[] = [];
  const root = all.find((p) => p.pid === rootPid);
  if (!root) return out;
  const stack = [root];
  while (stack.length) {
    const p = stack.pop()!;
    out.push(p);
    for (const c of byParent.get(p.pid) ?? []) if (c.pid !== p.pid) stack.push(c);
  }
  return out;
}

export const treeRssMb = (tree: Proc[]): number => Math.round(tree.reduce((n, p) => n + p.rssBytes, 0) / 1024 / 1024);

export const pidAlive = (pid: number): boolean => listProcesses().some((p) => p.pid === pid);

/** Highest total memory of the process tree seen while `work` runs, sampled every `everyMs`. */
export async function peakTreeRssMb(rootPid: number, work: () => Promise<void>, everyMs = 400): Promise<number> {
  let peak = 0;
  let stop = false;
  const sampler = (async () => {
    while (!stop) {
      peak = Math.max(peak, treeRssMb(processTree(rootPid)));
      await new Promise((r) => setTimeout(r, everyMs));
    }
  })();
  try {
    await work();
  } finally {
    stop = true;
    await sampler;
  }
  peak = Math.max(peak, treeRssMb(processTree(rootPid)));
  return peak;
}
