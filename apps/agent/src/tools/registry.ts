import { z } from "zod";

export type ActorKind = "guest" | "customer";
export interface Actor {
  kind: ActorKind;
  customerId?: string;
}

export interface CartLineSnapshot {
  productId: string;
  variantKey: string;
  quantity: number;
}

export interface ToolContext {
  actor: Actor;
  requestId: string;
  signal: AbortSignal;
  /** The browser's cart snapshot for this request. Untrusted: backends revalidate it. */
  cart?: readonly CartLineSnapshot[];
}

/** A domain failure whose code and message are safe to show. Anything else a tool throws is hidden behind a generic error. */
export class ToolError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ToolError";
    this.code = code;
  }
}

export interface ToolDef {
  name: string;
  description: string;
  /** Always a strict object: unknown keys are rejected, never silently dropped. */
  args: z.ZodType<Record<string, unknown>>;
  allow: readonly ActorKind[];
  /** "read" tools may run in parallel. "proposal" tools only ever produce a browser-side action and run one at a time. */
  effect: "read" | "proposal";
  timeoutMs: number;
  /** Cross-field rules a schema cannot express. Returns a fixed message when the arguments are invalid. */
  check?: (args: never) => string | null;
  execute: (args: never, ctx: ToolContext) => Promise<unknown>;
}

const NAME = /^[a-z][a-z0-9_]{2,40}$/;
export const MAX_TOOLS = 20;

export function defineTool<Shape extends z.ZodRawShape>(def: {
  name: string;
  description: string;
  shape: Shape;
  allow: readonly ActorKind[];
  effect: "read" | "proposal";
  timeoutMs?: number;
  check?: (args: z.output<z.ZodObject<Shape>>) => string | null;
  execute: (args: z.output<z.ZodObject<Shape>>, ctx: ToolContext) => Promise<unknown>;
}): ToolDef {
  if (!NAME.test(def.name)) throw new Error("Invalid tool name.");
  if (def.allow.length === 0) throw new Error("A tool must be allowed for at least one actor kind.");
  return {
    name: def.name,
    description: def.description,
    args: z.strictObject(def.shape) as unknown as z.ZodType<Record<string, unknown>>,
    allow: def.allow,
    effect: def.effect,
    timeoutMs: def.timeoutMs ?? 5_000,
    ...(def.check ? { check: def.check as unknown as NonNullable<ToolDef["check"]> } : {}),
    execute: def.execute as unknown as ToolDef["execute"],
  };
}

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDef>();

  register(tool: ToolDef): this {
    if (this.tools.has(tool.name)) throw new Error("Duplicate tool name.");
    if (this.tools.size >= MAX_TOOLS) throw new Error("Too many tools.");
    this.tools.set(tool.name, tool);
    return this;
  }

  get(name: string): ToolDef | undefined {
    return this.tools.get(name);
  }

  list(): ToolDef[] {
    return [...this.tools.values()];
  }
}
