import { z } from "zod";
import { runTool, tools, type Ctx } from "@/lib/ai/shop-tools";
import { errorResponse, guard, json, readJson } from "@/lib/security/api";

export const dynamic = "force-dynamic";

/**
 * Live voice agent, step 2: Gemini Live asks for a shop tool (search, compare, add to cart, open a page...). The browser
 * forwards the call here, it runs against the real catalogue, and the result goes back to Gemini. Page actions are
 * returned to the browser, which performs them. No Gemini call and no key are involved.
 */
const NAMES = new Set(tools[0].functionDeclarations.map((f) => f.name));

const bodySchema = z.object({
  name: z.string().max(60),
  args: z.record(z.string(), z.unknown()).optional(),
  cart: z.array(z.object({ slug: z.string().max(200), name: z.string().max(200), quantity: z.number().int().min(1).max(99), unitPrice: z.number().min(0).max(1e9) })).max(30).optional(),
});

export async function POST(req: Request) {
  const blocked = guard(req, { name: "ai-tool", limit: 60, windowMs: 60_000, mutating: true });
  if (blocked) return blocked;

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await readJson(req));
  } catch {
    return errorResponse(400, "INVALID_BODY", "Invalid request.");
  }
  if (!NAMES.has(body.name)) return errorResponse(400, "UNKNOWN_TOOL", "Unknown tool.");

  const ctx: Ctx = { cart: body.cart ?? [], compare: [], products: [], actions: [] };
  let result: unknown;
  try {
    result = await runTool(body.name, body.args ?? {}, ctx);
  } catch {
    result = { error: "Tool failed." };
  }
  return json({ result, products: ctx.products, compare: ctx.compare, actions: ctx.actions });
}
