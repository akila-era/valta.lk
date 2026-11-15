# Monitoring and observability report (wave 2)

Date: 2026-11-14. Written for: the project owner and whoever operates the assistant. Status words: **Implemented, Integrated, Tested locally, Pending approval, Blocked.** Nothing here was deployed: the live Agent still runs the 2026-11-14 bundle without any of this. Everything below is **counts, ratios and durations only**: no message text, audio, transcript, address, identity, session id or key is ever a metric label or value.

## 1. What is recorded

All series live in the in-process `Metrics` object and are served, **signed**, at `GET /v1/metrics` (read-only, same HMAC as chat). They reset when the process restarts.

| Series | Where it comes from | Labels (fixed lists; anything else becomes `(other)`) |
|---|---|---|
| `requests_total`, `errors_total`, latency `request` | HTTP layer | route, status, error code |
| `model_requests_total`, `jobs_total`, `model_switches_total`, latency `queue_wait`, `model_run` | scheduler | model key (`qwen`, `sinhala`), outcome |
| **`tokens_prompt_total`, `tokens_generated_total`, `model_calls_total`, `inference_ms_total`**, latency `model_run_qwen` / `model_run_sinhala` (new) | a wrapper around the model client (`meteredOllama`): Ollama's own `prompt_eval_count` / `eval_count` and wall time per call | model key |
| `tool_calls_total`, `tool_failures_total`, latency `tool_run` | pipeline | tool name, status |
| `verifier_rejections_total` | response verifier | verifier code |
| **`rate_limit_refusals_total`** (new) | the limiter itself, through an `onLimit` hook | `ip`, `session`, `identity`, `new_session`, `shop_ceiling`, `concurrency`, `cooldown`, `auth_failures` |
| **`browser_calls_total`, `browser_failures_total`**, latency `browser_task` (new) | browser agent | browser tool name, failure reason (including `injection_signal`) |
| **`voice_requests_total`, `voice_errors_total`, `voice_rejected_total`**, latency `voice_stt`, `voice_tts`, `voice_queue_wait` (new) | voice service through `metrics.voiceHook()` | route and status; outcome codes (code-shaped, at most 40 distinct per series) |
| Gauges (new): `new_sessions_last_hour`, `new_sessions_shop_ceiling`, `new_sessions_per_caller_limit`, `pre_auth_bodies_in_progress`; existing `queue_depth`, `queue_running`, `queue_rejected_full_total`, `in_flight` | limiter, server, scheduler | none |

**Cost.** The Agent is self-hosted, so the real cost is CPU time, reported as tokens and `inference_ms_total`. `summary.tokens.referenceCost` is `tokens / 1,000,000 x price` only if `AGENT_REFERENCE_PRICE_PER_MTOKENS` is set; **the default is 0**, so no cost is invented. It is a reference figure ("what this volume would cost elsewhere"), not a bill.

## 2. The compact summary (what alerts read)

`GET /v1/metrics` now also returns `summary`:
```json
{
  "requests": { "chat": 68, "errors5xx": 3, "rateLimited429": 0, "unauthorized401": 12 },
  "ratios": { "rateLimited": 0, "serverErrors": 0.044 },
  "queue": { "depth": 0, "running": false, "rejectedFullTotal": 0 },
  "newSessions": { "lastHour": 7, "shopCeiling": 2000, "ceilingUsedPct": 0.4, "perCallerLimit": 30 },
  "models": { "qwen": { "requests": 41, "promptTokens": 52000, "generatedTokens": 1900, "runMs": { "count": 41, "p50": 2300, "p95": 9600, "max": 44000, "mean": 3100, "p99": 44000 } }, "sinhala": { "requests": 0, "promptTokens": 0, "generatedTokens": 0, "runMs": null } },
  "tokens": { "prompt": 52000, "generated": 1900, "referencePricePerMillionTokens": 0, "referenceCost": 0 },
  "tools": { "calls": 60, "failures": 2 },
  "browser": { "enabled": false, "calls": 0, "failures": 0 },
  "voice": { "requests": 0, "errors": 0, "rejected": 0 },
  "rateLimitRefusals": { "new_session": 3 },
  "verifierRejections": 0
}
```
(The numbers are illustrative; the shape is exactly what `Metrics.snapshot().summary` returns and what the tests assert.) `ratios` are shares of `/v1/chat` requests in the process's lifetime (not a sliding window).

## 3. Reading it without a shell script that holds the key

`apps/agent/scripts/metrics-probe.mjs` (read-only) reads the first key from the Agent's env file, signs `GET /v1/metrics`, and prints the summary; `--alerts` prints the thresholds crossed and exits 2 if any is. It never prints the key, and its error messages name the problem only.
```
node scripts/metrics-probe.mjs --url http://127.0.0.1:8787 --env /etc/volta-agent/agent.env --alerts
```
It needs read access to that file (run as the service user or root). **Not installed or scheduled anywhere**: wiring it into the prepared `volta-alert` timer is a follow-up that needs the owner's approval.

## 4. Which prepared alerts can now be fed

(`tools/ops/prepared/04-monitoring/alert-rules.md`, not edited here: it is not in this agent's ownership.)

| Alert in the prepared file | Before | Now |
|---|---|---|
| Queue depth above the Agent's maximum | needs an Agent change | **Feedable**: `summary.queue.depth` (probe: `queue_depth_at_maximum`) |
| New-session ceiling at 50% | needs an Agent change; proxy = 429 count | **Feedable**: `summary.newSessions.ceilingUsedPct` (probe: `new_session_ceiling_50pct`); and `rateLimitRefusals.shop_ceiling > 0` means the ceiling was reached |
| `chat_rate_limited_often` | journal proxy | also from `summary.requests.rateLimited429`; `rateLimitRefusals` says **which limiter** refused |
| `chat_5xx_rate_high` | journal | also from `summary.ratios.serverErrors` (lifetime share) |
| Repeated unidentified client address | log line `0.0.0.0` | the website now sends the reserved marker `192.0.2.1` (see the architecture assessment); counting it needs a log search of the website or a counter at the Agent (not built) |
| Browser failures (new) | none | `browser_failures_high` in the probe (50% of at least 10 calls) |
| Memory, disk, service down, tunnel | host checks | unchanged (host-level; not an Agent metric) |

Still **not** available: sliding-window rates (the counters are lifetime since start), an alert on voice errors, persistence across restarts, dashboards and an external uptime check beyond the prepared probe.

## 5. Tests (executed, local)

`tests/integration/wave2-metrics.test.ts` (11 passed): limiter names recorded and no key or address in the output; a broken metrics hook cannot change the limiter's decision; the new-session gauge source; tokens and time per model call recorded and no text; a failing call counts no tokens; reference cost 0 unless configured; browser labels fixed; voice hook records codes only and bounds labels; the summary ratios; the signed route shows the gauges and per-limiter counts. `tests/integration/metrics-probe.test.ts` (3 passed): the script's signing is accepted by the real server (and a wrong key is refused), key parsing never echoes a value, alert thresholds. `tests/integration/main-entry.test.ts` (10 passed) includes the summary through the production entry.

## 6. Privacy statement (what is deliberately not recorded)

No message or transcript text, no audio, no addresses, no identities, no session ids, no page text or URLs, no element names, no prompts or model answers. Audit events of the browser carry a code, a tool name, an outcome, a duration and a short hash of the session id, nothing else (a field allow-list drops anything more). Voice outcome labels must look like codes and are capped. Tests assert that known sentinel strings never appear in a snapshot.

## 7. Approvals and risks

Nothing is live: using any of this needs the Agent bundle to be rebuilt from the production entry (`npm run bundle`) and deployed (Pending approval, with the rate-limit Step B). Lifetime counters mean a ratio can hide a recent problem; use the probe's absolute counts (`rateLimited429`, `queue.depth`) between two reads to see a rate.
