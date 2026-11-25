import { z } from "zod";
import { SYSTEM, tools, runTool, type Args, type Ctx } from "@/lib/ai/shop-tools";
import { errorResponse, guard, json, readJson } from "@/lib/security/api";

export type { AiProduct, AiCompareItem, AiAction } from "@/lib/ai/shop-tools";

export const dynamic = "force-dynamic";

/**
 * AI shopping assistant. One endpoint, Gemini called directly over REST (no SDK).
 * Gemini decides which tool to use; catalogue tools run here against real ERP data, page actions
 * (navigate, add to cart, open cart) are returned to the browser, which performs them.
 * The key comes from GEMINI_API_KEY only and never reaches the client.
 */
// Models are tried in this order. Google counts free-tier quota per model and models get overloaded now and then,
// so a chain of models keeps the assistant answering. GEMINI_MODEL goes first; GEMINI_FALLBACK_MODELS is a comma list.
const MODELS = [
  ...new Set([
    process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash",
    ...(process.env.GEMINI_FALLBACK_MODELS?.split(",").map((m) => m.trim()) ?? ["gemini-3-flash-preview", "gemini-flash-lite-latest", "gemini-3.5-flash-lite"]),
  ]),
].filter(Boolean);
/** A model that just failed is skipped for a while: out of daily quota for 30 minutes, overloaded for 1 minute. */
const coolUntil = new Map<string, number>();
const MAX_ROUNDS = 4;

const bodySchema = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "model"]), text: z.string().trim().min(1).max(600) })).min(1).max(12),
  path: z.string().max(200).optional(),
  lang: z.enum(["en", "si", "ta"]).optional(),
  // What is in the shopper's cart (kept in their browser), so the AI can answer about it and edit it.
  cart: z.array(z.object({ slug: z.string().max(200), name: z.string().max(200), quantity: z.number().int().min(1).max(99), unitPrice: z.number().min(0).max(1e9) })).max(30).optional(),
});

interface Part {
  text?: string;
  functionCall?: { name: string; args?: Args };
  functionResponse?: { name: string; response: unknown };
}
interface Content {
  role: "user" | "model";
  parts: Part[];
}

class GeminiError extends Error {
  constructor(readonly status: number, detail: string) {
    super(`gemini ${status}: ${detail}`);
  }
}

async function callGemini(key: string, contents: Content[], signal: AbortSignal) {
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents,
    tools,
    generationConfig: { temperature: 0.3, maxOutputTokens: 600 },
  });
  let res: Response | undefined;
  let lastFailure: GeminiError | undefined;
  const now = Date.now();
  const ready = MODELS.filter((m) => (coolUntil.get(m) ?? 0) <= now);
  for (const model of ready.length ? ready : MODELS) {
    try {
      // Each model gets its own short time limit, so a model that hangs hands over to the next one.
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body,
        signal: AbortSignal.any([signal, AbortSignal.timeout(9_000)]),
      });
    } catch (e) {
      if (signal.aborted) throw e;
      res = undefined; // timed out: try the next model
      coolUntil.set(model, Date.now() + 60_000);
      continue;
    }
    if (res.status === 429 || res.status === 503) {
      coolUntil.set(model, Date.now() + (res.status === 429 ? 30 * 60_000 : 60_000));
      lastFailure = new GeminiError(res.status, (await res.text()).slice(0, 300));
      res = undefined;
      continue;
    }
    break;
  }
  if (!res && lastFailure) throw lastFailure;
  if (!res) throw new Error("gemini timeout");
  if (!res.ok) throw new GeminiError(res.status, (await res.text()).slice(0, 300));
  const data = (await res.json()) as { candidates?: { content?: Content }[] };
  return data.candidates?.[0]?.content ?? { role: "model" as const, parts: [] };
}

export async function POST(req: Request) {
  const blocked = guard(req, { name: "ai", limit: 20, windowMs: 60_000, mutating: true });
  if (blocked) return blocked;

  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return errorResponse(503, "AI_UNAVAILABLE", "The AI assistant is not switched on yet.");

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await readJson(req));
  } catch {
    return errorResponse(400, "INVALID_BODY", "Invalid request.");
  }

  const contents: Content[] = body.messages.map((m) => ({ role: m.role, parts: [{ text: m.text }] }));
  const cart = body.cart ?? [];
  const lastParts = contents[contents.length - 1].parts;
  lastParts.push({ text: `(Language: ${body.lang === "si" ? "Sinhala" : body.lang === "ta" ? "Tamil" : "English"})` });
  if (body.path) lastParts.push({ text: `(The shopper is currently on page: ${body.path})` });
  lastParts.push({
    text: cart.length
      ? `(Cart: ${cart.map((l) => `${l.quantity} x ${l.name} [slug ${l.slug}] at LKR ${l.unitPrice}`).join("; ")}; total LKR ${cart.reduce((t, l) => t + l.quantity * l.unitPrice, 0)})`
      : "(Cart: empty)",
  });
  const ctx: Ctx = { cart, compare: [], products: [], actions: [] };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 50_000);

  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const reply = await callGemini(key, contents, ctl.signal);
      const calls = reply.parts.filter((p) => p.functionCall);
      if (!calls.length) {
        const text = reply.parts.map((p) => p.text ?? "").join("").trim();
        return json({ reply: text || "Done.", products: ctx.products, compare: ctx.compare, actions: ctx.actions });
      }
      contents.push(reply);
      const responses: Part[] = [];
      for (const c of calls) {
        const fc = c.functionCall!;
        let response: unknown;
        try {
          response = await runTool(fc.name, fc.args ?? {}, ctx);
        } catch {
          response = { error: "Tool failed." };
        }
        responses.push({ functionResponse: { name: fc.name, response: { result: response } } });
      }
      contents.push({ role: "user", parts: responses });
    }
    return json({ reply: "Here is what I found.", products: ctx.products, compare: ctx.compare, actions: ctx.actions });
  } catch (e) {
    console.error("[ai]", e instanceof Error ? e.message : e); // never includes the key; it is only sent as a header
    if (e instanceof GeminiError && e.status === 429) return errorResponse(429, "AI_BUSY", "The assistant has reached its usage limit for now. Please try again in a little while.");
    return errorResponse(502, "AI_FAILED", "The assistant could not answer just now. Please try again.");
  } finally {
    clearTimeout(timer);
  }
}
