# AI server migration and advanced AI upgrade: plan

Status: plan, nothing executed. Gates are marked **[APPROVAL]** where your explicit yes is required. Facts are labelled verified, recorded earlier, or estimate. The old server stays untouched and serving until cutover and for at least 14 days after.

Written for: the project owner and the engineers executing the migration.

## 1. Principles

1. Old server read-only, unchanged, live until the new one passes every check and you approve cutover.
2. SSH keys only; no password from chat is ever used. Password login on the new server is disabled only after key login is verified from a second session.
3. Nothing is public that does not need to be: Ollama and the Agent listen on loopback; the only inbound ports are SSH (restricted) and, if chosen, a private tunnel.
4. Each heavy capability (model, browser, speech, vision, RAG) is **measured on this hardware before it is enabled**, and never all at once without measured capacity.
5. Nothing is called Working without real evidence (see `AI_QA_CONTROL_CENTER_PLAN.md`).

## 2. Hardware budget (estimates until measured)

12 GB RAM is not 12 GB for the model. Planning budget:

| Reserved for | Estimate |
|---|---|
| OS, systemd, SSH, monitoring, page cache floor | 1.5 GB |
| Agent (Node) and queue | 0.4 GB |
| RAG: embedding model plus index | 0.8 to 1.5 GB |
| Browser worker: Chromium, 2 contexts | 1.5 to 2.5 GB |
| Speech (small Whisper-class STT plus TTS) | 1.0 to 2.0 GB when loaded |
| Safety headroom (never planned away) | 1.5 GB |
| **Left for the language model** (everything above running) | **about 3.5 to 5 GB** |

So with everything on, the realistic ceiling is a 4B model at 4-bit (about 2.5 to 3.3 GB resident). A 7B to 8B model at 4-bit (about 4.5 to 5.5 GB) fits only if the browser or speech services are not loaded at the same time, or if they run as on-demand workers. This is why the plan measures instead of assumes. 6 vCPU improves tokens per second and concurrency, but CPU inference stays slow for larger models (estimate: roughly 2 to 6 tokens per second for 7B, 6 to 10 for 4B; to be measured).

## 3. Phases and gates

| Phase | Work | Output | Gate |
|---|---|---|---|
| 1 Discovery (partly done) | Repository read; old and new server inventory read-only with `tools/ops/server-inventory.sh` | `AI_MIGRATION_DISCOVERY.md` | Needs key access |
| 2 Backup | Copy and encrypt what exists: the Agent bundle and its checksum, the systemd unit, the sshd drop-in, variable **names** with secure references, the exact model tags and digests (blobs are re-pullable; copy them only if you want an offline fallback). No private keys, no secrets in the archive. `age`-encrypted, `sha256sum` recorded, restored into a scratch directory and compared before moving on | Backup report | Old server read-only |
| 3 Hardening (new server) | Updates; non-root admin user; key login verified from a second session; then password and root login off; UFW (deny incoming, allow SSH from your addresses); Fail2ban; unattended security upgrades; time sync; Docker only if needed; disk, RAM and CPU alerts; encrypted backup target | Hardening report | Second-session check before disabling passwords |
| 4 Model evaluation | Protocol in section 4 | `AI_MODEL_SELECTION_REPORT.md` with measurements | **[APPROVAL]** before any model is downloaded |
| 5 Runtime | Install the Agent (same bundle, same HMAC and rate limits), Ollama bound to loopback with the same hardened settings, a systemd unit with memory limits so one runaway workload cannot starve the host; streaming enabled; a request queue per workload class | Private preview environment | No traffic switch |
| 6 RAG | Index the site's own pages (policies, FAQs, help) from approved URLs; hybrid retrieval (keyword plus embeddings); every answer cites its source page; **prices, stock and customer data always from the live APIs, never from the index**; index freshness stamp | RAG report | Embedding model licence checked first |
| 7 Real browser | A Playwright Chromium `BrowserDriver` behind the existing typed tools; exact host `valta.hexalyte.com`; request interception and redirect validation; own DNS resolution with private ranges refused; **host-level egress allowlist** (the browser's OS user may reach only that host:443 and DNS); anonymous contexts; screenshots as handles; cleanup on every exit | Real Chromium test results on local fixtures first | Egress rules are a firewall change on the new server: **[APPROVAL]** |
| 8 Voice | Evaluate open STT and TTS for Sinhala, English and mixed with **native Sinhala audio samples**; licences read first | Voice report | Native samples needed; no Sinhala claim otherwise |
| 9 Vision and documents | A vision-language model evaluated separately (the text model is not a vision model); safe document extraction with size and type limits, scanning and temporary storage | Report | Licence checked; memory measured |
| 10 Load tests | Section 5 | Capacity numbers and limits | Run one heavy workload class at a time |
| 11 Validation | Section 7 | Checklist | All green |
| 12 Cutover | Section 8 | Switch plus monitoring | **[APPROVAL]** separate and explicit |

## 4. Model evaluation protocol (phase 4)

Candidates (only commercially permitted; licence text read from the model card first; nothing downloaded until you approve the list and the size):

| Candidate | Licence status | Fit on 12 GB |
|---|---|---|
| Qwen3-1.7B (live) | Apache-2.0, verified | Baseline |
| Qwen3-4B-Instruct-2507 | Apache-2.0, verified | Fits comfortably |
| Qwen3-8B or a 7B to 8B at 4-bit (for example Qwen-family or Mistral-family) | **Not verified**: read the exact card; some "7B" families carry restrictive community licences | Tight with other services; measure |
| GPT-OSS 20B | Apache-2.0, verified | Needs about 16 GB: **does not fit** with other services |
| Gemma, Llama and similar | Custom terms; commercial hosted-service review needed; Sinhala unverified | Deferred |

For each approved candidate, measured on the new server under the same settings the Agent uses (2,048-token context for the router fallback, plus a long-context check): exact installed tag and digest; resident RAM; CPU use; tokens per second; time to first token; Sinhala, Singlish, English and mixed quality on the M3-B sets (**HOLDOUT is evaluation only, never for tuning**) and later on the native-reviewed independent set; general reasoning and coding spot tests; tool-planning accuracy with the benchmark kit; long-context behaviour. The recommendation uses measured quality, memory and latency together; parameter count alone decides nothing. The production model is **never switched automatically**.

## 5. Load and recovery tests (phase 10)

Single-user chat; N concurrent chats with queueing; Sinhala requests; long conversations; product search; RAG retrieval; browser sessions; voice; model switching cost; memory pressure (watch swap, OOM counter); CPU saturation; service recovery (kill the Agent and Ollama and confirm automatic restart). One workload class at a time, then the realistic mix at the measured limit. Output: the capacity numbers, the queue and concurrency limits set in code and systemd, and the alerts.

## 6. Private connection between the website and the AI service

Keep the existing design (SSH tunnel, forward-only user, pinned host key, one forwarded port) pointed at the new host: it is already reviewed and tested. A WireGuard link is the stronger alternative but is a larger change on the shared website server and **needs approval**. In both cases: no public port for the Agent or Ollama; admin SSH restricted.

## 7. Validation before any switch (phase 11)

Model health; Agent health; website connectivity through a **second, separate** tunnel to the new server (a test tunnel, so the live one is untouched); authenticated private connection; browser isolation tests; voice if integrated; RAG answers with citations; Sinhala and Singlish checks; rate limits; session isolation; backup restoration; monitoring and alerts. A private preview (for example a second web container or a preview cookie on the new path) is used first.

## 8. Cutover (phase 12): only with your separate approval

1. Maintenance window if wanted (the AI is briefly unavailable).
2. Fresh verified backups; old server left running.
3. Change the website's tunnel target to the new host (host, pinned key, tunnel key) and recreate `ai-tunnel` only.
4. Health checks, then controlled smoke tests (English, Singlish, Sinhala, product search, refusal of external sites, live-information decline).
5. Watch logs, CPU and RAM.
6. Rollback is one change in the opposite direction (see `AI_MIGRATION_ROLLBACK.md`).
7. The old server is retired **no earlier than 14 days** after cutover and only on your explicit instruction. It is never destroyed immediately.

## 9. What is blocked now

SSH key access to both servers (so no inventory, backup or hardening can start), and approvals for: the model download list, the egress firewall rules, the WireGuard option, and the cutover. Everything that needs no server (this plan, the inventory script, the rollback plan, the QA centre) is done.
