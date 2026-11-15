import { GatewayError } from "./errors";
import type { JsonSchema, ToolDeclaration } from "./provider";

/**
 * Converts a provider-neutral tool declaration into a Gemini function declaration. Only a conservative subset of JSON Schema is accepted;
 * anything else is rejected with a clear, fixed error code (never silently dropped, because a dropped constraint changes what a tool accepts).
 * UNVERIFIED: which JSON Schema keywords Gemini honours per model is not fully documented; the structured-output page says minLength,
 * maxLength, minProperties, maxProperties, uniqueItems and contains are not enforced, so they are rejected here and must be validated by the
 * application when the model's arguments come back (the executor does that).
 */
/**
 * Constraint keywords that only NARROW what a value may be. Google's structured-output documentation says several of them are not enforced by the model, and
 * the shop's tool schemas (built from the strict argument validators) use them, so rejecting them made every real tool request fail. They are REMOVED from what
 * is sent to the model; the application still enforces them in full when the arguments come back (the tool executor validates every call against the original
 * schema, which this function never modifies). Structural keywords that change what the model must produce (anyOf, oneOf, $ref, ...) are still rejected.
 */
const ADVISORY_KEYS = new Set(["maxLength", "minLength", "pattern", "maxItems", "minItems", "uniqueItems", "additionalProperties", "$schema", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "minProperties", "maxProperties"]);

const ALLOWED_KEYS = new Set(["type", "properties", "required", "items", "enum", "description", "format", "minimum", "maximum", "title", "default"]);
const TYPES = new Set(["string", "number", "integer", "boolean", "object", "array"]);
const NAME = /^[A-Za-z_][A-Za-z0-9_.:-]{0,63}$/;
const MAX_DEPTH = 6;
const MAX_PROPERTIES = 40;
const MAX_ENUM = 50;

export interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  /** Standard JSON Schema (the REST reference lists parametersJsonSchema as an alternative to the OpenAPI-style `parameters`). */
  parametersJsonSchema: JsonSchema;
}

function bad(code: string): never {
  throw new GatewayError("bad_request", { code: `unsupported_schema:${code}`, retryable: false });
}

function check(node: unknown, path: string, depth: number): void {
  if (depth > MAX_DEPTH) bad(`too_deep@${path}`);
  if (!node || typeof node !== "object" || Array.isArray(node)) bad(`not_object@${path}`);
  const n = node as Record<string, unknown>;
  for (const k of Object.keys(n)) if (!ALLOWED_KEYS.has(k)) bad(`${k}@${path}`);
  if (typeof n.type !== "string" || !TYPES.has(n.type)) bad(`type@${path}`);
  if (n.enum !== undefined) {
    if (!Array.isArray(n.enum) || n.enum.length === 0 || n.enum.length > MAX_ENUM) bad(`enum@${path}`);
    if (!n.enum.every((v) => ["string", "number", "boolean"].includes(typeof v))) bad(`enum_values@${path}`);
  }
  if (n.type === "object") {
    const props = (n.properties ?? {}) as Record<string, unknown>;
    if (typeof props !== "object" || Array.isArray(props)) bad(`properties@${path}`);
    const names = Object.keys(props);
    if (names.length > MAX_PROPERTIES) bad(`too_many_properties@${path}`);
    for (const name of names) check(props[name], `${path}.${name}`, depth + 1);
    if (n.required !== undefined) {
      if (!Array.isArray(n.required) || !n.required.every((r) => typeof r === "string" && names.includes(r))) bad(`required@${path}`);
    }
  } else if (n.properties !== undefined || n.required !== undefined) {
    bad(`properties_on_non_object@${path}`);
  }
  if (n.type === "array") {
    if (n.items === undefined) bad(`items_missing@${path}`);
    check(n.items, `${path}[]`, depth + 1);
  } else if (n.items !== undefined) {
    bad(`items_on_non_array@${path}`);
  }
}

/** A copy of a schema node without the advisory keywords. Property NAMES are never treated as keywords. */
function withoutAdvisoryKeys(node: unknown): unknown {
  if (!node || typeof node !== "object" || Array.isArray(node)) return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (ADVISORY_KEYS.has(k)) continue;
    if (k === "properties" && v && typeof v === "object" && !Array.isArray(v)) {
      const props: Record<string, unknown> = {};
      for (const [name, child] of Object.entries(v as Record<string, unknown>)) props[name] = withoutAdvisoryKeys(child);
      out[k] = props;
    } else if (k === "items") out[k] = withoutAdvisoryKeys(v);
    else out[k] = v;
  }
  return out;
}

export function toGeminiFunctionDeclaration(tool: ToolDeclaration): GeminiFunctionDeclaration {
  if (!NAME.test(tool.name)) bad("name");
  if (typeof tool.description !== "string" || tool.description.length === 0 || tool.description.length > 2_000) bad("description");
  const sent = withoutAdvisoryKeys(tool.parameters) as JsonSchema;
  check(sent, "$", 0);
  if ((sent as { type?: unknown }).type !== "object") bad("root_must_be_object");
  return { name: tool.name, description: tool.description, parametersJsonSchema: sent };
}
