import type { PipelineEvent, PipelineInput, PipelineResult } from "../../src/http/pipeline";
import type { RoutingPipeline } from "../../src/pipeline/routing-pipeline";
import type { ToolContext } from "../../src/tools/registry";

export const SESSION = "sess_0123456789abcdef";

export interface InputOptions {
  customer?: string | boolean;
  locale?: "auto" | "si" | "en";
  cart?: { productId: string; variantKey?: string; quantity: number }[];
  context?: { page?: "product"; productId?: string };
}

export function input(message: string, o: InputOptions = {}): PipelineInput {
  const customerId = typeof o.customer === "string" ? o.customer : o.customer ? "cust_1" : null;
  return {
    requestId: "req_test",
    identity: customerId ? { kind: "customer", customerId } : { kind: "guest" },
    clientIp: "203.0.113.7",
    request: {
      sessionId: SESSION,
      message,
      locale: o.locale ?? "auto",
      cart: (o.cart ?? []).map((c) => ({ variantKey: "", ...c })),
      ...(o.context ? { context: o.context } : {}),
    },
    signal: new AbortController().signal,
    deadlineAt: Date.now() + 30_000,
  };
}

export async function run(p: RoutingPipeline, message: string, o: InputOptions = {}): Promise<{ result: PipelineResult; events: PipelineEvent[] }> {
  const events: PipelineEvent[] = [];
  const result = await p.run(input(message, o), (e) => events.push(e));
  return { result, events };
}

export const guestCtx = (cart: ToolContext["cart"] = []): ToolContext => ({ actor: { kind: "guest" }, requestId: "r", signal: new AbortController().signal, cart });
export const customerCtx = (id = "cust_1", cart: ToolContext["cart"] = []): ToolContext => ({ actor: { kind: "customer", customerId: id }, requestId: "r", signal: new AbortController().signal, cart });
