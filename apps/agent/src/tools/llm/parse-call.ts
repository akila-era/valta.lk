import type { LlmTool } from "./types";

/**
 * Turns what a small model produced into a tool call the executor can validate. Small models often emit slightly broken calls (arguments as a JSON string,
 * trailing commas, single quotes, null for an optional field, "5" for 5). This module repairs only what is unambiguous, records every repair by NAME (never the
 * value), and never invents an argument: a call that still does not match the tool's strict schema is refused by the executor with the field names.
 */
export type ParseFailure = "not_an_object" | "no_name" | "bad_name" | "arguments_not_json" | "arguments_not_object";

export type ParseResult =
  | { ok: true; name: string; args: Record<string, unknown>; repairs: string[] }
  | { ok: false; reason: ParseFailure; name: string; repairs: string[] };

const NAME = /^[a-z][a-z0-9_]{2,40}$/;
const MAX_ARG_TEXT = 20_000;

/** A conservative cascade of repairs for JSON-ish text. Returns the parsed value and the repairs that were needed, or null. */
export function repairJson(input: string): { value: unknown; repairs: string[] } | null {
  const repairs: string[] = [];
  let s = input.trim();
  if (s.length === 0 || s.length > MAX_ARG_TEXT) return null;
  const attempt = (): { value: unknown } | null => {
    try {
      return { value: JSON.parse(s) };
    } catch {
      return null;
    }
  };
  let r = attempt();
  if (r) return { value: r.value, repairs };

  const fenced = /^```[a-z]*\s*([\s\S]*?)\s*```$/i.exec(s);
  if (fenced) {
    s = fenced[1]!.trim();
    repairs.push("code_fence");
    if ((r = attempt())) return { value: r.value, repairs };
  }
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first > 0 || (last >= 0 && last < s.length - 1)) {
    if (first >= 0 && last > first) {
      s = s.slice(first, last + 1);
      repairs.push("extra_text_around_object");
      if ((r = attempt())) return { value: r.value, repairs };
    }
  }
  const noTrailing = s.replace(/,\s*([}\]])/g, "$1");
  if (noTrailing !== s) {
    s = noTrailing;
    repairs.push("trailing_comma");
    if ((r = attempt())) return { value: r.value, repairs };
  }
  const py = s.replace(/\bTrue\b/g, "true").replace(/\bFalse\b/g, "false").replace(/\bNone\b/g, "null");
  if (py !== s) {
    s = py;
    repairs.push("python_literals");
    if ((r = attempt())) return { value: r.value, repairs };
  }
  if (!s.includes('"') && s.includes("'")) {
    s = s.replace(/'/g, '"');
    repairs.push("single_quotes");
    if ((r = attempt())) return { value: r.value, repairs };
  }
  const keyed = s.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":');
  if (keyed !== s) {
    s = keyed;
    repairs.push("unquoted_keys");
    if ((r = attempt())) return { value: r.value, repairs };
  }
  return null;
}

/** Accepts {function:{name, arguments}}, {name, arguments|parameters|args}, or either as a JSON string. */
export function parseRawToolCall(raw: unknown): ParseResult {
  const repairs: string[] = [];
  let value = raw;
  if (typeof value === "string") {
    const r = repairJson(value);
    if (!r) return { ok: false, reason: "not_an_object", name: "unknown", repairs };
    value = r.value;
    repairs.push("call_was_text", ...r.repairs);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, reason: "not_an_object", name: "unknown", repairs };
  let obj = value as Record<string, unknown>;
  if (obj.function && typeof obj.function === "object" && !Array.isArray(obj.function)) {
    obj = obj.function as Record<string, unknown>;
    repairs.push("function_wrapper");
  }
  if (typeof obj.name !== "string" || obj.name.trim() === "") return { ok: false, reason: "no_name", name: "unknown", repairs };
  let name = obj.name.trim();
  const original = name;
  name = name.replace(/^(?:functions?|tools?)[./]/i, "").replace(/\(\s*\)$/, "").toLowerCase().replace(/[-\s]+/g, "_");
  if (name !== original) repairs.push("name_normalised");
  if (!NAME.test(name)) return { ok: false, reason: "bad_name", name: "unknown", repairs };

  let args: unknown = obj.arguments ?? obj.parameters ?? obj.args ?? {};
  for (let depth = 0; typeof args === "string" && depth < 2; depth++) {
    const trimmed = args.trim();
    if (trimmed === "") {
      args = {};
      break;
    }
    const r = repairJson(trimmed);
    if (!r) return { ok: false, reason: "arguments_not_json", name, repairs };
    args = r.value;
    repairs.push(depth === 0 ? "arguments_were_text" : "arguments_double_encoded", ...r.repairs);
  }
  if (args === null || args === undefined) args = {};
  if (typeof args !== "object" || Array.isArray(args)) return { ok: false, reason: "arguments_not_object", name, repairs };
  return { ok: true, name, args: args as Record<string, unknown>, repairs };
}

// ---------- coercion against a tool's schema ----------

interface ZodLike {
  def?: { type?: string; innerType?: ZodLike; entries?: Record<string, unknown>; values?: unknown[] };
}

function unwrap(schema: ZodLike): { base: string; optional: boolean; options?: string[] } {
  let s: ZodLike | undefined = schema;
  let optional = false;
  for (let i = 0; s?.def && i < 6; i++) {
    const t = s.def.type;
    if (t === "optional" || t === "default" || t === "prefault" || t === "nullable") {
      optional = true;
      s = s.def.innerType;
    } else break;
  }
  const base = s?.def?.type ?? "unknown";
  const options = base === "enum" && s?.def?.entries ? Object.values(s.def.entries).map(String) : undefined;
  return { base, optional, ...(options ? { options } : {}) };
}

export interface Coerced {
  args: Record<string, unknown>;
  repairs: string[];
  droppedFields: number;
}

/** Drops unknown keys (counted), removes null/empty values for optional fields, and converts only the unambiguous scalar mismatches. */
export function coerceToSchema(tool: Pick<LlmTool, "args">, input: Record<string, unknown>): Coerced {
  const shape = (tool.args as unknown as { shape: Record<string, ZodLike> }).shape;
  const repairs = new Set<string>();
  const args: Record<string, unknown> = {};
  let droppedFields = 0;
  for (const [key, value] of Object.entries(input)) {
    if (!Object.hasOwn(shape, key)) {
      droppedFields++;
      continue;
    }
    const { base, optional, options } = unwrap(shape[key]!);
    if (value === null || value === undefined || (value === "" && optional)) {
      if (value !== undefined) repairs.add("null_or_empty_optional_removed");
      continue;
    }
    if (base === "number" && typeof value === "string" && /^\s*-?\d+(?:\.\d+)?\s*$/.test(value)) {
      args[key] = Number(value);
      repairs.add("number_from_text");
    } else if (base === "boolean" && typeof value === "string" && /^\s*(?:true|false)\s*$/i.test(value)) {
      args[key] = value.trim().toLowerCase() === "true";
      repairs.add("boolean_from_text");
    } else if (base === "string" && typeof value === "number" && Number.isFinite(value)) {
      args[key] = String(value);
      repairs.add("text_from_number");
    } else if (base === "enum" && typeof value === "string" && options) {
      const hit = options.find((o) => o.toLowerCase() === value.trim().toLowerCase());
      args[key] = hit ?? value;
      if (hit !== undefined && hit !== value) repairs.add("enum_case");
    } else {
      args[key] = value;
    }
  }
  if (droppedFields > 0) repairs.add("unknown_fields_dropped");
  return { args, repairs: [...repairs], droppedFields };
}
