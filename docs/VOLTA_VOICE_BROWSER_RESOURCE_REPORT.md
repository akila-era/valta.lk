# Voice and browser resource report

Date: 2026-11-14. Written for: the project owner. **All numbers were measured on the developer's Windows desktop (15.7 GB RAM, 8 logical CPUs), not on the AI server.** They are upper-bound-ish indications of order of magnitude, not a capacity plan. No measurement was taken on the live server, and none may be taken there while it serves shoppers.

## 1. Measured here

| Workload | Measurement | Source |
|---|---|---|
| Headless Chromium through the egress proxy, 1 session | 168–188 MB (working set of the process tree) | browser fork, `VOLTA_BROWSER_E2E_REPORT.md` |
| 2 sessions | 268 MB | same |
| 3 sessions | 346 MB | same |
| After all sessions closed | 112 MB, 3 processes remain until shutdown; 0 after shutdown | same |
| Open/close cycles | 6 cycles, no process growth | same |
| faster-whisper `tiny` (English, CPU) | peak 262 MB, median decode 1.1 s per short clip, WER 0% on 10 synthetic clips | `VOLTA_SINHALA_AUDIO_EVALUATION.md` |
| `base` | 399 MB, 2.5 s, 1.3% | same |
| `small` | 811 MB, 7.1 s, 0% | same (peak memory is cumulative across the three runs in one process) |

Caveats that matter: Windows counts shared pages in a working set (Linux will usually show less); timings were taken on a busy desktop; the speech clips were synthetic English and short; the browser ran fixture pages, not the real shop's JavaScript-heavy pages.

## 2. What is on the AI server today (from earlier measured work)

12 GB RAM, 6 vCPU, no GPU, one live model slot. Qwen3-1.7B (production) leaves several GB free; Qwen3.5-4B needs about 3.5 GB and ran at 4.4 to 6.8 tokens/s with a 32 s median call on the tool-choice test; the 9B did not fit alongside live traffic without starving it. The Agent unit is capped at 600 MB. The website server is separate and has 3 to 5 GB of disk free.

## 3. Reasoning, not measurement

Putting Chromium (0.2 to 0.5 GB plus the browser binaries, about 150 MB of disk), a speech engine (0.3 to 0.9 GB for tiny to small), and a 4B model (3.5 GB) on the same 6 CPUs would compete for the same cores: speech decoding and page rendering are CPU-heavy exactly when the model is generating. RAM may fit; **latency for live shoppers is the problem, and it was not measured.** The safe statement is: the production Qwen3-1.7B path plus one browser session or one `tiny`/`base` speech decode at a time is plausible; anything with the 4B/9B models plus voice plus browser is not supported by evidence.

## 4. Controls implemented in code (tested locally)

Browser: hard cap on concurrent contexts, per-session timeout and step budget, bounded text and screenshot store. Voice: one audio worker with a bounded queue (503 with `Retry-After`), body cap enforced while streaming, 5 MB and 30 s limits, audio zeroed after use. Neither runs by default: the driver is disabled unless explicitly enabled, and the voice routes do not exist without a configured engine.

## 5. What would be needed (documented, not forced onto the existing server)

- A separate browser/speech worker host (or at least a separate unprivileged user with CPU and memory limits and no route to private networks) for any real use. The proposal for the browser user, firewall rules and systemd limits is in `VOLTA_BROWSER_SECURITY_REPORT.md`, **not executed**.
- A measured load test on that host: concurrent shoppers x (chat + speech + browser), recording peak RAM, CPU, p95 latency; none exists.
- Chromium installation on Linux (an approved package install) and a check that its sandbox works on Ubuntu 24.04 (unverified).
- Speech engine installation and, for Sinhala, an engine and voice that pass native review (none identified).

## 6. Not measured

Peak RAM of Chromium on Linux; speech on the server CPU; browser plus speech plus model together; concurrent requests across all three; model load/unload times for the experimental models with these workloads; any Sinhala speech.
