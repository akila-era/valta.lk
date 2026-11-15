"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { deriveCapabilities, totalsOf } from "@/lib/ai-qa/capabilities";
import { SCENARIOS, evaluate, type QaResponse, type Scenario } from "@/lib/ai-qa/scenarios";
import { EVIDENCE_LABEL, STATUS_LABEL, type Capability, type ProbeSnapshot, type ScenarioResult, type Status } from "@/lib/ai-qa/types";

/**
 * The QA control center (development only). Every status shown is derived from a real probe or a real test result in this session;
 * anything not connected says so. Nothing here creates an order or a payment, and a proposed cart change is never confirmed.
 */
type Tab = "overview" | "console" | "language" | "browser" | "voice" | "results";
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "console", label: "Test console" },
  { id: "language", label: "Language QA" },
  { id: "browser", label: "Browser QA" },
  { id: "voice", label: "Voice QA" },
  { id: "results", label: "Results" },
];

const CHIP: Record<Status, string> = {
  working: "bg-emerald-100 text-emerald-800 ring-emerald-300",
  limited: "bg-amber-100 text-amber-900 ring-amber-300",
  mock: "bg-violet-100 text-violet-800 ring-violet-300",
  not_connected: "bg-slate-200 text-slate-700 ring-slate-300",
  failed: "bg-red-100 text-red-800 ring-red-300",
  not_tested: "bg-sky-100 text-sky-800 ring-sky-300",
};
const StatusChip = ({ status, testId }: { status: Status; testId?: string }) => (
  <span data-testid={testId} data-status={status} className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide ring-1 ${CHIP[status]}`}>
    {STATUS_LABEL[status]}
  </span>
);

const VERDICT = { pass: ["PASS", "bg-emerald-100 text-emerald-800 ring-emerald-300"], fail: ["FAIL", "bg-red-100 text-red-800 ring-red-300"], skipped: ["SKIPPED", "bg-sky-100 text-sky-800 ring-sky-300"], not_run: ["NOT RUN", "bg-slate-200 text-slate-700 ring-slate-300"] } as const;
/** A scenario verdict is not a capability status: a passed check never reads "Working". */
const VerdictChip = ({ verdict }: { verdict: keyof typeof VERDICT }) => (
  <span data-testid="verdict" data-verdict-chip={verdict} className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide ring-1 ${VERDICT[verdict][1]}`}>
    {VERDICT[verdict][0]}
  </span>
);

interface StatusPayload {
  probe: ProbeSnapshot;
  capabilities: Capability[];
  config: { assistantConfigured: boolean; agentOrigin: string | null; previewGateOn: boolean; nodeEnv: string };
}
interface ChatTurn {
  user: string;
  ok: boolean;
  code?: string;
  response?: QaResponse;
  latencyMs: number;
}
type ChatApi = { ok: true; token: string; response: QaResponse; latencyMs: number } | { ok: false; code: string; latencyMs: number; retryAfterSec?: number };

async function qaChat(message: string, locale: string, token?: string): Promise<ChatApi> {
  const res = await fetch("/api/admin/ai-qa/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message, locale, ...(token ? { token } : {}) }) });
  if (!res.ok) return { ok: false, code: res.status === 401 || res.status === 403 ? "NOT_ADMIN" : `HTTP_${res.status}`, latencyMs: 0 };
  return (await res.json()) as ChatApi;
}

async function loadStatus(): Promise<{ data: StatusPayload } | { error: string }> {
  try {
    const res = await fetch("/api/admin/ai-qa/status", { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    return { data: (await res.json()) as StatusPayload };
  } catch {
    return { error: "Could not read the QA status. Are you signed in as admin, and is AI_QA_ENABLED=true in a non-production build?" };
  }
}

const money = (c: QaResponse["cards"][number]) => (c.price ? `Rs. ${c.price.amount.toLocaleString("en-US")}` : "");
const cardLine = (c: QaResponse["cards"][number]) => (c.type === "comparison" ? `Comparison of ${(c.products ?? []).map((p) => p.name).join(" and ")}` : `${c.name ?? c.type} ${money(c)}`.trim());
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function QaCenter() {
  const [tab, setTab] = useState<Tab>("overview");
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [results, setResults] = useState<ScenarioResult[]>([]);

  const apply = useCallback((r: { data: StatusPayload } | { error: string }) => {
    if ("data" in r) {
      setStatus(r.data);
      setStatusError(null);
    } else setStatusError(r.error);
  }, []);
  const refresh = useCallback(async () => apply(await loadStatus()), [apply]);
  useEffect(() => {
    let alive = true;
    void loadStatus().then((r) => {
      if (alive) apply(r);
    });
    return () => {
      alive = false;
    };
  }, [apply]);

  const capabilities = useMemo(() => (status ? deriveCapabilities(status.probe, results) : []), [status, results]);

  return (
    <div className="space-y-4" data-testid="qa-center">
      <div role="tablist" aria-label="AI QA sections" className="flex flex-wrap gap-1 border-b border-line pb-2">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} id={`tab-${t.id}`} aria-controls={`panel-${t.id}`} onClick={() => setTab(t.id)} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${tab === t.id ? "bg-ink text-white" : "text-muted hover:bg-surface"}`}>
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "overview" && <Overview status={status} error={statusError} capabilities={capabilities} onRefresh={refresh} />}
        {tab === "console" && <Console />}
        {tab === "language" && <LanguageQa results={results} setResults={setResults} reachable={status?.probe.agent.reachable ?? false} demoData={status?.probe.demoData ?? true} />}
        {tab === "browser" && <BrowserQa />}
        {tab === "voice" && <VoiceQa status={status} />}
        {tab === "results" && <Results results={results} status={status} capabilities={capabilities} />}
      </div>
    </div>
  );
}

function Fact({ label, children, testId }: { label: string; children: React.ReactNode; testId?: string }) {
  return (
    <div className="rounded-xl border border-line bg-white p-3" data-testid={testId}>
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-sm font-semibold text-ink">{children}</div>
    </div>
  );
}

function Overview({ status, error, capabilities, onRefresh }: { status: StatusPayload | null; error: string | null; capabilities: Capability[]; onRefresh: () => void }) {
  if (error) return <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>;
  if (!status) return <p className="text-sm text-muted">Checking the services…</p>;
  const a = status.probe.agent;
  const agentStatus: Status = !a.reachable ? "failed" : a.error === "unauthorized" ? "failed" : a.error === "bad_response" ? "limited" : a.ready ? "working" : "limited";
  return (
    <div className="space-y-4">
      {status.probe.demoData && <p className="rounded-lg bg-violet-50 p-3 text-sm text-violet-900" data-testid="demo-banner"><b>Demo data is on.</b> The catalogue behind the assistant is a MOCK (invented products such as Nova X1 and Orbit Pro). Prices and stock here are not real, so shopping capabilities cannot be labelled Working.</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="Current model" testId="fact-model">{a.loadedModel ? a.loadedModel : a.ollamaReachable ? "No model loaded" : "None connected"}</Fact>
        <Fact label="Agent health" testId="fact-agent"><StatusChip status={agentStatus} /> <span className="ml-1 text-xs font-normal text-muted">{a.reachable ? `HTTP ${a.httpStatus ?? "?"}${a.latencyMs !== undefined ? `, ${a.latencyMs} ms` : ""}` : a.error}</span></Fact>
        <Fact label="Agent address">{status.config.agentOrigin ?? "Not configured"}</Fact>
        <Fact label="Agent version">{a.appVersion ? `${a.appVersion} (contract ${a.contractVersion ?? "?"})` : "Unknown"}</Fact>
        <Fact label="Model service (Ollama)">{a.ollamaReachable === undefined ? "Not reported" : a.ollamaReachable ? "Reachable" : "Not connected"}</Fact>
        <Fact label="Browser worker"><StatusChip status="mock" /> <span className="ml-1 text-xs font-normal text-muted">no real driver</span></Fact>
        <Fact label="Voice service"><StatusChip status={status.probe.voice.transcribeRoute || status.probe.voice.speakRoute ? "not_tested" : "not_connected"} /></Fact>
        <Fact label="RAG service"><StatusChip status="not_connected" /></Fact>
      </div>
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold">Capabilities</h2>
        <button onClick={onRefresh} className="btn-secondary">Re-check services</button>
      </div>
      <ul className="grid gap-3 md:grid-cols-2" data-testid="capability-grid">
        {capabilities.map((c) => (
          <li key={c.id} className="rounded-xl border border-line bg-white p-3" data-testid={`cap-${c.id}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">{c.label}</span>
              <StatusChip status={c.status} testId={`cap-${c.id}-status`} />
            </div>
            <p className="mt-1.5 text-sm text-muted">{c.reason}</p>
            <p className="mt-1.5 flex flex-wrap gap-1.5">
              {c.evidence.map((e) => (
                <span key={e} className="rounded bg-surface px-1.5 py-0.5 text-[11px] font-medium text-muted">{EVIDENCE_LABEL[e]}</span>
              ))}
            </p>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted">Checked {new Date(status.probe.checkedAt).toLocaleTimeString()}. A status of Working needs real evidence and no mock data in the path; nothing is shown as Working just because a button or an endpoint exists.</p>
    </div>
  );
}

function Console() {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [text, setText] = useState("");
  const [locale, setLocale] = useState<"auto" | "en" | "si">("auto");
  const [busy, setBusy] = useState(false);
  const token = useRef<string | undefined>(undefined);

  async function send(message: string) {
    const m = message.trim();
    if (!m || busy) return;
    setBusy(true);
    setText("");
    const r = await qaChat(m, locale, token.current);
    if (r.ok) token.current = r.token;
    setTurns((t) => [...t, { user: m, ok: r.ok, ...(r.ok ? { response: r.response } : { code: r.code }), latencyMs: r.latencyMs }]);
    setBusy(false);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <section aria-label="Test conversation" className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm font-semibold" htmlFor="qa-locale">Language</label>
          <select id="qa-locale" value={locale} onChange={(e) => setLocale(e.target.value as typeof locale)} className="rounded-lg border border-line bg-white px-2 py-1 text-sm">
            <option value="auto">Auto</option>
            <option value="en">English</option>
            <option value="si">සිංහල</option>
          </select>
          <button onClick={() => { setTurns([]); token.current = undefined; }} className="btn-secondary">New conversation</button>
        </div>
        <ol className="max-h-[32rem] space-y-3 overflow-y-auto rounded-xl border border-line bg-surface p-3" data-testid="console-log" aria-live="polite">
          {turns.length === 0 && <li className="text-sm text-muted">Send a message. It goes through the real Agent path (signed request, verified response) as a guest. Proposed cart changes are shown but never confirmed.</li>}
          {turns.map((t, i) => (
            <li key={i} className="space-y-1.5" data-testid="console-turn">
              <div className="ml-auto w-fit max-w-[85%] rounded-xl bg-[#2563EB] px-3 py-1.5 text-sm text-white">{t.user}</div>
              {t.ok && t.response ? (
                <div className="w-fit max-w-[92%] rounded-xl bg-white p-3 text-sm shadow-sm" data-testid="console-reply">
                  <p>{t.response.reply.text}</p>
                  {t.response.cards.length > 0 && (
                    <ul className="mt-2 space-y-1 text-xs">
                      {t.response.cards.map((c, k) => (
                        <li key={k} className="rounded bg-surface px-2 py-1">🧾 {cardLine(c)}</li>
                      ))}
                    </ul>
                  )}
                  {t.response.actions.length > 0 && <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-900">Proposed action: {t.response.actions.map((a) => a.type).join(", ")} (the QA console does not confirm it)</p>}
                  {t.response.suggestions.length > 0 && (
                    <p className="mt-2 flex flex-wrap gap-1.5">
                      {t.response.suggestions.map((s) => (
                        <button key={s} onClick={() => void send(s)} className="rounded-full border border-[#2563EB]/40 px-2 py-0.5 text-xs text-[#2563EB]">{s}</button>
                      ))}
                    </p>
                  )}
                  <p className="mt-2 text-[11px] text-muted">language {t.response.language}{t.response.needsNativeReview ? " · needs native review" : ""} · {t.latencyMs} ms</p>
                </div>
              ) : (
                <div role="alert" className="w-fit rounded-xl bg-red-50 p-3 text-sm text-red-800" data-testid="console-error">Request failed: {t.code}. {t.code === "RATE_LIMITED" ? "The Agent is rate limiting; wait a moment." : t.code === "UNREACHABLE" ? "The Agent cannot be reached." : ""}</div>
              )}
            </li>
          ))}
        </ol>
        <form onSubmit={(e) => { e.preventDefault(); void send(text); }} className="flex gap-2">
          <input aria-label="Test message" value={text} onChange={(e) => setText(e.target.value)} maxLength={800} placeholder="Type a message to the assistant" className="min-h-11 flex-1 rounded-lg border border-line bg-white px-3 text-sm" />
          <button type="submit" disabled={busy || !text.trim()} className="btn-primary">{busy ? "Waiting…" : "Send"}</button>
        </form>
      </section>
      <aside className="space-y-3" aria-label="Execution trace">
        <div className="rounded-xl border border-dashed border-line bg-white p-3 text-sm" data-testid="trace-unavailable">
          <div className="flex items-center justify-between"><b>Intent and tool trace</b><StatusChip status="not_connected" /></div>
          <p className="mt-1.5 text-muted">Detected intent, extracted constraints, selected tools, the tool response and the verification result are <b>not available</b> yet: the Agent does not expose them to the website. They need a development-only trace endpoint on the Agent (stage 2). Until then this console shows what the shopper would see, plus latency.</p>
        </div>
        <div className="rounded-xl border border-line bg-white p-3 text-sm">
          <b>Last turn</b>
          <p className="mt-1 text-muted">{turns.length ? `${turns[turns.length - 1]!.latencyMs} ms, ${turns[turns.length - 1]!.ok ? "answered" : "failed"}` : "No messages yet."}</p>
        </div>
      </aside>
    </div>
  );
}

function expectSummary(s: Scenario): string {
  const e = s.expect;
  return [e.cards && `cards: ${e.cards}`, e.actions && `actions: ${e.actions}`, e.actionType && `proposal: ${e.actionType}`, e.comparisonOf && `compare ${e.comparisonOf}`, e.maxPriceRs && `≤ Rs. ${e.maxPriceRs}`, e.textIncludesAny && "mentions scope", e.textExcludesAny && "no invented facts", e.nativeReview && "native-review flag"].filter(Boolean).join(" · ");
}

function LanguageQa({ results, setResults, reachable, demoData }: { results: ScenarioResult[]; setResults: (f: (r: ScenarioResult[]) => ScenarioResult[]) => void; reachable: boolean; demoData: boolean }) {
  const [group, setGroup] = useState<string>("all");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");
  const stop = useRef(false);
  // Single-turn scenarios share ONE QA conversation (the Agent limits new conversations per hour); follow-up scenarios get their own.
  const shared = useRef<string | undefined>(undefined);
  const list = SCENARIOS.filter((s) => group === "all" || s.group === group);
  const byId = new Map(results.map((r) => [r.id, r]));

  async function runOne(s: Scenario): Promise<ScenarioResult> {
    const multi = s.prompts.length > 1;
    let token: string | undefined = multi ? undefined : shared.current;
    let last: ChatApi | undefined;
    for (const prompt of s.prompts) {
      for (let attempt = 0; attempt < 3; attempt++) {
        last = await qaChat(prompt, "auto", token);
        if (last.ok || last.code !== "RATE_LIMITED") break;
        setProgress(`Rate limited by the Agent; waiting ${last.retryAfterSec ?? 10} s…`);
        await sleep((last.retryAfterSec ?? 10) * 1000);
      }
      if (!last?.ok) break;
      token = last.token;
      if (!multi) shared.current = last.token;
      await sleep(1200);
    }
    const base = { id: s.id, group: s.group, prompt: s.prompts.join("  →  "), mockData: demoData, ranAt: new Date().toISOString() };
    if (!last || !last.ok) return { ...base, verdict: "skipped", latencyMs: last?.latencyMs ?? null, failures: [`could not run: ${last?.code ?? "no answer"}`], replyText: "", cardNames: [], actionTypes: [] };
    const failures = evaluate(s.expect, last.response);
    return { ...base, verdict: failures.length ? "fail" : "pass", latencyMs: last.latencyMs, failures, replyText: last.response.reply.text, cardNames: last.response.cards.map(cardLine), actionTypes: last.response.actions.map((a) => a.type) };
  }

  async function run() {
    setRunning(true);
    stop.current = false;
    for (let i = 0; i < list.length && !stop.current; i++) {
      const s = list[i]!;
      setProgress(`Running ${i + 1} of ${list.length}: ${s.title}`);
      const r = await runOne(s);
      setResults((all) => [...all.filter((x) => x.id !== s.id), r]);
      await sleep(2500); // the Agent rate-limits; pacing keeps the run from tripping its own limits
    }
    setProgress(stop.current ? "Stopped." : "Finished.");
    setRunning(false);
  }

  return (
    <div className="space-y-3">
      {!reachable && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">The Agent cannot be reached, so scenarios cannot run. Check the Overview tab.</p>}
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="qa-group" className="text-sm font-semibold">Group</label>
        <select id="qa-group" value={group} onChange={(e) => setGroup(e.target.value)} className="rounded-lg border border-line bg-white px-2 py-1 text-sm">
          {["all", "en", "singlish", "si", "mixed", "shopping", "general", "safety", "context"].map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
        <button onClick={() => void run()} disabled={running || !reachable} className="btn-primary" data-testid="run-language-qa">{running ? "Running…" : `Run ${list.length} scenarios`}</button>
        {running && <button onClick={() => { stop.current = true; }} className="btn-secondary">Stop</button>}
        <span className="text-sm text-muted" role="status" data-testid="qa-progress">{progress}</span>
      </div>
      <p className="text-xs text-muted">Each scenario states what a correct assistant does and checks it on the real reply. Intent comparison needs the Agent trace (stage 2); here the observed outcome is compared. Some scenarios are expected to fail on the current live Agent: those are real findings.{demoData ? " Results are over the MOCK catalogue." : ""}</p>
      <div className="overflow-x-auto rounded-xl border border-line bg-white">
        <table className="w-full text-left text-sm" data-testid="language-table">
          <thead className="bg-surface text-xs uppercase text-muted"><tr><th className="p-2">Scenario</th><th className="p-2">Expected</th><th className="p-2">Observed</th><th className="p-2">Result</th><th className="p-2">ms</th></tr></thead>
          <tbody>
            {list.map((s) => {
              const r = byId.get(s.id);
              return (
                <tr key={s.id} className="border-t border-line align-top" data-testid={`row-${s.id}`} data-verdict={r?.verdict ?? "not_run"}>
                  <td className="p-2"><div className="font-semibold">{s.title}</div><div className="text-xs text-muted">{s.group} · {s.prompts.join(" → ")}</div></td>
                  <td className="p-2 text-xs text-muted">{expectSummary(s)}</td>
                  <td className="p-2 text-xs">{r ? <><div>{r.replyText.slice(0, 140)}</div>{r.cardNames.length > 0 && <div className="text-muted">{r.cardNames.join("; ")}</div>}{r.actionTypes.length > 0 && <div className="text-muted">proposal: {r.actionTypes.join(", ")}</div>}</> : <span className="text-muted">not run</span>}</td>
                  <td className="p-2">{r ? <><VerdictChip verdict={r.verdict} />{r.verdict !== "pass" && r.failures.map((f, i) => <div key={i} className="mt-1 text-xs text-red-700">{f}</div>)}</> : <VerdictChip verdict="not_run" />}</td>
                  <td className="p-2 text-xs">{r?.latencyMs ?? ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const BROWSER_SCENARIOS = ["Open the VOLTA.LK homepage", "Navigate to the mobile phones category", "Search for a product", "Apply a price filter", "Open a product", "Read product specifications", "Compare products", "Inspect a sandbox cart", "Go back to the previous page", "Reject navigation to Google or any external domain"];

function BrowserQa() {
  return (
    <div className="space-y-3">
      <p className="rounded-lg bg-violet-50 p-3 text-sm text-violet-900" data-testid="browser-banner"><b>MOCK ONLY.</b> The browser tool layer (eleven typed tools, sessions, confirmation tokens, the action loop and the exact-host allowlist for <code>valta.hexalyte.com</code>) exists and is tested against a <b>mock</b> driver. <b>No real Playwright driver exists yet</b>, so no real page has ever been controlled by the assistant. This tab will show live URL, title, elements, action history and screenshots only when a real driver is connected (stage 3).</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Fact label="Browser worker"><StatusChip status="mock" /></Fact>
        <Fact label="Real Chromium driver"><StatusChip status="not_connected" /></Fact>
      </div>
      <h2 className="text-base font-bold">Scenarios</h2>
      <ol className="space-y-1.5" data-testid="browser-scenarios">
        {BROWSER_SCENARIOS.map((s, i) => (
          <li key={s} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-white px-3 py-2 text-sm">
            <span>{i + 1}. {s}</span>
            <span className="flex gap-1.5"><StatusChip status="not_tested" /><span className="rounded bg-violet-100 px-1.5 py-0.5 text-[11px] font-semibold text-violet-800">mock-tested only</span></span>
          </li>
        ))}
      </ol>
      <div className="rounded-xl border border-line bg-white p-3 text-sm" data-testid="browser-mock-results">
        <b>Mock benchmark (MOCK driver, scripted planners, not a model, not a real browser)</b>
        <p className="mt-1 text-muted">15 scenarios × 20 runs ended as designed; 0 incorrect actions; 0 off-site pages shown to the assistant; 0 session leaks; 13 of 46 tool calls were intended refusals. With a deliberately leaky mock driver, 1 request left the driver before the tool layer stopped the assistant: why network-level blocking is required for any real worker. Source: the Agent&apos;s browser benchmark (<code>docs/AI_BROWSER_BENCHMARKS.md</code>).</p>
      </div>
    </div>
  );
}

function VoiceQa({ status }: { status: StatusPayload | null }) {
  const [mic, setMic] = useState<{ state: "idle" | "asking" | "ok" | "denied" | "none" | "unsupported"; level: number }>({ state: "idle", level: 0 });
  async function testMic() {
    if (!navigator.mediaDevices?.getUserMedia) return setMic({ state: "unsupported", level: 0 });
    setMic({ state: "asking", level: 0 });
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      const n = (e as DOMException).name;
      return setMic({ state: n === "NotFoundError" ? "none" : "denied", level: 0 });
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const an = ctx.createAnalyser();
    ctx.createMediaStreamSource(stream).connect(an);
    const buf = new Uint8Array(an.fftSize);
    let peak = 0;
    for (let i = 0; i < 30; i++) {
      an.getByteTimeDomainData(buf);
      peak = Math.max(peak, ...Array.from(buf, (v) => Math.abs(v - 128) / 128));
      setMic({ state: "ok", level: peak });
      await sleep(100);
    }
    stream.getTracks().forEach((t) => t.stop()); // the microphone is released at once; nothing is recorded or stored
    void ctx.close();
  }
  const v = status?.probe.voice;
  return (
    <div className="space-y-3">
      <p className="rounded-lg bg-slate-100 p-3 text-sm" data-testid="voice-banner"><b>No speech service is connected.</b> There is no speech-to-text and no text-to-speech running anywhere in this project, so voice cannot be tested end to end and no transcription or audio reply is simulated. Sinhala voice support is not claimed. Recording customers is never done; only approved sample recordings may be used when a service exists.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Fact label="Speech-to-text (STT)" testId="voice-stt"><StatusChip status={v?.transcribeRoute ? "not_tested" : "not_connected"} /></Fact>
        <Fact label="Text-to-speech (TTS)" testId="voice-tts"><StatusChip status={v?.speakRoute ? "not_tested" : "not_connected"} /></Fact>
        <Fact label="Microphone in this browser" testId="voice-mic"><StatusChip status={mic.state === "ok" ? "working" : mic.state === "idle" ? "not_tested" : mic.state === "asking" ? "not_tested" : "failed"} /></Fact>
      </div>
      <div className="rounded-xl border border-line bg-white p-3">
        <button onClick={() => void testMic()} className="btn-secondary" data-testid="mic-test">Test microphone (3 seconds, nothing is recorded)</button>
        <div className="mt-2 h-3 w-full max-w-sm overflow-hidden rounded bg-surface" aria-hidden><div className="h-full bg-emerald-500 transition-all" style={{ width: `${Math.round(mic.level * 100)}%` }} /></div>
        <p className="mt-1.5 text-sm text-muted" role="status" data-testid="mic-result">
          {mic.state === "idle" && "Not tested yet."}
          {mic.state === "asking" && "Waiting for you to allow the microphone…"}
          {mic.state === "ok" && `Microphone works: peak level ${Math.round(mic.level * 100)}%. It has been released.`}
          {mic.state === "denied" && "Microphone permission was denied or blocked (check the site permission and the Permissions-Policy header)."}
          {mic.state === "none" && "No microphone was found."}
          {mic.state === "unsupported" && "This browser cannot record audio here (it needs HTTPS or localhost)."}
        </p>
      </div>
      <div className="rounded-xl border border-dashed border-line bg-white p-3 text-sm"><b>Transcription</b> <StatusChip status="not_connected" /> · <b>Spoken reply</b> <StatusChip status="not_connected" /> · <b>Latency and errors</b>: none to show, because no service answers.</div>
    </div>
  );
}

function Results({ results, status, capabilities }: { results: ScenarioResult[]; status: StatusPayload | null; capabilities: Capability[] }) {
  const t = totalsOf(results);
  const failures = results.filter((r) => r.verdict === "fail");
  function exportJson() {
    const doc = { generatedAt: new Date().toISOString(), note: "Results of the local VOLTA AI QA control center. Contains no secrets. Results over a mock catalogue count as mock-only, never as real integration tests.", probe: status?.probe ?? null, capabilities, totals: t, results };
    const url = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `volta-ai-qa-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  const cell = (label: string, v: string | number, id: string) => <Fact key={id} label={label} testId={`total-${id}`}>{v}</Fact>;
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {cell("Total tests", t.total, "total")}
        {cell("Passed", t.passed, "passed")}
        {cell("Failed", t.failed, "failed")}
        {cell("Skipped", t.skipped, "skipped")}
        {cell("Mock only", t.mockOnly, "mock")}
        {cell("Real integration", t.realIntegration, "real")}
        {cell("Average latency", t.avgLatencyMs === null ? "n/a" : `${t.avgLatencyMs} ms`, "latency")}
      </div>
      <button onClick={exportJson} disabled={results.length === 0} className="btn-primary" data-testid="export-json">Export results as JSON</button>
      {results.length === 0 && <p className="text-sm text-muted">No tests have run in this session. Use Language QA to run scenarios.</p>}
      {failures.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3" data-testid="failure-details">
          <h2 className="text-base font-bold text-red-800">Failure details</h2>
          <ul className="mt-2 space-y-2 text-sm">{failures.map((f) => <li key={f.id}><b>{f.id}</b>: {f.prompt}<ul className="ml-4 list-disc text-red-700">{f.failures.map((x, i) => <li key={i}>{x}</li>)}</ul></li>)}</ul>
        </div>
      )}
    </div>
  );
}
