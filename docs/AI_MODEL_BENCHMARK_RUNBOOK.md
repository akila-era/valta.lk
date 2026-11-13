# Real-model benchmark: runbook and risk report

Written for: the project owner, who will run this on the AI server (I have no access to it).

Status: the script is built, bundled and **tested only against a mock Ollama on a Windows machine**. It has never run against a real Ollama or on the AI server. Nothing has been run on production.

## 1. Decision first: the Qwen3-4B comparison is NOT safe on the live server. Stop.

You asked me to stop and report if running the benchmark could affect the live service. For **Qwen3-1.7B** (already loaded) the risk is small and controlled (section 3). For **Qwen3-4B** it is not acceptable:

| Risk | Why |
|---|---|
| It would **evict the live model** | Ollama holds one model at a time (`MAX_LOADED_MODELS=1`). Loading the 4B unloads the 1.7B. Every shopper request afterwards pays a cold start (about 40 s measured earlier) until the 1.7B is loaded again |
| **Out-of-memory risk** | The 4B left only about **525 MB** free on the 4 GB host in the earlier test (measured then). The Agent, sshd, Ollama and the kernel share that. This is exactly the situation the OOM protection exists for |
| It cannot be paced around live traffic | A cold load and slower generation (about 3.9 tokens/s measured earlier) hold the single inference slot for minutes |

The script **refuses by itself**: if any other model is loaded it exits with `REFUSED (nothing was changed)` before sending anything. I tested that. Options for the 4B comparison, none of which I will do without your approval:
1. **Accuracy only, on your own computer.** Tool-choice quality does not depend on CPU. Install Ollama locally, make sure both models are already there, and run the same script with `--allow-cold-load`. Speed and memory from a PC do **not** represent the 2 vCPU server and must not be quoted for it.
2. A maintenance window on the AI server with the Agent stopped (a production change that needs your explicit approval).
3. A second machine (a purchase, not approved).

The script never downloads a model. If the 4B is not installed on the machine, it refuses.

## 2. What the script does and does not do

Does: read `/api/tags` (verifies the **exact installed tag**, records its digest, size, family, parameter size and quantisation), read `/api/ps`, read `/proc` (memory, load average, CPU, swap, OOM counter, Ollama process memory), send chat requests to `127.0.0.1:11434` only.

Never: pulls, deletes, copies or switches a model; changes any Ollama or system setting; opens a port; touches the Agent; writes anywhere except the report file you name; sends data anywhere except loopback.

Built-in protections (all covered by tests against a fake Ollama):

| Protection | Behaviour |
|---|---|
| No eviction | Refuses if another model is loaded |
| No accidental cold load | Refuses if nothing is loaded (unless `--allow-cold-load`, for a machine with no live traffic) |
| Memory floor | Before each request, stops cleanly if free memory is below `--min-free-mb` (default 400); keeps what it measured |
| Load ceiling | Stops if the 1-minute load average exceeds `--max-load` (default 3, on 2 CPUs) |
| Time cap | `--max-seconds` |
| Pacing | `--pause-ms` between requests (default 3000) so the live Agent is served in the gaps |
| Same request shape as the live Agent | `num_ctx` 2048, no `keep_alive`, no extra options, so Ollama does not reload the model |
| Loopback only | Refuses any other address |

What it measures: tool choice per language group (Sinhala script, Singlish, English, mixed), false tool calls (a shopping tool for a message that needed none), latency (first call, warm median and 95th percentile, per group median), generation tokens per second (from Ollama), prompt and generated token counts, host free memory (minimum), the model's resident size, Ollama processes' memory, swap, CPU busy percentage per request, load average and OOM kills during the run. Every number in the report is `basis: measured` on the machine that ran it.

Limits of the score (stated so it is not over-read): it checks only **which tool the model picks first** (not its arguments), using a simplified prompt that is not the production planner prompt, on engineer-written test messages. It is a fair way to compare models against each other, not a prediction of shopper experience. CPU is **host-wide** during each request, so the live Agent's work is included; it is not the benchmark's CPU alone.

## 3. Exact steps for Qwen3-1.7B on the AI server

Do this at a quiet time (the preview is private), and tell anyone using it. You need only a normal user login; **no root and no change to any service are required.** Use the Node already on the server (earlier benchmark sessions used `/opt/node/current/bin/node`).

**Step 0. Get the file and check it.** The bundle is `docs/m3a-raw/bundle/m3a-model-bench.mjs` in the repository (880 KB). Its SHA-256 when I built it:
`7485bbd03e11a1c53ed33910644afa4c819f1e3a7b649c5fc3ac0e496f8ec505`. Copy it to the server (`scp docs/m3a-raw/bundle/m3a-model-bench.mjs <you>@2.29.97.114:/tmp/`), then on the server `sha256sum /tmp/m3a-model-bench.mjs` and compare. If it differs, do not run it.

**Step 1. Look before touching (read-only).**
```
ollama list                       # the exact tag to use; expected: qwen3:1.7b-q4_K_M
curl -s 127.0.0.1:11434/api/ps    # which model is loaded now (it should be the 1.7B)
free -m ; uptime ; nproc
```
If `/api/ps` shows no model, or a different model, stop here (see section 1).

**Step 2. Dry run (sends nothing to the model).**
```
/opt/node/current/bin/node /tmp/m3a-model-bench.mjs --model qwen3:1.7b-q4_K_M --dry-run --set holdout
```
Check the line starting `MODEL`: the digest, `1.7B`, the quantisation and `loaded before: qwen3:1.7b-q4_K_M`.

**Step 3. Short run (12 messages, spread over all four groups).** In a second terminal keep `watch -n 5 'free -m; uptime'` open and press Ctrl+C on the benchmark if anything looks wrong (it holds no state, so stopping is safe).
```
/opt/node/current/bin/node /tmp/m3a-model-bench.mjs --model qwen3:1.7b-q4_K_M --set holdout --limit 12 --pause-ms 3000 --max-seconds 600 --out /tmp/bench-short.json
```

**Step 4. Full runs.** HOLDOUT is the independent-ish set (70 messages); TEST (124) is optional and takes about twice as long. My estimate, not a measurement: about 8 s per request at 5 tokens per second plus the 3 s pause, so roughly 13 minutes for HOLDOUT.
```
/opt/node/current/bin/node /tmp/m3a-model-bench.mjs --model qwen3:1.7b-q4_K_M --set holdout --pause-ms 3000 --max-seconds 1800 --out /tmp/bench-holdout.json
/opt/node/current/bin/node /tmp/m3a-model-bench.mjs --model qwen3:1.7b-q4_K_M --set test --pause-ms 3000 --max-seconds 3000 --out /tmp/bench-test.json
```

**Step 5. Collect and clean up.** Copy `/tmp/bench-*.json` back to the repository (`docs/m3a-raw/real/`), then on the server delete the script and reports from `/tmp`. Send me the JSON and I will write the evidence report.

**What it changes on the server:** nothing persistent. The only side effects are CPU use and that each request keeps the 1.7B loaded a little longer (Ollama's idle timer restarts), which is what live traffic does anyway.

**It stops by itself** (and still writes the partial report) if free memory drops below 400 MB, the load average passes 3, or the time cap is reached. A line `STOPPED EARLY` tells you which.

## 4. How to read the result

Compare the Qwen3-1.7B report with the router-only numbers (`docs/AI_M3B_REPORT.md`) on the same HOLDOUT set. Expect the model to be weaker than the router on Sinhala and Singlish (it has never been evaluated on them; the M1 English evaluation was 65/100 for Qwen alone against 81/100 for the router alone). That is a measurement the project does not have yet. Do not present these results as Sinhala quality: native review is still required.

## 5. Measured versus estimated

| Item | Status today |
|---|---|
| Qwen3-1.7B speed (about 5.1 tokens/s), warm planner median (about 8.6 s), cold start (about 40 s) | Measured in earlier sessions on the AI server (M1-E); will be re-measured by this script |
| Qwen3-4B speed (about 3.9 tokens/s) and headroom (about 525 MB) | Measured once in an earlier session; **not** to be repeated on the live server |
| Qwen3-1.7B resident memory (about 1.4 GB in the model registry) | **Estimate**; the script measures it |
| Run time (about 13 minutes for HOLDOUT) | **Estimate** |
| Tool-choice accuracy per language group for either model on the new sets | **Not measured yet** |

## 6. Expected output (format only: the numbers below are placeholders, not results)

The command for the full server run is in section 3, Step 4. Each run prints this and, with `--out`, writes the same data plus every per-message row to the JSON file:

```
MODEL qwen3:1.7b-q4_K_M  digest sha256:<64 hex>  1.7B Q4_K_M  installed size <MB> MB  loaded before: qwen3:1.7b-q4_K_M
LICENCE permissive   registry status live   set "holdout" (70 messages)
si        tool choice <ok>/<n> (<pct>%)  false tool calls <n>  median <ms> ms
singlish  tool choice <ok>/<n> (<pct>%)  false tool calls <n>  median <ms> ms
en        tool choice <ok>/<n> (<pct>%)  false tool calls <n>  median <ms> ms
mixed     tool choice <ok>/<n> (<pct>%)  false tool calls <n>  median <ms> ms
overall   <pct>%  false tool calls <n>   completed 70/70  errors 0
latency   first <ms> ms   warm p50 <ms> ms   p95 <ms> ms   generation <n> tokens/s (median)
resources free MB before <n>, minimum <n>; model resident <n> MB; ollama processes max <n> MB; swap max <n> MB; CPU busy median <n>% max <n>%; load1 max <n>; OOM kills 0
```
What a healthy run looks like: `completed 70/70`, `errors 0`, no `STOPPED EARLY`, `OOM kills 0`, free memory minimum comfortably above the 400 MB floor. What means stop and tell me: `STOPPED EARLY: low_memory` or `high_load`, any OOM kill, a rising swap figure, the live preview answering slowly, or a line starting `REFUSED` (that is the safety check working: nothing was changed).

The dry run prints only the first two lines and `DRY RUN: nothing was sent to the model`.

## 7. Qwen3-4B on your PC: accuracy only (approved)

Purpose: compare tool-choice **accuracy** between Qwen3-1.7B and Qwen3-4B-Instruct-2507 on the same messages. Accuracy does not depend on the computer, so it is comparable; **speed, tokens per second, memory and CPU from a PC are not representative of the 2 vCPU server and must never be quoted for it.** Keep the two kinds of result in separate folders: `docs/m3a-raw/real/server/` for the AI server and `docs/m3a-raw/real/pc/` for the PC, and report them in separate tables.

Conditions: both models must **already be installed** (nothing is downloaded, nothing is bought). The tag must be exactly one the registry knows: `qwen3:1.7b-q4_K_M` and `qwen3:4b-instruct-2507`. If your PC's tag is different (for example `qwen3:1.7b`), tell me: I will compare the digest and licence before adding it; do not rename models yourself.

On your PC (Windows, Node 20 or newer, the same bundle and the same SHA-256 check as Step 0):
```
ollama list
ollama stop <any model currently loaded>        # the script refuses to evict a loaded model; stopping one on YOUR PC is fine
node m3a-model-bench.mjs --model qwen3:1.7b-q4_K_M --set holdout --allow-cold-load --pause-ms 0 --out bench-pc-qwen3-1.7b-holdout.json
ollama stop qwen3:1.7b-q4_K_M
node m3a-model-bench.mjs --model qwen3:4b-instruct-2507 --set holdout --allow-cold-load --pause-ms 0 --out bench-pc-qwen3-4b-holdout.json
```
Optionally repeat with `--set test`. On Windows the script cannot read `/proc`, so the memory, CPU and load fields print `null`: that is expected and fine. Send me both JSON files. I will report accuracy per language group for each model, false tool calls, and the difference between them, with the small sample size and the author-written, not-native-reviewed status of the messages stated, and I will say clearly that PC timings are not used.

## 8. Rules for these runs

TEST and HOLDOUT are frozen (hashes in `apps/agent/tests/bench/m3b/frozen-hashes.json`). Running a model on them is evaluation only; **no router rule or prompt may be tuned on them**. Future tuning uses DEV, and a newly written independent holdout, after native review.
