import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineTool, ToolError, ToolRegistry, type ToolContext } from "../../src/tools/registry";
import { MAX_CALLS_PER_TURN, runToolCalls } from "../../src/tools/runner";

const guest = (): ToolContext => ({ actor: { kind: "guest" }, requestId: "req_1", signal: new AbortController().signal });
const customer = (): ToolContext => ({ actor: { kind: "customer", customerId: "c1" }, requestId: "req_1", signal: new AbortController().signal });

function registry(extra: (r: ToolRegistry) => void = () => {}) {
  const r = new ToolRegistry();
  r.register(
    defineTool({
      name: "echo_read",
      description: "Echoes a number.",
      shape: { n: z.number().int().min(0).max(100), tag: z.string().max(20).default("t") },
      allow: ["guest", "customer"],
      effect: "read",
      execute: async (a) => ({ n: a.n, tag: a.tag }),
    }),
  );
  r.register(
    defineTool({
      name: "orders_mine",
      description: "Customer only.",
      shape: {},
      allow: ["customer"],
      effect: "read",
      execute: async (_a, ctx) => ({ customerId: ctx.actor.customerId }),
    }),
  );
  extra(r);
  return r;
}

describe("registry", () => {
  it("rejects bad names, duplicates and a tool nobody may use", () => {
    expect(() => defineTool({ name: "Bad-Name", description: "", shape: {}, allow: ["guest"], effect: "read", execute: async () => 1 })).toThrow();
    expect(() => defineTool({ name: "ok_name", description: "", shape: {}, allow: [], effect: "read", execute: async () => 1 })).toThrow();
    expect(() => registry((r) => r.register(r.get("echo_read")!))).toThrow(/Duplicate/);
  });

  it("builds strict argument schemas", () => {
    const t = registry().get("echo_read")!;
    expect(t.args.safeParse({ n: 1 }).success).toBe(true);
    expect(t.args.safeParse({ n: 1, extra: true }).success).toBe(false);
  });
});

describe("runToolCalls", () => {
  it("runs a valid call and applies schema defaults", async () => {
    const [o] = await runToolCalls(registry(), [{ name: "echo_read", arguments: { n: 5 } }], guest());
    expect(o).toEqual({ tool: "echo_read", status: "ok", data: { n: 5, tag: "t" } });
  });

  it("rejects unknown tools, without echoing the model-supplied name", async () => {
    const out = await runToolCalls(registry(), [{ name: "drop_database; <script>", arguments: {} }, { name: 42, arguments: {} }, { name: "place_order", arguments: {} }], guest());
    expect(out.map((o) => o.status)).toEqual(["unknown_tool", "unknown_tool", "unknown_tool"]);
    expect(JSON.stringify(out)).not.toContain("script");
    expect(JSON.stringify(out)).not.toContain("drop_database");
  });

  it("rejects extra, missing and out-of-range arguments and never executes the tool", async () => {
    let executed = 0;
    const r = registry((reg) =>
      reg.register(defineTool({ name: "counted", description: "", shape: { q: z.string().max(5) }, allow: ["guest"], effect: "read", execute: async () => ++executed })),
    );
    const out = await runToolCalls(
      r,
      [
        { name: "counted", arguments: { q: "ok", sneaky: "x" } },
        { name: "counted", arguments: {} },
        { name: "counted", arguments: { q: "way too long" } },
      ],
      guest(),
    );
    expect(out.map((o) => o.status)).toEqual(["invalid_args", "invalid_args", "invalid_args"]);
    expect((await runToolCalls(r, [{ name: "echo_read", arguments: { n: 101 } }], guest()))[0]).toMatchObject({ status: "invalid_args" });
    expect(executed).toBe(0);
    expect((out[0] as { error: { message: string } }).error.message).toContain("unexpected field");
    expect((out[1] as { error: { message: string } }).error.message).toContain("q"); // schema field names are shown
    expect(JSON.stringify(out)).not.toContain("sneaky"); // names of unexpected keys come from untrusted text
    expect(JSON.stringify(out)).not.toContain("way too long"); // values are never echoed
  });

  it("enforces the actor permission matrix before touching arguments", async () => {
    const r = registry();
    expect((await runToolCalls(r, [{ name: "orders_mine", arguments: {} }], guest()))[0]).toMatchObject({ status: "forbidden" });
    expect((await runToolCalls(r, [{ name: "orders_mine", arguments: {} }], customer()))[0]).toEqual({ tool: "orders_mine", status: "ok", data: { customerId: "c1" } });
  });

  it("honours at most three calls per turn", async () => {
    const calls = Array.from({ length: 5 }, (_, i) => ({ name: "echo_read", arguments: { n: i } }));
    const out = await runToolCalls(registry(), calls, guest());
    expect(MAX_CALLS_PER_TURN).toBe(3);
    expect(out.map((o) => o.status)).toEqual(["ok", "ok", "ok", "too_many", "too_many"]);
  });

  it("refuses an identical repeated call, even with the keys in a different order", async () => {
    const r = registry((reg) => reg.register(defineTool({ name: "two_args", description: "", shape: { a: z.number(), b: z.number() }, allow: ["guest"], effect: "read", execute: async (x) => x })));
    const out = await runToolCalls(r, [{ name: "two_args", arguments: { a: 1, b: 2 } }, { name: "two_args", arguments: { b: 2, a: 1 } }, { name: "two_args", arguments: { a: 1, b: 3 } }], guest());
    expect(out.map((o) => o.status)).toEqual(["ok", "duplicate", "ok"]);
  });

  it("times out a slow tool", async () => {
    const r = registry((reg) => reg.register(defineTool({ name: "slow", description: "", shape: {}, allow: ["guest"], effect: "read", timeoutMs: 30, execute: () => new Promise((res) => setTimeout(res, 500)) })));
    const t0 = Date.now();
    const [o] = await runToolCalls(r, [{ name: "slow", arguments: {} }], guest());
    expect(o).toMatchObject({ status: "timeout" });
    expect(Date.now() - t0).toBeLessThan(400);
  });

  it("stops when the request is cancelled", async () => {
    const r = registry((reg) => reg.register(defineTool({ name: "slow", description: "", shape: {}, allow: ["guest"], effect: "read", timeoutMs: 5_000, execute: () => new Promise((res) => setTimeout(res, 500)) })));
    const ac = new AbortController();
    const p = runToolCalls(r, [{ name: "slow", arguments: {} }], { ...guest(), signal: ac.signal });
    setTimeout(() => ac.abort(), 20);
    expect((await p)[0]).toMatchObject({ status: "aborted" });
  });

  it("shows a domain ToolError's code and message but hides every other exception", async () => {
    const r = registry((reg) => {
      reg.register(defineTool({ name: "needs_variant", description: "", shape: {}, allow: ["guest"], effect: "read", execute: async () => Promise.reject(new ToolError("VARIANT_REQUIRED", "Please choose a variant.")) }));
      reg.register(defineTool({ name: "crashes", description: "", shape: {}, allow: ["guest"], effect: "read", execute: async () => Promise.reject(new Error("connect ECONNREFUSED 10.0.0.9:5432 password=hunter2")) }));
    });
    const out = await runToolCalls(r, [{ name: "needs_variant", arguments: {} }, { name: "crashes", arguments: {} }], guest());
    expect(out[0]).toEqual({ tool: "needs_variant", status: "error", error: { code: "VARIANT_REQUIRED", message: "Please choose a variant." } });
    expect(out[1]).toEqual({ tool: "crashes", status: "error", error: { code: "TOOL_FAILED", message: "The tool failed." } });
    expect(JSON.stringify(out)).not.toMatch(/hunter2|ECONNREFUSED|10\.0\.0\.9/);
  });

  it("runs read tools in parallel and proposals one at a time, in order", async () => {
    const log: string[] = [];
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const r = new ToolRegistry();
    for (const name of ["read_a", "read_b"]) {
      r.register(defineTool({ name, description: "", shape: {}, allow: ["guest"], effect: "read", execute: async () => (log.push(`${name}:start`), await sleep(40), log.push(`${name}:end`), name) }));
    }
    for (const name of ["prop_a", "prop_b"]) {
      r.register(defineTool({ name, description: "", shape: {}, allow: ["guest"], effect: "proposal", execute: async () => (log.push(`${name}:start`), await sleep(10), log.push(`${name}:end`), name) }));
    }
    const out = await runToolCalls(r, [{ name: "prop_a", arguments: {} }, { name: "read_a", arguments: {} }, { name: "prop_b", arguments: {} }], guest());
    expect(out.map((o) => (o.status === "ok" ? o.data : o.status))).toEqual(["prop_a", "read_a", "prop_b"]); // order of the calls
    expect(log.indexOf("read_a:end")).toBeLessThan(log.indexOf("prop_a:start")); // reads finish first
    expect(log.indexOf("prop_a:end")).toBeLessThan(log.indexOf("prop_b:start")); // proposals are sequential
    const t0 = Date.now();
    await runToolCalls(r, [{ name: "read_a", arguments: {} }, { name: "read_b", arguments: {} }], guest());
    expect(Date.now() - t0).toBeLessThan(75); // two 40 ms reads overlapped
  });

  it("rejects an oversized or unserialisable result", async () => {
    const r = registry((reg) => {
      reg.register(defineTool({ name: "huge", description: "", shape: {}, allow: ["guest"], effect: "read", execute: async () => "x".repeat(70_000) }));
      reg.register(defineTool({ name: "cyclic", description: "", shape: {}, allow: ["guest"], effect: "read", execute: async () => { const o: Record<string, unknown> = {}; o.self = o; return o; } }));
    });
    const out = await runToolCalls(r, [{ name: "huge", arguments: {} }, { name: "cyclic", arguments: {} }], guest());
    expect(out[0]).toMatchObject({ status: "error", error: { code: "RESULT_TOO_LARGE" } });
    expect(out[1]).toMatchObject({ status: "error", error: { code: "TOOL_FAILED" } });
  });

  it("treats missing arguments as an empty object", async () => {
    const [o] = await runToolCalls(registry(), [{ name: "orders_mine", arguments: undefined }], customer());
    expect(o).toMatchObject({ status: "ok" });
  });
});
