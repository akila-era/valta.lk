# Staging performance report

Date: 2026-11-14. Written for: the project owner. **Three different kinds of measurement appear here and must not be mixed: (A) the Agent's own code on a developer PC (no model), (B) the live path as seen through the website, (C) model runs on the AI server on 2026-11-13.** No server-side load or concurrency test was run (blocked: it must not run while live traffic is served, and it would need the private staging Agent).

## A. Agent code path on a developer PC (no model; executed today)

300 messages in sequence and 500 more from 20 concurrent conversations, through the full pipeline (router, reasoning, tools on the fixture catalogue, verifier), ten message kinds in rotation (English, Singlish, Sinhala, search, compare, general, greeting).

| | Median | 95th percentile | 99th percentile |
|---|---|---|---|
| Sequential (one at a time) | 3.0 ms | 6.1 ms | 13.4 ms |
| 20 conversations at once (event-loop contention) | 61 ms | 90 ms | 101 ms |

Process memory at the end: about 46 MB of heap, 149 MB resident. This says the **router, reasoning and verification are cheap**; it says nothing about the server's hardware, the model, or the real catalogue's size.

## B. The live path (website to tunnel to the AI server), read-only observations

- Replies produced without the model came back in about 60 to 150 ms through the website API (examples from the smoke tests of 2026-11-13/14); the first request after an Agent restart took 1 to 2.6 s.
- Live Agent log, last 24 hours (counts only, includes test traffic): 64 chat answers with status 200, 3 with 504 (timeouts, during the benchmark window), 0 rate-limit responses. Host at the time: load 0.04, 11.3 GB RAM available.
- During the 9B benchmark (which shared the one inference slot) a model-path message waited 45 s and was answered "assistant busy" (503): **proof that benchmarks and live traffic must not share the host.**

## C. Model measurements on the AI server (6 vCPU, 12 GB, CPU only) from 2026-11-13

| Model (all Apache-2.0, experimental) | Host RAM above idle | Generation speed (one short reply) | Cold load |
|---|---|---|---|
| Qwen3.5-4B q4_K_M | about 3.5 GB | 4.4 tokens/s (6.8 median in the benchmark) | 17 s |
| Gemma 4 E4B q4_K_M | about 6.6 GB | 2.0 tokens/s (3.1 in the benchmark) | 34 s |
| Qwen3.5-9B q4_K_M | about 6.6 GB | 2.8 tokens/s | 31 s |
| Qwen3-1.7B (production default) | about 1.4 GB model | about 5 tokens/s (earlier, smaller server) | seconds |

Tool-choice benchmark (HOLDOUT, 70 messages, a simplified harness): Qwen3.5-4B completed 70/70 with **54.3%** (Sinhala 46.7, Singlish 52.9, English 61.9, mixed 52.9), no errors, **median 32 s per call** (95th percentile 64 s), CPU about 99.6%, load up to 6.2; Gemma 4 E4B **stopped early after 3 of 70** (the safety limit on load); Qwen3.5-9B was **stopped by me and is incomplete** to protect live traffic. These are **not** comparable with the earlier 1.7B or 4B-instruct results (different set and harness), and a 32-second call is unusable for a chat.

## What is not measured

First-token latency (streaming) on the server; peak RAM with the browser worker, speech and retrieval together; concurrent requests and queueing on the server; timeout and error rates under load; the real catalogue's size effect (7 products today; the candidate ranking looks at up to 30 matches per search); disk. Documented limits: one inference at a time (queue depth 6, deadline 45 s), one model loaded at a time, a 12 GB host in which 9B and Gemma leave little for anything else.

## Implication

Keep the model for the cheap, deterministic router and small chat replies; the 4B-class models are too slow on this CPU for interactive use in their current setup, and the 9B and Gemma do not fit alongside other services. Any model selection needs the staging window and a quality test beyond tool choice (see `VOLTA_AI_MODEL_SELECTION_REPORT.md`).
