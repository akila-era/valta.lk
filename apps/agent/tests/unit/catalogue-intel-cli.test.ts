import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { nodeIO, run, type CliIO } from "../../scripts/catalogue-audit";
import { phoneSpecs, product, variant } from "../fixtures/catalogue-intel/builders";

/** An in-memory file system: the CLI core is tested without touching the disk, plus one test against a real temporary directory. */
function memIO(files: Record<string, string>): CliIO & { files: Record<string, string>; dirs: string[] } {
  const store = { ...files };
  const dirs: string[] = [];
  return {
    files: store,
    dirs,
    readFile: (p) => {
      if (!(p in store)) throw new Error("ENOENT");
      return store[p]!;
    },
    size: (p) => (store[p] ?? "").length,
    exists: (p) => p in store,
    mkdir: (p) => void dirs.push(p),
    writeFile: (p, d) => {
      if (p in store) throw new Error("EEXIST");
      store[p] = d;
    },
    now: () => "2026-01-01T00:00:00.000Z",
  };
}

const run2 = (argv: string[], io: CliIO) => {
  const out: string[] = [];
  const err: string[] = [];
  const code = run(argv, io, (s) => out.push(s), (s) => err.push(s));
  return { code, out: out.join("\n"), err: err.join("\n") };
};

const snapshot = JSON.stringify({ data: { items: [product(), product({ name: "13", category: "apple", price: "1000.00" })] } });
const written = (io: ReturnType<typeof memIO>) => Object.keys(io.files).filter((k) => /report\.(json|md)$/.test(k));

describe("catalogue-audit CLI", () => {
  it("writes both reports and prints a one-line summary", () => {
    const io = memIO({ "/in/snap.json": snapshot });
    const r = run2(["/in/snap.json", "--out", "/out"], io);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/Audited 2 products/);
    expect(written(io)).toHaveLength(2);
    const json = JSON.parse(io.files[written(io).find((k) => k.endsWith("json"))!]!);
    expect(json.generatedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(json.scope.products).toBe(2);
    expect(Object.keys(io.files).find((k) => k.endsWith("report.md"))).toBeTruthy();
  });
  it("accepts the website content and accessory link files", () => {
    const p = product();
    const phone = JSON.stringify({ items: [p] });
    const content = JSON.stringify({ items: [{ id: p.id, specs: phoneSpecs() }] });
    const links = JSON.stringify([{ sourceItemId: p.id, accessoryItemId: "x" }]);
    const io = memIO({ "/a.json": phone, "/c.json": content, "/l.json": links });
    const r = run2(["/a.json", "--content", "/c.json", "--links", "/l.json", "--out", "/o", "--format", "json"], io);
    expect(r.code).toBe(0);
    const json = JSON.parse(io.files[written(io)[0]!]!);
    expect(json.scope).toMatchObject({ contentSupplied: true, linksSupplied: true });
    expect(written(io)).toHaveLength(1);
  });
  it("refuses to overwrite an existing report and writes nothing", () => {
    const io = memIO({ "/in.json": snapshot });
    expect(run2(["/in.json", "--out", "/out"], io).code).toBe(0);
    const before = JSON.stringify(io.files);
    const again = run2(["/in.json", "--out", "/out"], io);
    expect(again.code).toBe(2);
    expect(again.err).toMatch(/already exists/);
    expect(JSON.stringify(io.files)).toBe(before);
  });
  it("never deletes: even with --force it refuses to replace a file", () => {
    const io = memIO({ "/in.json": snapshot });
    run2(["/in.json", "--out", "/out"], io);
    const r = run2(["/in.json", "--out", "/out", "--force"], io);
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/never deletes/);
  });
  it("reports unreadable input, missing files and empty catalogues as exit code 2", () => {
    expect(run2(["/missing.json"], memIO({})).err).toMatch(/not found/);
    expect(run2(["/bad.json"], memIO({ "/bad.json": "{not json" })).err).toMatch(/not valid JSON/);
    expect(run2(["/none.json"], memIO({ "/none.json": "{}" })).err).toMatch(/No products were found/);
    for (const c of [run2(["/bad.json"], memIO({ "/bad.json": "x" })), run2([], memIO({}))]) expect(c.code).toBe(2);
  });
  it("validates options", () => {
    const io = () => memIO({ "/in.json": snapshot });
    expect(run2(["/in.json", "--format", "xml"], io()).code).toBe(2);
    expect(run2(["/in.json", "--min-sample", "2"], io()).code).toBe(2);
    expect(run2(["/in.json", "--min-sample", "abc"], io()).code).toBe(2);
    expect(run2(["/in.json", "--fail-on", "urgent"], io()).code).toBe(2);
    expect(run2(["/in.json", "--bogus"], io()).err).toMatch(/Unknown option/);
    expect(run2(["/in.json", "--out"], io()).err).toMatch(/needs a value/);
    expect(run2(["--help"], io()).code).toBe(0);
  });
  it("returns 1 when a finding reaches --fail-on, 0 otherwise", () => {
    const clean = JSON.stringify({ items: [product({ variants: [variant()] })] });
    const bad = JSON.stringify({ items: [product({ price: "1,000.00" })] });
    expect(run2(["/in.json", "--out", "/o1", "--fail-on", "high"], memIO({ "/in.json": bad })).code).toBe(1);
    expect(run2(["/in.json", "--out", "/o3", "--fail-on", "medium"], memIO({ "/in.json": snapshot })).code).toBe(1);
    expect(run2(["/in.json", "--out", "/o2", "--fail-on", "high"], memIO({ "/in.json": clean })).code).toBe(0);
  });
  it("refuses an input file that is too large without reading it", () => {
    const io = memIO({ "/big.json": "[]" });
    io.size = () => 400_000_000;
    let read = false;
    io.readFile = () => {
      read = true;
      return "[]";
    };
    expect(run2(["/big.json"], io).err).toMatch(/larger than/);
    expect(read).toBe(false);
  });
  it("works against a real temporary directory and never touches anything else", () => {
    const dir = mkdtempSync(join(tmpdir(), "cat-audit-"));
    try {
      const src = join(dir, "snap.json");
      writeFileSync(src, snapshot);
      const r = run2([src, "--out", join(dir, "out")], nodeIO);
      expect(r.code).toBe(0);
      expect(readdirSync(join(dir, "out")).sort()).toEqual(["report.json", "report.md"]);
      expect(readFileSync(join(dir, "out", "report.md"), "utf8")).toMatch(/nothing in this report has been applied/i);
      expect(readFileSync(src, "utf8")).toBe(snapshot);
      expect(run2([src, "--out", join(dir, "out")], nodeIO).code).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
