import { canonicalJson } from "../util/canonical";
import { ToolError, type ToolContext, type ToolDef, type ToolRegistry } from "./registry";

/** At most this many tool calls are honoured in one turn; the rest are refused, not queued. */
export const MAX_CALLS_PER_TURN = 3;
export const MAX_RESULT_BYTES = 64 * 1024;

export interface ToolCall {
  name: unknown;
  arguments: unknown;
}

export type ToolFailure = "invalid_args" | "forbidden" | "unknown_tool" | "timeout" | "duplicate" | "too_many" | "aborted" | "error";

export type ToolOutcome =
  | { tool: string; status: "ok"; data: unknown }
  | { tool: string; status: ToolFailure; error: { code: string; message: string } };

const fail = (tool: string, status: ToolFailure, code: string, message: string): ToolOutcome => ({ tool, status, error: { code, message } });

/** Never echo a model-supplied name back verbatim: it is untrusted text. */
const safeName = (name: unknown): string => (typeof name === "string" && /^[a-z][a-z0-9_]{2,40}$/.test(name) ? name : "unknown");

interface Prepared {
  index: number;
  tool: ToolDef;
  args: unknown;
}

function withTimeout<T>(work: Promise<T>, ms: number, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutMarker()), ms);
    const onAbort = () => reject(new AbortMarker());
    signal.addEventListener("abort", onAbort, { once: true });
    work.then(resolve, reject).finally(() => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
    });
  });
}
class TimeoutMarker extends Error {}
class AbortMarker extends Error {}

async function execute(p: Prepared, ctx: ToolContext): Promise<ToolOutcome> {
  const name = p.tool.name;
  const callSignal = AbortSignal.any([ctx.signal, AbortSignal.timeout(p.tool.timeoutMs)]);
  try {
    const data = await withTimeout(p.tool.execute(p.args as never, { ...ctx, signal: callSignal }), p.tool.timeoutMs, ctx.signal);
    let size = 0;
    try {
      size = Buffer.byteLength(JSON.stringify(data) ?? "null");
    } catch {
      return fail(name, "error", "TOOL_FAILED", "The tool returned data that cannot be serialised.");
    }
    if (size > MAX_RESULT_BYTES) return fail(name, "error", "RESULT_TOO_LARGE", "The tool result is too large.");
    return { tool: name, status: "ok", data };
  } catch (e) {
    if (e instanceof TimeoutMarker) return fail(name, "timeout", "TIMEOUT", "The tool took too long.");
    if (e instanceof AbortMarker || ctx.signal.aborted) return fail(name, "aborted", "ABORTED", "The request was cancelled.");
    if (e instanceof ToolError) return fail(name, "error", e.code, e.message);
    return fail(name, "error", "TOOL_FAILED", "The tool failed."); // details stay out of the result
  }
}

/**
 * Validates and runs the calls a model (or the deterministic router) proposes. Nothing runs unless the tool exists, the
 * actor is allowed to use it, and the arguments match its strict schema. Results come back in the order of the calls.
 */
export async function runToolCalls(registry: ToolRegistry, calls: readonly ToolCall[], ctx: ToolContext): Promise<ToolOutcome[]> {
  const outcomes: (ToolOutcome | undefined)[] = new Array(calls.length).fill(undefined);
  const seen = new Set<string>();
  const prepared: Prepared[] = [];

  calls.forEach((call, index) => {
    const label = safeName(call.name);
    if (index >= MAX_CALLS_PER_TURN) {
      outcomes[index] = fail(label, "too_many", "TOO_MANY_CALLS", `Only ${MAX_CALLS_PER_TURN} tool calls are allowed per turn.`);
      return;
    }
    const tool = typeof call.name === "string" ? registry.get(call.name) : undefined;
    if (!tool) {
      outcomes[index] = fail(label, "unknown_tool", "UNKNOWN_TOOL", "Unknown tool.");
      return;
    }
    if (!tool.allow.includes(ctx.actor.kind)) {
      outcomes[index] = fail(tool.name, "forbidden", "FORBIDDEN", "This tool is not available to this user.");
      return;
    }
    const parsed = tool.args.safeParse(call.arguments ?? {});
    if (!parsed.success) {
      // Field names from the schema are fine to show. The names of unexpected keys come from untrusted text, so they are not.
      const paths = [...new Set(parsed.error.issues.map((i) => (i.code === "unrecognized_keys" ? "(unexpected field)" : i.path.join(".") || "(root)")))].slice(0, 8).join(", ");
      outcomes[index] = fail(tool.name, "invalid_args", "INVALID_ARGUMENTS", `Invalid arguments: ${paths}.`);
      return;
    }
    const rule = tool.check?.(parsed.data as never);
    if (rule) {
      outcomes[index] = fail(tool.name, "invalid_args", "INVALID_ARGUMENTS", `Invalid arguments: ${rule}`);
      return;
    }
    const key = `${tool.name}:${canonicalJson(parsed.data)}`;
    if (seen.has(key)) {
      outcomes[index] = fail(tool.name, "duplicate", "DUPLICATE_CALL", "This exact call was already made this turn.");
      return;
    }
    seen.add(key);
    prepared.push({ index, tool, args: parsed.data });
  });

  const reads = prepared.filter((p) => p.tool.effect === "read");
  const proposals = prepared.filter((p) => p.tool.effect === "proposal");

  await Promise.all(
    reads.map(async (p) => {
      outcomes[p.index] = await execute(p, ctx);
    }),
  );
  for (const p of proposals) outcomes[p.index] = await execute(p, ctx);

  return outcomes.map((o) => o ?? fail("unknown", "error", "TOOL_FAILED", "The tool did not run."));
}
