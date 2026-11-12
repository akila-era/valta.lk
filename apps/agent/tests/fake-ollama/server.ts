import http from "node:http";
import type { AddressInfo } from "node:net";

/**
 * A stand-in for Ollama used in every normal test. It mirrors the behaviour measured on the real server:
 * one model resident at a time, a delay when switching models, a 403 for cloud models (cloud is disabled there),
 * and an unload through keep_alive 0. It also records what it was asked, so tests can prove what did or did not leave.
 */
export interface FakeRequest {
  path: string;
  model?: string;
  hasTools: boolean;
  hasSystem: boolean;
  numCtx?: number;
  numPredict?: number;
  think?: unknown;
}

export type FakeMode = "ok" | "http500" | "malformed" | "notjson" | "hang";

export interface FakeOptions {
  switchDelayMs?: number;
  genDelayMs?: number;
  models?: string[];
}

export interface FakeOllama {
  url: string;
  requests: FakeRequest[];
  /** Full request bodies, for tests that inspect prompts and tool lists. */
  bodies: Record<string, unknown>[];
  /** What the fake currently has "loaded". */
  loaded(): string | null;
  maxConcurrent(): number;
  setMode(mode: FakeMode): void;
  /** Customise the reply for a request body. */
  setResponder(fn: (body: Record<string, unknown>) => { content: string; tool_calls?: unknown[] }): void;
  close(): Promise<void>;
}

export async function startFakeOllama(opts: FakeOptions = {}): Promise<FakeOllama> {
  const known = new Set(opts.models ?? ["qwen3:1.7b-q4_K_M", "hf.co/namindu94/SinhalaLLM-1.7B:Q4_K_M"]);
  let loaded: string | null = null;
  let mode: FakeMode = "ok";
  let concurrent = 0;
  let maxConcurrent = 0;
  const requests: FakeRequest[] = [];
  const bodies: Record<string, unknown>[] = [];
  let responder: Parameters<FakeOllama["setResponder"]>[0] = () => ({ content: "ok" });
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      void (async () => {
        const send = (status: number, body: unknown) => {
          res.writeHead(status, { "content-type": "application/json" });
          res.end(typeof body === "string" ? body : JSON.stringify(body));
        };
        const path = req.url ?? "";
        if (mode === "hang") return; // never answers
        if (mode === "http500") return send(500, { error: "boom" });
        if (mode === "notjson") return send(200, "<html>not json</html>");

        if (req.method === "GET" && path === "/api/version") return send(200, { version: "0.40.16" });
        if (req.method === "GET" && path === "/api/ps") return send(200, { models: loaded ? [{ name: loaded, model: loaded }] : [] });

        if (req.method === "POST" && path === "/api/chat") {
          let body: Record<string, unknown> = {};
          try {
            body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          } catch {
            return send(400, { error: "bad json" });
          }
          const model = String(body.model ?? "");
          bodies.push(body);
          const options = (body.options ?? {}) as Record<string, unknown>;
          const messages = (body.messages ?? []) as { role?: string }[];
          requests.push({
            path,
            model,
            hasTools: Array.isArray(body.tools) && body.tools.length > 0,
            hasSystem: messages.some((m) => m.role === "system"),
            ...(typeof options.num_ctx === "number" ? { numCtx: options.num_ctx } : {}),
            ...(typeof options.num_predict === "number" ? { numPredict: options.num_predict } : {}),
            think: body.think,
          });
          if (/(:|-)cloud$/.test(model)) return send(403, { error: "ollama cloud is disabled: remote model is unavailable" });
          if (!known.has(model)) return send(404, { error: `model '${model}' not found` });
          if (body.keep_alive === 0 && messages.length === 0) {
            if (loaded === model) loaded = null;
            return send(200, { model, done: true, done_reason: "unload", message: { role: "assistant", content: "" } });
          }
          concurrent++;
          maxConcurrent = Math.max(maxConcurrent, concurrent);
          try {
            let loadMs = 0;
            if (loaded !== model) {
              loadMs = opts.switchDelayMs ?? 0;
              await sleep(loadMs);
              loaded = model;
            }
            await sleep(opts.genDelayMs ?? 0);
            if (mode === "malformed") return send(200, { nope: true });
            const r = responder(body);
            return send(200, {
              model,
              done: true,
              message: { role: "assistant", content: r.content, ...(r.tool_calls ? { tool_calls: r.tool_calls } : {}) },
              load_duration: loadMs * 1e6,
              prompt_eval_count: 10,
              eval_count: 8,
              eval_duration: 1e9,
            });
          } finally {
            concurrent--;
          }
        }
        send(404, { error: "not found" });
      })();
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    bodies,
    loaded: () => loaded,
    maxConcurrent: () => maxConcurrent,
    setMode: (m) => {
      mode = m;
    },
    setResponder: (fn) => {
      responder = fn;
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}
