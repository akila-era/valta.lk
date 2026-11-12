# VOLTA.LK AI Shopping Assistant: M1-E Performance, Observability and Reliability Report

Status: M1-E complete, awaiting review. Nothing is committed, pushed or deployed.
Mock data only (an in-memory fixture ERP, so tool timings exclude any real ERP network time). No production ERP, database or customer data. No SSH, firewall, networking, Ollama configuration or service change, no public port, no cloud model, no paid API, no voice, no migration, no message retention. **No rate limit or other setting was changed**; measured recommendations are in section 11 and need your approval.

## 1. Test environment

| Item | Value |
|---|---|
| Server | Hetzner CX23 VM "volta-ai", Ubuntu 26.04, **2 vCPU, 3.8 GB RAM, 2 GB swap, CPU only** (no GPU), 38 GB disk (25% used) |
| Ollama | 0.40.16, service settings unchanged: `OLLAMA_MAX_LOADED_MODELS=1`, `OLLAMA_NUM_PARALLEL=1`, `OLLAMA_MAX_QUEUE=8`, `OLLAMA_KEEP_ALIVE=5m`, `OLLAMA_CONTEXT_LENGTH=2048`, `OLLAMA_NO_CLOUD=1`; loopback only |
| Qwen | `qwen3:1.7b-q4_K_M`, architecture qwen3, 2.0 B parameters (incl. embeddings), **Q4_K_M**, 1.65 GB on disk, context 2048 used |
| SinhalaLLM | `hf.co/namindu94/SinhalaLLM-1.7B:Q4_K_M`, llama architecture, 1.74 B parameters, **Q4_K_M**, 1.1 GB on disk |
| Runtime | Node 24.22.3 (`/opt/node/current/bin/node`), the Agent code bundled into one file |
| How it ran | The approved transient procedure: one bundled file copied to `/tmp/m1e`, run, results copied back, then **everything deleted** (verified: `/tmp/m1e` gone, no stray processes) |
| Dev machine | Windows 11, Node 24.12, used only for automated tests and a router dry run (not used for any reported server figure) |

The harness is `apps/agent/tests/real/m1e-bench.ts`; raw results are in `docs/m1e-raw/` (JSON per phase, the resource samples, the baseline and progress logs).

## 2. Methodology

- **One run, one slot.** Every phase ran once, in sequence, with exactly one model generation at a time (the scheduler's single slot). No phase sent concurrent generations to Ollama. About 31 minutes in total, starting 14:49 UTC.
- **Timing** uses a monotonic clock around each call. Model calls also record Ollama's own `load_duration`, token counts and speed.
- **Resources** were sampled every second by a shell sampler reading `/proc` and calling the local Ollama API (system memory, swap, CPU, load, memory pressure, RSS and CPU of the model process `llama-server` and of the benchmark process, the kernel OOM-kill counter, `systemctl is-active ollama`, an API probe, disk). 1,635 samples cover the model processes (my first sampler matched only the `ollama` process name, missed the `llama-server` runner, and was replaced after the Qwen phase; system-wide memory, swap, CPU and OOM figures were captured by both). The sampler itself costs a few percent of CPU (about 9% busy when idle).
- **Full request** latency goes through a real Agent HTTP server bound to `127.0.0.1` on an ephemeral port inside the benchmark process (loopback only, closed at the end), including HMAC verification, rate-limit checks, routing, tools, verifier and, where needed, Qwen. The signing client is in the same process.
- Message mix for the full-request phase (60 requests): 50% English the router recognises, 20% English the router abstains on (so Qwen decides), 20% Sinhala, 10% more recognised English.
- **Percentile quality:** the router, safety filter and tool figures come from thousands of samples. The model figures come from 16 to 36 samples per series, so their p95 and p99 are close to the maximum and should be read as indicative only.

## 3. Latency results

All times in milliseconds unless stated.

| What | n | p50 | p95 | p99 | max |
|---|---|---|---|---|---|
| Safety filter | 5,550 | 0.06 | 0.10 | 0.14 | 43.5 |
| **Deterministic router** (English, Sinhala, unsafe pack) | 5,550 | 0.53 | 0.97 | 1.35 | 18.4 |
| Pipeline with no model (safety, routing, tools, cards, verifier, template) | 96 | 2.6 | 6.4 | 13.1 | 13.1 |
| Tool execution, mock backend, per call (search / details / compare 4 / stock / accessories / cart / add) | 300 each | 0.06 to 0.52 | 0.07 to 0.66 | 0.09 to 1.29 | up to 14.4 |
| **Qwen tool planning, warm** (whole planner call) | 30 | 8,611 | 20,447 | 25,461 | 25,461 |
| Qwen model call alone, warm | 36 | 8,698 | 13,878 | 44,115 | 44,115 |
| Qwen cold start (nothing loaded) | 1 | 44,166 | | | |
| **SinhalaLLM polish, warm** | 16 | 3,715 | 10,853 | | 10,853 |
| SinhalaLLM cold start | 1 | 10,232 | | | |
| Full request, English answered by the router (HTTP, loopback) | 43 | 7.0 | 20 | 167 | 167 |
| Full request, Sinhala answered by the router (HTTP, loopback) | 12 | 7.7 | 29 | 29 | 29 |
| Full request, Qwen used (router abstained) | 5 | 11,010 | | | 56,284 |
| Full request, all 60 | 60 | 7.5 | 9,434 | 56,284 | 56,284 |
| Health endpoint while the server was loaded | 128 | 11 | 43 | 59 | 68 |

Qwen details: about 860 prompt tokens per call (the fixed system prompt plus the tool schemas), 17 to 53 generated tokens, **5.1 tokens per second** generation (4.4 to 5.8), 17% of calls needed a second attempt after invalid arguments, 5 of 30 returned no tool call and 2 stayed invalid after the retry (consistent with the earlier evaluation). SinhalaLLM: **7.0 tokens per second**, 13 of 16 polishes accepted by the safety checks (rejected: 2 new Latin words, 1 length).

Queue wait for the full-request mix was about 0 ms (7 model jobs, never more than one waiting).

## 4. Model switching

Ollama keeps one model loaded (`OLLAMA_MAX_LOADED_MODELS=1`): switching unloads one model and loads the other. Six cycles of Qwen, SinhalaLLM, SinhalaLLM, Qwen, Qwen, each through the scheduler:

| | p50 | range | Ollama load time |
|---|---|---|---|
| First SinhalaLLM request after Qwen | 7,707 | 7,274 to 8,706 | 4,307 (4,274 to 4,536) |
| Same model, warm | 1,577 | 975 to 2,487 | none |
| **First Qwen request after SinhalaLLM** | **40,377** | 39,272 to 42,560 | 4,847 (4,583 to 5,327) |
| Qwen, warm | 6,863 | 6,478 to 7,244 | none |

Switch overhead (first request after a switch minus the warm request): **about 6.1 s to SinhalaLLM and about 33.5 s back to Qwen**. Loading the weights takes only 4 to 5 s of that. The rest is that the 860-token Qwen prompt must be processed from scratch after a switch (about 25 prompt tokens per second on this CPU) instead of being served from the prompt cache that a warm Qwen keeps. Unloading is immediate; the loaded-model timeline shows an empty state between two models. After a run, Ollama leaves the last model resident for its 5-minute keep-alive.

Consequence: a Qwen request that follows any SinhalaLLM use costs about 40 s, close to the default 45 s request deadline. Section 11 explains what this implies.

## 5. Queue and soak tests

Single request, sequential requests, small concurrent groups, queue saturation, timeout, cancellation and the 50-job workload were run (the single request and sequential results are the cold and warm figures above).

**Small concurrent groups** (through the HTTP server, Qwen resident, 3 rounds each; groups of requests the router cannot answer):

| Group | Requests | Status | p50 | p95 | Queue wait reported (p95) |
|---|---|---|---|---|---|
| 2 at once | 6 | all 200 | 66 ms | 9,819 ms | 4 ms |
| 3 at once | 9 | all 200 | 29 ms | 30,009 ms | 10,046 ms |
| 4 at once | 12 | all 200 | 48 ms | 22,370 ms | 9,643 ms |

(Many requests in a group are answered by the router in milliseconds; only the model-dependent ones queue, one at a time. The health endpoint answered every poll, 128 of 128.)

**Queue saturation** (production queue depth of 6, 30 jobs submitted at once): 7 accepted (1 running, 6 queued) and all completed; **23 rejected** immediately with `QUEUE_FULL` (rejection latency p50 39 ms, max 70 ms). The Retry-After the scheduler advertised was **84 s**.

**Timeout and cancellation** (Qwen resident):

| Case | Result |
|---|---|
| Running job past its 800 ms deadline | `JobDeadlineError` after 798 ms; the next request then took 12.5 s (a normal warm call) |
| Running job cancelled by the client at 800 ms | `JobAbortedError`; the scheduler settled **9 ms** after the abort; the next request took 11.6 s |
| Queued job whose 500 ms deadline passes | `JobDeadlineError` after 501 ms, never started |
| Queued job cancelled | `JobAbortedError` after 201 ms |
| Blocking job behind them | completed normally; the slot was free at the end (running none, depth 0) |

**50-job queued workload** (50 jobs submitted at once, about two thirds Qwen tool calls and one third SinhalaLLM polishing, one customer-priority job in five, one generation at a time, queue depth set to 50 for this test only; the production depth is 6):

| Measure | Result |
|---|---|
| Outcome | 50 of 50 completed, 0 failed, 0 expired |
| Wall time | **1,026 s (17.1 min)** |
| Throughput | **2.9 jobs per minute** |
| Model switches | **32** (the scheduler's affinity rule allows only 3 consecutive jobs for the loaded model while the other is waiting) |
| Run time per job | p50 9.6 s, p95 44.5 s, p99 47.0 s (Qwen p50 14.1 s, SinhalaLLM p50 8.9 s; jobs that followed a switch p50 16.8 s, p95 44.8 s) |
| Queue wait | p50 499 s, p95 962 s, max 1,017 s |
| Time in system | p50 544 s, p95 974 s |

This is a stress test of the mechanism, not a realistic shopper load. It shows the cost of model switching: most of the 17 minutes was spent re-loading and re-processing prompts, not generating answers.

## 6. Resource measurements

Over the whole run (about 1,600 to 1,970 one-second samples):

| Resource | Result |
|---|---|
| RAM used (total minus available) | average 1,992 MB, **peak 2,164 MB** of 3,814 MB |
| RAM available | **minimum 1,651 MB** |
| Swap | at most **2.7 MB** of 2,048 MB (essentially unused) |
| Memory pressure (PSI some, avg10) | at most 0.54% |
| `llama-server` RSS (the loaded model) | **peak 1,677 MB** (one model at a time; never two) |
| Benchmark process RSS (Agent bundle, mock backend, in-process server) | **peak 112 MB** (about 82 MB at idle, measured on the dev machine) |
| CPU | **100% busy during every model job**; `llama-server` used about 170 to 180% of the 200% available. Average 94 to 98% busy in each model phase (includes sampler overhead). Load average peaked at 3.56 on 2 vCPU |
| OOM kills | **0** (`oom_kill` counter 0 before, during and after) |
| Ollama service | `active` in all 1,968 samples; its API probe returned 200 every time (p50 1.5 ms, max 134 ms) |
| Agent availability | the in-process Agent answered 128 of 128 health polls during concurrent load (p95 43 ms) |
| Disk | 25% used throughout (8.8 to 8.9 GB of 38 GB) |
| Model load and unload | observed through `/api/ps`: one model at a time, an empty state between models, load 4.1 to 5.3 s |

Observation: with the CPU saturated by inference, SSH connections to the server were slow once and refused once for a few seconds (the sessions that were already open and later connections worked). Operationally, admin access can be sluggish while a model is generating.

The per-process CPU column for `llama-server` is unreliable in phases with model switches (the runner process is replaced on each switch and the counter restarts); the system-wide CPU figure is used instead.

OOM protection and memory limits were not touched; there was ample headroom (about 1.6 GB available at the worst moment).

## 7. Observability (new)

Safe operational metrics, in `apps/agent/src/observability/metrics.ts`, read through a signed `GET /v1/metrics` route (same HMAC authentication as health; 404 if no metrics object is configured; 401 without a valid signature):

- `requests_total` by route and status; `errors_total` by error code; `validation_failures_total`; `rate_limit_rejections_total` (rate limit and challenge).
- `tool_calls_total` by tool; `tool_failures_total` by tool and status; a latency series for each tool batch.
- `verifier_rejections_total` by failure code.
- `model_requests_total` by model; `jobs_total` by outcome; `model_switches_total` labelled `qwen->sinhala` or `sinhala->qwen`.
- Gauges for queue depth, whether a job is running, in-flight requests, and cumulative queue rejections and expiries.
- Latency series (count, mean, max, p50, p95, p99 over the latest 2,000 samples) for requests, queue wait, model run time and tool batches.

Safety: there is no free-text parameter. Every label comes from an allow-list (routes, error codes, the ten tool names, the two model keys, the verifier codes, job outcomes) and anything else is recorded as `(other)`. A test feeds hostile tool names, messages, secrets and customer ids and confirms none reaches a metric. Metrics carry no identity, IP, session id or message text. The scheduler gained an `observer` hook that reports only the model, timings and outcome of each job (a throwing observer cannot break scheduling). The pipeline reports tool names and statuses. `main.ts` wires the metrics (the production entry point remains disabled by design in M1).

## 8. Reliability and recovery (automated, fake Ollama)

`tests/integration/m1e-reliability.test.ts` (12 tests) and `m1e-observability.test.ts` (11 tests):

| Scenario | Result |
|---|---|
| Ollama unavailable | model-dependent messages get `503 AI_UNAVAILABLE`; router-answered messages still return 200; health reports not ready; the slot is free |
| Ollama returns to service | the next request succeeds, no restart needed |
| Model not installed | `502 UPSTREAM_ERROR`, slot freed, deterministic answers unaffected, failure counted in metrics |
| Switch to SinhalaLLM fails | the shopper gets the fixed template (still flagged for native review); the queue is not poisoned and the next Qwen job works |
| Switch outlasts the deadline | `504 TIMEOUT` within the deadline; served normally once the model is loaded |
| Queue full | overflow gets `503 QUEUE_FULL` with Retry-After; accepted jobs complete; the service recovers fully |
| Hung model | `504` within the deadline, slot freed, next request served |
| Client disconnects mid-request | the job is cancelled (counted as aborted), the slot is freed, later requests are served |
| Rate-limit storage broken | chat is refused with 503 (fail safe) while health and metrics stay available; counted in metrics |
| Verifier rejects an answer | fixed safe text, counted by code, next request unaffected (M1-D tests) |

One fix came out of this: when the counter store was broken, the pre-authentication throttle also refused the health and metrics routes, hiding the failure from monitoring. Those two signed read-only routes now stay reachable (chat still fails safe).

### State lost when the Agent process restarts

The Agent writes nothing to disk (asserted by a test that no source file uses file, database or browser storage APIs). Everything below is in memory and is **lost on restart**:

| State | After a restart |
|---|---|
| Rate counters, cooldowns, concurrency counters, new-session counters | reset: a client that was limited or in cooldown is allowed again |
| Failed-authentication throttle | reset |
| Replay (nonce) cache | **empty: a captured, already accepted signed request can be replayed after a restart while its timestamp is within the 60 s clock window** (shown by a test; section 11, R7) |
| Session id bindings and conversation state (last shown products, slots, language) | forgotten; a session id can be bound by any identity again; the next turn is rebuilt from the cart and page context each request carries |
| Metrics counters and latency samples | reset to zero |
| Scheduler queue and its belief about the loaded model | queued and running requests end with a connection error and are retried by the BFF; the next job is not counted as a switch |
| Catalogue and vocabulary cache | refetched from the ERP |
| Conversation text | never stored, so nothing to lose |

Not lost: configuration (environment), and the loaded model in Ollama (a separate service that does not restart with the Agent).

**This design is single-instance.** All limits and state are per process. Multi-instance deployment or persistent, distributed rate limiting is **not** implemented and is not claimed.

## 9. End-to-end and regression testing

| Suite | Result |
|---|---|
| Agent tests (vitest) | 39 files, **815 passed**, 0 failed, 0 skipped (was 792; 23 new) |
| Web tests (vitest, unit and integration) | 16 files, **191 passed**, 0 failed, 0 skipped |
| **Existing storefront Playwright E2E plus the assistant demo spec** (full suite, both the desktop and mobile projects, real Chromium, mock ERP and an in-memory database) | **98 passed**, 0 failed, 0 skipped (4.8 min) |
| Agent typecheck | 0 errors |
| Web typecheck | 0 errors |
| ESLint | the agent package has no ESLint configuration; no web source file changed in M1-E (the web ESLint run at the previous milestone was clean) |
| Security regression | the whole M1-D suite (rate limits, sessions, injection, sensitive data, tool authorization, verifier) passes unchanged |
| Skipped | none. Not run: a longer soak than the 17-minute 50-job test, any test against a real ERP, and any multi-instance test (not supported) |

New or changed files: `src/observability/metrics.ts` (new), `src/queue/scheduler.ts` (job observer), `src/http/server.ts` (metrics route and recording, monitoring routes stay reachable), `src/pipeline/routing-pipeline.ts` (tool metrics), `src/mock/stack.ts`, `src/main.ts`; tests `tests/integration/m1e-{observability,reliability}.test.ts`, `tests/real/m1e-bench.ts`, `tests/fixtures/{mock-stack-helpers,http-helpers}.ts`; docs and raw results `docs/AI_M1_E_PERFORMANCE_REPORT.md`, `docs/m1e-raw/`.

## 10. Capacity and recommended safe concurrency (measured)

- **Model concurrency: 1.** One generation at a time and one model resident. This is the Ollama configuration and the 4 GB budget (a second model would need about another 1.1 to 1.6 GB, leaving little headroom). Do not raise it.
- **Router-answered requests are not a capacity concern:** about 7 ms end to end at p50 and 20 ms at p95, using a fraction of a CPU. Limits on them exist for abuse, not capacity.
- **Qwen fallback:** about 8.6 s per request warm (p95 about 20 s), so roughly **6 to 7 requests per minute** while Qwen stays loaded. If Qwen has to be re-loaded each time, about 1.5 per minute.
- **SinhalaLLM polishing:** each Sinhala polish that follows Qwen costs about 6 s for the switch, **and the next Qwen request then costs about 40 s**. Mixed Qwen and SinhalaLLM traffic dropped throughput to 2.9 jobs per minute in the 50-job test.
- **Queue depth:** with a warm Qwen at about 9 s per job and the 45 s deadline, a request behind 3 others would finish at about 36 s. A queue of 6 implies about 60 s of waiting, past the deadline, and the scheduler's own advertised Retry-After at saturation was 84 s. A depth of about **3** fits the measured service time (recommendation R5).
- **Memory is not the limit:** peak 2.2 GB used, at least 1.65 GB available, swap unused, no OOM. **CPU is the limit:** 100% busy and about 5 tokens per second.

### Production capacity estimate (read with the caveats)

If a fraction *f* of requests needs Qwen and Qwen is kept warm, sustainable total load is about 6.5 / *f* requests per minute:

| Share needing Qwen | Sustainable total |
|---|---|
| 5% | about 130 per minute |
| 10% | about 65 per minute |
| 20% | about 33 per minute |
| 50% | about 13 per minute |

In the benchmark mix, 7 of 60 requests (12%) needed Qwen. The router handled the rest in milliseconds. **Caveats:** one 2 vCPU CPU-only VM; a single run per phase; a developer-authored message mix, not real shoppers (the Qwen share in production is unknown and the router's real-world coverage is unevaluated); mock ERP with no network latency (real ERP calls will add to every tool call); no TLS, tunnel or BFF hop; no sustained multi-hour load; the table assumes the model is never switched away and that bursts are absorbed by the short queue (otherwise requests are rejected or degraded, not delayed indefinitely); noisy neighbours on the shared VM could change the figures. Treat these as order-of-magnitude planning numbers, not guarantees.

## 11. Recommendations needing your approval (nothing was changed)

- **R1:** Keep **SinhalaLLM polishing off** in production (it is off by default). Each use costs a switch and a 40 s penalty for the next Qwen request. If it is ever enabled, allow it only when the queue is empty and keep Qwen resident otherwise.
- **R2:** Update the scheduler's switch-cost estimate (`switchCostMs`, now 6 s) to the measured values (about 8 s to SinhalaLLM and about 41 s to Qwen) so degrade decisions and Retry-After are accurate. Today they under-estimate the cost of returning to Qwen.
- **R3:** Reduce the Qwen prompt (about 860 tokens, mostly the tool schemas) by sending only the tools plausible for the actor and intent. This should shorten both the warm call and the 40 s post-switch penalty. It needs a re-run of the English evaluation to check accuracy.
- **R4:** Request deadline: a Qwen request after a model switch took 39 to 47 s, so the default 45 s deadline can time out. Either avoid switches (R1) or raise `AGENT_DEADLINE_MS` and degrade to a fixed template earlier.
- **R5:** Lower the inference queue depth (`AGENT_QUEUE_MAX_DEPTH`, default 6) to about 3 for the Qwen fallback so waiting stays inside the deadline and overflow gets a prompt 503 with an honest Retry-After.
- **R6:** Revisit the scheduler's affinity limit (3 consecutive jobs): it caused 32 switches in 50 jobs. A higher limit or batching reduces switches, with the starvation guard kept.
- **R7:** Close the restart replay window: refuse signed requests whose timestamp is older than the process start time (small clock-skew allowance), or persist nonces briefly. This changes authentication behaviour, so it needs your approval.
- **R8:** Keep Qwen warm: a longer `OLLAMA_KEEP_ALIVE` or a warm-up call at start would avoid the 44 s cold start after idle periods. This is an Ollama setting or a deployment step, both out of scope here.
- **R9:** Rate limits and concurrency limits: the model-throughput numbers above do not justify changing the M1-D defaults (router-answered traffic is cheap). Revisit them with real BFF traffic.
- **R10:** For more headroom, a larger CPU (or a GPU) is the lever; memory is not limiting.

## 12. Known limitations

- Single run per phase; small samples for the model percentiles; no repeat to measure run-to-run variance.
- Mock ERP only, in-process; real ERP latency, TLS and the BFF hop are not included.
- The HTTP full-request figures use a loopback server inside the benchmark process.
- The 50-job workload is a mechanism stress test, not a traffic model; production would reject or degrade most of it by design.
- Qwen tool-selection accuracy was not re-measured here.
- Single instance only; all state is lost on restart (section 8); no distributed or persistent rate limiting.
- The metrics route is not exposed by the production entry point (which is disabled in M1) and has no scraper; there is no alerting.
- During the sampler's first phases the model process was not matched; its RSS covers the later phases only (system-wide figures cover everything).
- Sinhala texts and templates remain provisional and need native review; Sinhala production readiness is not claimed.

## 13. Remaining M0 blockers

- B2: a staging ERP (the website host runs a `volta-mock-erp` container).
- B3: tunnel and AllowUsers approval.
- B5: native Sinhala reviewers.
- B6: legal sign-off.
- B9: root password reset. The website server's root password was shared in chat earlier and should be rotated.

## 14. Confirmation

Only mock data, loopback services and the AI server's local Ollama were used. The transient files on the AI server were deleted and no process was left running; Ollama stayed active and unchanged (its last model simply stays resident for its normal 5-minute keep-alive). No setting was changed anywhere. SSH was used only to run the approved transient procedure. The SSH host key of the AI server was accepted on first connection to a scratch known-hosts file (fingerprint `SHA256:DzrhG7pcuMKLz7LVk/g2yka+YUSWmqx1GkEbtUlDsBg`); please confirm it matches the server's real key. No checkout, payment, order creation, discount or server-side cart change exists, message retention and consent stay disabled, `needsNativeReview` is preserved, SinhalaLLM stays off by default, and nothing was committed, pushed or deployed. M1-E ends here; I am waiting for your review.
