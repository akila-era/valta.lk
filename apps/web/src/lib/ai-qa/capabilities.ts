import type { Capability, ProbeSnapshot, ScenarioResult } from "./types";

/**
 * Derives each capability's status from REAL probes and from verified test results. Pure: the same inputs always give the same output,
 * which is what makes the rules testable. The rules are deliberately conservative:
 *  - Working needs real evidence and no mock data anywhere in the path. Almost nothing reaches it today, and that is the point.
 *  - Mock only: real code answering over a mock catalogue, or a tool layer with no real driver.
 *  - Not connected: nothing real is behind it (no model, no service, no route).
 *  - Sinhala and Singlish are never above Limited: the router's accuracy on unseen messages is about two thirds and no native
 *    speaker has reviewed any of it.
 */
const passRate = (rs: ScenarioResult[]) => {
  const ran = rs.filter((r) => r.verdict !== "skipped");
  return { ran: ran.length, pass: ran.filter((r) => r.verdict === "pass").length };
};

export function deriveCapabilities(probe: ProbeSnapshot, results: ScenarioResult[] = []): Capability[] {
  const { agent, voice, demoData } = probe;
  const byGroup = (g: ScenarioResult["group"]) => results.filter((r) => r.group === g);
  const caps: Capability[] = [];

  // General AI chat: needs the real model. A reachable Agent without a model is not a working chat.
  if (!agent.reachable) caps.push({ id: "general_chat", label: "General AI Chat", status: "failed", reason: `The Agent could not be reached (${agent.error ?? "no answer"}).`, evidence: ["not_tested"] });
  else if (agent.ollamaReachable && agent.loadedModel) caps.push({ id: "general_chat", label: "General AI Chat", status: "limited", reason: `Model "${agent.loadedModel}" is loaded. A 1.7B to 4B model on 2 CPUs writes short replies only; reply quality has not been measured on real shoppers.`, evidence: ["real_model"] });
  else if (agent.ollamaReachable) caps.push({ id: "general_chat", label: "General AI Chat", status: "limited", reason: "Ollama answers but no model is loaded right now (the first reply will be slow).", evidence: ["real_model"] });
  else caps.push({ id: "general_chat", label: "General AI Chat", status: "not_connected", reason: "The Agent is up but no language model is connected (no Ollama). Replies come from fixed templates only.", evidence: ["integration"] });

  // Language understanding: from the language scenarios actually run in this session.
  const lang = (id: string, label: string, groups: ScenarioResult["group"][], cap: "limited" | "working") => {
    const rs = groups.flatMap(byGroup);
    const { ran, pass } = passRate(rs);
    if (!agent.reachable) return caps.push({ id, label, status: "failed", reason: "The Agent could not be reached, so nothing could be checked.", evidence: ["not_tested"] });
    if (ran === 0) return caps.push({ id, label, status: "not_tested", reason: "No test of this language has been run in this session. Run Language QA.", evidence: ["not_tested"] });
    const rate = pass / ran;
    const evidence: Capability["evidence"] = agent.ollamaReachable ? ["integration", "real_model"] : ["integration"];
    // Working needs real evidence: a connected model, a real (not mock) catalogue, and enough scenarios to mean something.
    const earned = cap === "working" && rate >= 0.9 && ran >= 10 && Boolean(agent.ollamaReachable) && !demoData;
    const status = earned ? "working" : rate === 0 ? "failed" : "limited";
    const why = cap === "limited" ? "Capped at Limited: not native-reviewed, small author-written test set." : earned ? "" : `Not Working: needs a connected model, a real catalogue and at least 10 scenarios (have ${ran}; model ${agent.ollamaReachable ? "connected" : "not connected"}; catalogue ${demoData ? "mock" : "real"}).`;
    caps.push({ id, label, status, reason: `${pass} of ${ran} scenarios passed (${Math.round(rate * 100)}%). ${why}`.trim(), evidence });
  };
  lang("sinhala", "Sinhala Understanding", ["si"], "limited");
  lang("singlish", "Singlish Understanding", ["singlish", "mixed"], "limited");
  lang("english", "English Understanding", ["en"], "working");

  // Shopping: real logic, but the catalogue is a mock while demo data is on.
  const shop = (id: string, label: string, groups: ScenarioResult["group"][], what: string) => {
    if (!agent.reachable) return caps.push({ id, label, status: "failed", reason: "The Agent could not be reached.", evidence: ["not_tested"] });
    const { ran, pass } = passRate(groups.flatMap(byGroup));
    if (demoData) return caps.push({ id, label, status: "mock", reason: `${what} runs real code over a MOCK catalogue (demo data); prices and stock are not real.${ran ? ` ${pass} of ${ran} scenarios passed.` : " Not yet run in this session."}`, evidence: ["integration", "mock"] });
    return caps.push({ id, label, status: ran === 0 ? "not_tested" : pass === ran ? "working" : "limited", reason: ran === 0 ? "No scenario run yet." : `${pass} of ${ran} scenarios passed against the configured catalogue.`, evidence: ["integration"] });
  };
  shop("shopping", "Shopping Intelligence", ["shopping", "en", "singlish", "si", "mixed"], "Shopping logic");
  shop("search", "Product Search", ["shopping"], "Product search");
  shop("compare", "Product Comparison", ["shopping"], "Comparison");

  caps.push({ id: "rag", label: "Website Knowledge / RAG", status: "not_connected", reason: "Only a contract exists. No index of the site's pages has been built (planned phase M3-D).", evidence: ["not_tested"] });
  caps.push({ id: "browser", label: "Browser Automation", status: "mock", reason: "The tool layer, sessions and action loop are tested against a MOCK driver. No real Playwright driver exists yet, so no real page has ever been controlled.", evidence: ["unit", "mock"] });

  const voiceReason = (a: boolean, name: string) => (a ? `The ${name} route exists but no speech service has been tested end to end.` : `No ${name} route or speech service exists.`);
  caps.push({ id: "stt", label: "Voice Input / STT", status: voice.transcribeRoute ? "not_tested" : "not_connected", reason: voiceReason(voice.transcribeRoute, "transcription"), evidence: ["not_tested"] });
  caps.push({ id: "tts", label: "Voice Output / TTS", status: voice.speakRoute ? "not_tested" : "not_connected", reason: voiceReason(voice.speakRoute, "speech"), evidence: ["not_tested"] });
  caps.push({ id: "image", label: "Image Understanding", status: "not_connected", reason: "No vision model or upload route is connected.", evidence: ["not_tested"] });
  caps.push({ id: "document", label: "Document Analysis", status: "not_connected", reason: "No document parsing or analysis service is connected.", evidence: ["not_tested"] });

  const ctx = byGroup("context");
  const { ran: cRan, pass: cPass } = passRate(ctx);
  caps.push({
    id: "memory",
    label: "Conversation Memory",
    status: !agent.reachable ? "failed" : cRan === 0 ? "not_tested" : cPass === cRan ? "limited" : "failed",
    reason: cRan === 0 ? "Follow-up scenarios have not been run. Memory is short-term only (last shown products and the cart snapshot); nothing is stored long-term." : `${cPass} of ${cRan} follow-up scenarios passed. Short-term only; nothing is stored long-term.`,
    evidence: cRan === 0 ? ["not_tested"] : ["integration"],
  });
  return caps;
}

export interface Totals {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  mockOnly: number;
  realIntegration: number;
  avgLatencyMs: number | null;
}

/** Totals for the Results tab. A result over a mock catalogue counts as mock-only and NEVER as a real integration test. */
export function totalsOf(results: ScenarioResult[]): Totals {
  const lat = results.map((r) => r.latencyMs).filter((x): x is number => x !== null);
  return {
    total: results.length,
    passed: results.filter((r) => r.verdict === "pass").length,
    failed: results.filter((r) => r.verdict === "fail").length,
    skipped: results.filter((r) => r.verdict === "skipped").length,
    mockOnly: results.filter((r) => r.verdict !== "skipped" && r.mockData).length,
    realIntegration: results.filter((r) => r.verdict !== "skipped" && !r.mockData).length,
    avgLatencyMs: lat.length ? Math.round(lat.reduce((a, b) => a + b, 0) / lat.length) : null,
  };
}
