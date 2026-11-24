import { readAssistantConfig } from "@/lib/assistant/config";
import { probeAgent } from "@/lib/ai-qa/agent-client";
import { deriveCapabilities } from "@/lib/ai-qa/capabilities";
import { qaFront } from "@/lib/ai-qa/front";
import type { ProbeSnapshot } from "@/lib/ai-qa/types";
import { json } from "@/lib/security/api";

export const dynamic = "force-dynamic";

/** Does this website route exist? An unknown route answers 404; a route that exists answers 405 (or something else) to OPTIONS. */
async function routeExists(req: Request, path: string): Promise<boolean> {
  try {
    const r = await fetch(new URL(path, req.url), { method: "OPTIONS", cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(2500) });
    return r.status !== 404;
  } catch {
    return false;
  }
}

/** Admin, development only: real probes of the Agent and the voice routes, and the capability statuses derived from them. */
export async function GET(req: Request) {
  const denied = await qaFront(req, "status", false);
  if (denied) return denied;
  const cfg = readAssistantConfig();
  const [agent, transcribeRoute, speakRoute] = await Promise.all([probeAgent(), routeExists(req, "/api/assistant/voice/transcribe"), routeExists(req, "/api/assistant/voice/speak")]);
  const probe: ProbeSnapshot = { agent, voice: { transcribeRoute, speakRoute }, demoData: process.env.AI_ASSISTANT_DEMO_DATA !== "false", checkedAt: new Date().toISOString() };
  return json({
    probe,
    capabilities: deriveCapabilities(probe),
    config: { assistantConfigured: cfg !== null, agentOrigin: cfg ? cfg.agentUrl.origin : null, previewGateOn: Boolean(cfg?.previewKey), nodeEnv: process.env.NODE_ENV ?? "development" },
  });
}
