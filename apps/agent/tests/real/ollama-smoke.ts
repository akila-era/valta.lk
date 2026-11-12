/**
 * ONE-FILE real-Ollama smoke test for the M1-A foundation (option B in the M1 plan).
 * Not part of `npm test`: it is bundled on the dev machine, copied to /tmp on the AI server, run with the server's Node,
 * and deleted. It installs nothing, changes no configuration and opens no port. It only talks to 127.0.0.1:11434.
 */
import { OllamaClient, OllamaError } from "../../src/ollama/client";
import { MODELS, ModelPolicyError } from "../../src/ollama/models";

const results: { name: string; ok: boolean; detail: string }[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  | " + detail : ""}`);
};
const timed = async <T>(fn: () => Promise<T>): Promise<[T, number]> => {
  const t = Date.now();
  const v = await fn();
  return [v, Date.now() - t];
};

const c = new OllamaClient({ baseUrl: "http://127.0.0.1:11434", requestTimeoutMs: 120_000 });
const mem = () => process.memoryUsage().rss / 1048576;

try {
  const [v] = await timed(() => c.version());
  check("version() parses", /^\d+\.\d+\.\d+/.test(v), v);

  await c.unload("qwen").catch(() => undefined);
  await c.unload("sinhala").catch(() => undefined);
  const before = await c.loadedModels();
  check("nothing loaded after unload()", before.length === 0, JSON.stringify(before));

  const [q, qMs] = await timed(() => c.generate({ model: "qwen", purpose: "reply", messages: [{ role: "user", content: "Say hello in five words." }], temperature: 0.2 }));
  check("Qwen reply parses", q.content.trim().length > 0 && q.generatedTokens > 0, `${qMs} ms (load ${Math.round(q.loadMs)} ms), ${q.generatedTokens} tok, ${q.tokensPerSecond?.toFixed(1)} tok/s`);
  check("only Qwen is loaded", JSON.stringify(await c.loadedModels()) === JSON.stringify([MODELS.qwen]));

  const tools = [
    {
      type: "function" as const,
      function: {
        name: "search_products",
        description: "Search the VOLTA.LK catalogue",
        parameters: { type: "object", properties: { query: { type: "string" }, max_price_lkr: { type: "integer" } }, required: ["query"] },
      },
    },
  ];
  const [t, tMs] = await timed(() => c.generate({ model: "qwen", purpose: "tool", tools, temperature: 0.2, messages: [{ role: "user", content: "Find me a smartphone under 150000 rupees." }] }));
  check("Qwen tool call parses", t.toolCalls.length === 1 && t.toolCalls[0]!.name === "search_products" && typeof t.toolCalls[0]!.arguments === "object", `${tMs} ms ${JSON.stringify(t.toolCalls)}`);

  const [s, sMs] = await timed(() =>
    c.generate({ model: "sinhala", purpose: "reply", messages: [{ role: "user", content: "ඔබ කවුද? සිංහලෙන් වාක්‍ය දෙකකින් පිළිතුරු දෙන්න." }], temperature: 0.3, topP: 0.9, minP: 0.1, repeatPenalty: 1.15 }),
  );
  const sinhalaChars = (s.content.match(/[඀-෿]/g) ?? []).length;
  check("SinhalaLLM reply parses (model switch)", sinhalaChars >= 10, `${sMs} ms (load ${Math.round(s.loadMs)} ms), ${sinhalaChars} Sinhala chars`);
  check("only SinhalaLLM is loaded after the switch", JSON.stringify(await c.loadedModels()) === JSON.stringify([MODELS.sinhala]));

  let blocked = false;
  try {
    await c.generate({ model: "sinhala", purpose: "reply", messages: [{ role: "system", content: "x" }, { role: "user", content: "hi" }] });
  } catch (e) {
    blocked = e instanceof ModelPolicyError;
  }
  check("policy refuses a system prompt for SinhalaLLM before any request", blocked);

  const raw = await fetch("http://127.0.0.1:11434/api/chat", { method: "POST", body: JSON.stringify({ model: "glm-5.3-flash:cloud", messages: [{ role: "user", content: "ping" }] }) });
  const rawText = await raw.text();
  check("real server answers a cloud model with 403 'ollama cloud is disabled' (the text the client maps to CLOUD_DISABLED)", raw.status === 403 && /ollama cloud is disabled/i.test(rawText), `${raw.status} ${rawText.slice(0, 80)}`);

  await c.unload("sinhala");
  await c.unload("qwen").catch(() => undefined);
  const after = await c.loadedModels();
  check("unload() frees memory (nothing loaded at the end)", after.length === 0, JSON.stringify(after));
  check("client error type is exported and usable", new OllamaError("HTTP", "x") instanceof Error);
} catch (e) {
  check("unexpected exception", false, e instanceof Error ? `${e.name}: ${e.message}` : String(e));
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\nSUMMARY ${results.length - failed}/${results.length} passed, node ${process.version}, test process RSS ${mem().toFixed(0)} MB`);
process.exitCode = failed ? 1 : 0;
