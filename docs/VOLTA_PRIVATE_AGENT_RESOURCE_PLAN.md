# Private staging Agent: resource plan

Date: 2026-11-14. Author: Agent D (Infrastructure and Security). Written for: the project owner first, then operators.

> **EXECUTION IS BLOCKED pending explicit owner approval.** This is a plan. No server was contacted, no script was run, nothing was measured for this document. Every figure is labelled **measured** (from earlier runs recorded in the repository), **estimate**, or **unknown**.

## 1. In plain words

The AI server has about 12 GB of memory and 6 processor cores. The live Agent and one language model already use part of it. A second Agent copy is tiny by comparison (about 0.1 to 0.15 GB, estimate). What is expensive is the **language model** and the **processor time** to run it, and those are shared with live shoppers. So the plan is: start the staging Agent only on the same small model the live Agent uses, test with a handful of messages, one at a time, and stop immediately if memory or speed gets worse. Heavy jobs (benchmarks, browser worker, voice, indexing) must not run during the test.

## 2. Server facts

| Item | Value | Source |
|---|---|---|
| OS | Ubuntu 24.04 | recorded |
| CPU | 6 vCPU AMD EPYC, avx2, no avx512 | recorded |
| RAM | 11.96 GB total | recorded |
| Swap | 4 GB, swappiness 10 | recorded |
| Disk | 200 GB, about 168 GB free | recorded |
| Ollama | 0.40.16, 127.0.0.1:11434, `OLLAMA_MAX_LOADED_MODELS=1`, `NUM_PARALLEL=1`, `KEEP_ALIVE=5m`, cloud off | recorded |
| Live Agent | `volta-agent`, `MemoryMax=600M`, 127.0.0.1:8787 | recorded |
| Idle host RAM (no model loaded) | about 0.6 GB (0.61 to 0.65 GB in the three-model check) | **measured** |
| One Agent process | about 100 to 150 MB | **estimate** |
| Systemd version, journal size limit, current load | not in the repository | **unknown**: read in the pre-check |

Installed models and recorded loading cost (`docs/migration-raw/three-model-basic-check.txt`):

| Model | File size | Host RAM above idle when loaded | Generation, one short reply | Cold load |
|---|---|---|---|---|
| `qwen3:1.7b-q4_K_M` (production default) | 1.4 GB | about 1.6 to 2.0 GB (**estimate**: not in the three-model check) | not in that file | 17 to 34 s range recorded for the larger models; this one **unknown** |
| `qwen3:4b-instruct-2507` | 2.5 GB | about 3 to 3.5 GB (**estimate**, by analogy with the next row) | **unknown** | **unknown** |
| `qwen3.5:4b-q4_K_M` | not recorded | about 3.5 GB (**measured**: 652 to 4160 MB) | 4.4 tokens/s | within 17 to 34 s |
| `gemma4:e4b-it-q4_K_M` | not recorded | about 6.6 GB (**measured**: 635 to 7256 MB) | 2.0 tokens/s | within 17 to 34 s |
| `qwen3.5:9b-q4_K_M` | not recorded | about 6.6 GB (**measured**: 632 to 7252 MB) | 2.8 tokens/s | within 17 to 34 s |

Under load (recorded): a 4B benchmark showed median model calls near 32 s and CPU near 99 percent. A 9B benchmark made the live Agent answer `503 ASSISTANT_BUSY`. Therefore benchmarks never run while live traffic is served.

## 3. Memory budget (never assumes two models are loaded)

Ollama is set to keep **one** model loaded. A second model request makes Ollama unload the first and load the second (a cold load of tens of seconds during which live replies wait). The budget therefore always has **exactly one** model resident.

### Recommended scenario A: staging on the same model as live (1.7B)

| Line | GB | Basis |
|---|---|---|
| OS, SSH, firewall, Fail2ban, Ollama idle, live Agent, page cache floor | 0.65 | measured idle host (about 0.6 GB) |
| One model resident (1.7B Q4_K_M) | 1.6 to 2.0 | estimate |
| Staging Agent | 0.10 to 0.15 (hard cap 0.40) | estimate; cap is `MemoryMax` |
| **Expected used** | **about 2.4 to 2.8** | sum |
| Safety reserve (kept free) | at least 1.5 | migration plan principle |
| **Free beyond the reserve** | **about 7.5** | 11.96 minus used minus reserve |

The test fits with a very large margin.

### Scenario B: staging pointed at a different model (not recommended)

If `AGENT_QWEN_MODEL` on staging differs from live, Ollama swaps models for every alternate request, so live shoppers pay repeated cold loads. Memory still fits (one model at a time: 0.65 + 0.15 + about 3.5 for a 4B = about 4.3 GB), but latency for **live** users suffers. Not approved by this plan; it needs a quiet window and the owner's explicit decision. Note: in `apps/agent/src/ollama/models.ts` only the 1.7B and the `qwen3:4b-instruct-2507` tags are accepted by the Agent for `AGENT_QWEN_MODEL`.

### Scenario C: 9B or Gemma (forbidden during any live period)

Measured 0.63 + 6.6 = about 7.3 GB used, plus staging 0.15 = about 7.4 GB, leaving about 4.5 GB, which exceeds the reserve in RAM terms but at 2 to 3 tokens/s and CPU saturation it caused `503` on the live Agent. Only allowed on a server that serves no live shopper, which this one does.

### Per-component limits as configured or proposed

| Component | Limit | Note |
|---|---|---|
| Live Agent | `MemoryMax=600M` | recorded, untouched |
| Staging Agent | `MemoryMax=400M`; proposed `MemoryHigh=300M`, `MemorySwapMax=0`, `OOMScoreAdjust=500`, `NODE_OPTIONS=--max-old-space-size=256` | script as written has only `MemoryMax`; the rest are recommendations (estimates to tune) |
| CPU | script: `Nice=10`, `CPUQuota=100%` (one of six vCPUs); proposed `CPUWeight=20` | bounds the Agent only, not Ollama |
| Staging queue | proposed `AGENT_QUEUE_MAX_DEPTH=2`, `AGENT_MAX_IN_FLIGHT=4` | script as written leaves the defaults 6 and 16 |

## 4. What must NOT run at the same time

| Workload | Why | Rule |
|---|---|---|
| Model benchmarks (any model) | Saturate CPU (99 percent recorded), made live answer 503 | Never while live traffic is served; never during the staging test |
| Loading any other model, `ollama pull`, `ollama run` of a different tag | One-model Ollama will unload the live model; pulls use disk, CPU, network | Not during the test |
| Browser worker (Chromium, 1.5 to 2.5 GB estimate in the migration plan) | Memory and CPU | Not installed or started during the test |
| Voice (speech to text, text to speech; 1.0 to 2.0 GB estimate) | Memory and CPU | Not during the test |
| RAG indexing and embedding model (0.8 to 1.5 GB estimate) | Memory, CPU, a second model for Ollama | Not during the test |
| Package upgrades, large copies, unattended upgrades window | CPU, disk, possible service restart | Avoid; check `systemctl list-timers` in the pre-check (timer times: unknown) |
| A second staging instance | Port and memory | Refused by the script's port guard (corrected version: also by the lack of a second port) |
| Concurrent staging requests | Queue competes with live in Ollama | One request at a time (the runbook sends them sequentially) |

## 5. Stop thresholds during the test (recommendations)

| Signal | How to read it | Stop if |
|---|---|---|
| Available memory | `awk '/MemAvailable/{print int($2/1024)" MB"}' /proc/meminfo` | below 3000 MB (estimate; idle with the 1.7B model should be near 9000 MB) |
| Swap in use | `free -m` swap row | more than 500 MB above the pre-check value |
| Staging memory | `systemctl show volta-agent-staging -p MemoryCurrent` | above 350 MB (cap 400) |
| Restarts | `systemctl show volta-agent-staging -p NRestarts` | greater than 0 |
| Live Agent | `systemctl is-active volta-agent`, journal for 5xx | not `active`, or any new 503/timeout lines for live requests |
| Processor | `uptime` load average, `top -bn1 \| head -15` | one-minute load above 5 (estimate; 6 vCPU) for more than 2 minutes |
| Request time | measured by the runbook helper | a staging reply above 40 s (live deadline is 45 s) |
| Disk | `df -h /` | free below 20 GB (168 GB free recorded) |

## 6. Unknowns to read first (read-only, in the pre-check)

systemd version; journal size and retention; whether the 1.7B model is currently loaded and the current `ollama ps` size; current load average and swap use; unattended-upgrade and cron schedule; whether the website relay supports a second catalogue key id; the exact name and path of the live Agent's current bundle hash (to compare with the staging hash and prove it differs).
