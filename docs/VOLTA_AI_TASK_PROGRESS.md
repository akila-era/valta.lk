# VOLTA AI: task progress and resume checkpoint

Last updated: 2026-11-14 (evening, Asia/Colombo). Written for: whoever resumes this work (the owner, or a new Claude session). **Everything below is local development unless it says "production".** Update this file at the end of every phase; it is the single source of truth for what is done, pending and blocked.

## 0. How to resume (read in this order)

1. This file. 2. `docs/VOLTA_AI_GEMINI_CLOUD_ARCHITECTURE_AND_MIGRATION.md` (approved direction, decisions). 3. `docs/VOLTA_AI_COMPLETE_ARCHITECTURE_AUDIT.md`, `docs/VOLTA_AI_LLM_FIRST_MIGRATION_ARCHITECTURE.md`. 4. `docs/VOLTA_PRODUCTION_SECURITY_REMEDIATION_PLAN.md`.
Then **verify before trusting anything**: `cd apps/agent && npx tsc --noEmit && npx vitest run`, and in `E:\valta.lk\.worktrees\ai-widget\apps\web` the same. Compare with the "last verified checkpoint" below. If numbers differ, investigate before building on top.
Background agents (sub-agents) die with the session. If one was running when the session ended, its partial files are on disk but **unreviewed**: check `git status`, run the type-check and tests, scan for stray control characters (see section 6), and resume it only after reading its output.

## 1. Approval matrix (never bypass)

| Action | Status |
|---|---|
| Local development, local tests, docs | **Granted** |
| Commit, push, merge | **Not granted** (nothing has been committed or pushed since `96db7c9`; large uncommitted tree) |
| Any production change: deploy, restart, env var, DNS, tunnel, firewall, SSH config, proxy, model, registry | **Not granted** |
| Production Step B (minimal bundle `e3b40e6f…a21e` + `AGENT_NEW_SESSIONS_PER_HOUR=30`) | **DEPLOYED 2026-11-15 04:09 CET with the owner's explicit approval ("Step B only")**; verified, see section 2b. Step A (cap 200 alone) was not needed (superseded) |
| Full new Agent bundle from the committed tree; website deploy (client-address hardening, UI) | **Not deployed; not approved** (the owner chose "Step B only"); website needs disk pruning approval, branch push and a tunnel recreate |
| Push of the committed branches | **Not pushed; not approved** |
| Prepared ops scripts in `tools/ops/prepared/` (log redaction, port 8090 block, loopback bind, monitoring) | **Pending approval**; every script refuses to run without `I_HAVE_APPROVAL=yes` |
| Real Gemini API calls, keys, billing, paid search/voice | **Not granted.** A key was pasted in chat: treat it as exposed, **never use it**, recommend revocation |
| Sending customer text to any hosted provider | **Not granted** (privacy design, DPA, customer notice, legal review pending) |
| 9B and Gemma 4 E4B model downloads | **Not granted** |
| Contacting the old AI server 2.29.97.114 | **Not granted** (never contacted) |
| New SSH sessions to live servers | Only when the owner asks for a read-only audit; one session per server, never parallel (UFW rate limits port 22 on both) |
| Enabling the LLM-first lane, Gemini, browser controller, voice engines for customers | **Not granted** (all default OFF) |
| Persistent customer history/memory | **Not granted** (privacy design first) |
| Frozen EVAL/HOLDOUT/TEST sets | **Never modify, never tune on** (guard tests exist) |

## 2. Production state (verified by read-only audits on 2026-11-14; **UPDATED 2026-11-15: the AI-server Agent bundle and `AGENT_NEW_SESSIONS_PER_HOUR` below changed: see section 2b, defect F-A is fixed**)

Website server 46.62.143.151: commit `6898dff` live (contract 1.2), tunnel container `volta-ai-tunnel-new`, disk 91% full (3.4 GB free). AI server 109.199.108.76: Agent bundle sha256 `a1d3f8aff347…3e25` (= commit `96db7c9` code), Qwen3-1.7B (`qwen3:1.7b-q4_K_M`), `AGENT_NEW_SESSIONS_PER_HOUR` unset, so **live defect F-A: all guests share one counter of 10 new conversations/hour** (confirmed in the live bundle; not hit in the 12 h journal window). Port 8090 external reachability **unproven**; preview key in nginx logs is harmless now (value empty). No alerting. Old server untouched.

## 2b. Production change record: Step B (2026-11-15, owner-approved)

- **Done on the AI server 109.199.108.76 (one SSH session, host key verified against the pinned fingerprint):** uploaded `agent.min5.mjs` (sha256 `e3b40e6f4aa2cdf68f6387871a31dfd8b6fca136877b28ee5361d0d82dd3a21e`) and `tools/ops/deploy-agent.sh`; backed up the env file to `/etc/volta-agent/agent.env.bak-20261115-040944` (root:voltaagent 640, holds secrets, never printed); appended ONLY `AGENT_NEW_SESSIONS_PER_HOUR=30` (the file already ended with a newline check; 9 -> 10 lines, variable names unchanged apart from the new one); `deploy-agent.sh` backed up the old bundle to `/opt/volta-agent/agent.mjs.bak-20261115-040945` (sha `a1d3f8af…3e25`), installed the new one, restarted `volta-agent` once, health OK (exit 0).
- **Verified after:** live bundle sha256 = the audited value; `volta-agent` and `ollama` active; `/v1/health` 401; running process holds `AGENT_NEW_SESSIONS_PER_HOUR=30`; NRestarts 0; listeners only 127.0.0.1:8787 and :11434; no model loaded; no error lines. From the website server (one session): site 200, both containers up, a guest chat through the website route and the tunnel from two different client addresses returned HTTP 200 ("hi" answered; "laptop for office work" answered honestly that no matching products exist in the 7-product real catalogue), tunnel health 401, 0 error lines in the web container log.
- **Effect:** the live defect F-A is fixed in production: new guest conversations are limited per signed client address (30/hour) with a shop-wide ceiling of 2,000/hour, instead of one shared counter of 10/hour. Real shoppers saw a restart of a few seconds and in-memory conversations were reset.
- **Not changed:** the website (still commit `6898dff`, contract 1.2), nginx, Docker, DNS, tunnel, firewall, Ollama, models, any other environment variable. Leftovers: `/tmp/agent.new.mjs` and `/tmp/deploy-agent.sh` on the AI server (harmless uploads; deletion left to the owner).
- **Rollback (not needed):** `sudo cp -p /opt/volta-agent/agent.mjs.bak-20261115-040945 /opt/volta-agent/agent.mjs && sudo cp -p /etc/volta-agent/agent.env.bak-20261115-040944 /etc/volta-agent/agent.env && sudo systemctl restart volta-agent`.
- **Still true:** the per-address protection is only as strong as the client address: port 8090 external reachability is still unproven (decisive test from another network); IPv6 /64 grouping and the website hardening are NOT deployed (website unchanged); no alerting.
- **Commits (local only, not pushed):** Agent repo `feature/ai-agent-m1`: a77dcbd docs+ops, 7b90407 voice, d1e6bf5 browser, 8864155 core hardening, 860602f R0/M8/catalogue, 3e0d781 Gemini gateway + LLM-first lane (all off). Website worktree `feature/ai-widget`: bdc1efb QA centre, bed898d assistant hardening/contract 1.3/voice routes, b126cee screenshots. `apps/web/tsconfig.json` (auto-generated) left uncommitted.

## 2c. Production change record: full Agent bundle (2026-11-15 04:14 CET, owner-approved: "New full Agent bundle")

- **Built** from the clean committed tree (HEAD `5130105`) with the SAME entry and flags as the live bundle (`tests/real/preview-agent.ts`, esbuild esm node24, `node:module` banner, relative paths): sha256 **`ba09e35cdfc4e97677bb6c9aaad7f896a25ee2ecf1bcd5a5e7ed4a2c9c387adf`**, 1,182,434 bytes, reproducible (two builds, same hash), no browser/Playwright code. The production entry `src/main.ts` was deliberately NOT switched to (never rehearsed on the server).
- **Pre-deploy local A/B** (same 12 shopper messages, mock catalogue, no model): old bundle vs new bundle showed: negation now honoured, corrections acknowledged, password trouble answered helpfully, "set the price filter to 50000" treated as a refinement, bare "phones" searches (old: error 503 locally), repeated "thanks" varied. Website signer compatibility with the new pre-auth header check was checked by reading both (32-hex nonce, same canonical string, content-length set).
- **Deployed** to 109.199.108.76 (host key verified; one upload + one SSH session): pre-checks (live = Step B bundle, services active, health 401, env variable present, bundle parses with the server's node), `deploy-agent.sh` backed up the Step B bundle to **`/opt/volta-agent/agent.mjs.bak-20261115-041403`** (sha `e3b40e6f…`), installed, one restart, health OK, exit 0. **No environment variable changed this time.**
- **Verified after:** live sha = `ba09e35c…`; services active; health 401; process variable `AGENT_NEW_SESSIONS_PER_HOUR=30`; NRestarts 0; listeners 127.0.0.1:8787 and :11434 only; no errors. **Live smoke test through the website route and the tunnel** (one cookie-kept guest conversation, 9 messages): all HTTP 200, ~60 ms for router answers; negation honoured on the REAL catalogue ("Don't recommend Apple" left nothing, as every phone in the shop is Apple), correction acknowledged, password help, varied "thanks", tunnel health 401, site 200, 0 errors in the web container log.
- **Rollback (not needed):** `sudo cp -p /opt/volta-agent/agent.mjs.bak-20261115-041403 /opt/volta-agent/agent.mjs && sudo systemctl restart volta-agent` (back to the Step B bundle); older: `agent.mjs.bak-20261115-040945` (sha `a1d3f8af…`, the pre-Step-B bundle; needs the website to stay at contract 1.2, which it is).
- **Not changed:** the website, nginx, Docker, DNS, tunnel, firewall, Ollama, models, env file. The new lane code in the bundle (Gemini gateway, LLM-first, voice, browser pieces) is OFF: no `GEMINI_*`/`AGENT_LLM_*` variable is set. Known remaining behaviour limits (unchanged): general-knowledge questions still get the generic reply; Sinhala is unreviewed by native speakers; the real catalogue is 7 placeholder-quality products (duplicate "11 pro" cards still appear).
- **Still not deployed:** the website; nothing pushed to GitHub.

## 3. Completed phases (each with the evidence that closed it)

| Phase | Result | Evidence |
|---|---|---|
| Real catalogue relay, conversation + reasoning layers, contract 1.2 | Deployed 2026-11-13/14 | live bundle hash read on the server |
| Phase 5-8 readiness docs, staging design, security review | Documents done | `docs/VOLTA_*` (25 files) |
| Rate-limit F-A fix + minimal bundle | **Built and tested locally; not deployed** | `agent.min5.mjs` e3b40e6f…a21e, diff vs live = the fix only |
| Read-only production audits (server, config, traffic, proxy, network, logging, QA) | Done | scratchpad `audit/`, `audit2/`; `docs/VOLTA_PRODUCTION_SECURITY_REMEDIATION_PLAN.md` |
| Voice (Agent + website routes, audio validation, VO-01..06 fixes) | Local only; Sinhala/Singlish **unevaluated (blocked on native recordings)** | `docs/VOLTA_VOICE_*` |
| Browser (Playwright driver, egress proxy, BR-01..04 fixes, `browser.select`, browse intent, confirm/cancel, contract 1.3) | Local only; **Blocked** for production (fresh independent review, OS isolation, Linux test, approval) | `docs/VOLTA_BROWSER_*`; real-browser suite 63-71 passed |
| Catalogue audit tool | Done, local | `apps/agent/src/catalogue-intel`, 86 tests |
| Wave 2 (architecture hardening, metrics, production entry `src/main.ts`, frontend 1.3 mirror + browser UI behind flag) | Done, local | docs `VOLTA_AI_ARCHITECTURE_ASSESSMENT`, `MONITORING`, `BROWSER_INTEGRATION`, `FRONTEND_INTEGRATION` |
| M8 intelligence fixes | Done, local (tuned-on DEV set only) | `VOLTA_AI_REASONING_BENCHMARK_REPORT_M8.md` |
| Phase 1-2: architecture audit + root causes | Done | `VOLTA_AI_COMPLETE_ARCHITECTURE_AUDIT.md` |
| **R0 local rule fixes** (dead normalisation rule, safety false positives, corrections, negation, instructions, cue collisions, bare category, repetition) | **Done, verified by me** | Agent 1,881 passed / 0 failed, tsc clean, frozen files untouched |
| LLM-first migration architecture (design) | Approved by the owner with conditions | `VOLTA_AI_LLM_FIRST_MIGRATION_ARCHITECTURE.md` |
| Gemini cloud architecture and migration plan | Done; owner decisions pending (section 22 of that doc) | `VOLTA_AI_GEMINI_CLOUD_ARCHITECTURE_AND_MIGRATION.md` |
| Ollama/Qwen/AI-VPS removal plan (stages R0-R7, preconditions P1-P8, order rules; plan only, nothing run) | Done 2026-11-14 | `docs/VOLTA_AI_OLLAMA_VPS_REMOVAL_PLAN.md` |

## 3b. Session checkpoint 2026-11-15 00:15: see `docs/VOLTA_AI_SESSION_RECOVERY.md`

That file holds the exact recovery commands, the modified-file groups, the test snapshot and the running agents. Key points: (1) `apps/agent/src/voice/audio.ts` was found truncated to 0 bytes (cause unknown: one of the two running agents) and was **restored from the compiled bundle and validated** (tsc clean, voice tests pass, bundle diff shows identical logic); `src/voice/` is untracked, so commit it as soon as commits are approved; (2) snapshot while agents were still running: 2,313 passed / 3 failed (a disk-write invariant conflict with the budget FileStore, a load flake, an in-progress budget test) and TypeScript errors in an in-progress gateway test: this is NOT a verified checkpoint; (3) last fully verified green checkpoint is after R0 (1,881 passed, 0 failed).

## 4. In progress at the time of writing (Gemini integration, local only)

| Task | Owner (agent) | State |
|---|---|---|
| Gemini gateway: provider abstraction, REST adapter, resilience, budget controller, config/status, redaction, fake-provider tests; `docs/VOLTA_AI_GATEWAY_REPORT.md` | gateway agent (`src/gateway/**`) | **DONE and verified by the orchestrator 2026-11-15 00:35:** tsc clean, full suite 2,530 passed / 0 failed, gateway+privacy files 248 passed. Mock-only (fake provider); not wired; no real Gemini call ever made; request shapes UNVERIFIED against the live API (see recovery doc 1b) |
| Finish stopped verifier v2 / tool layer / search modules; fix failing calculator test | finisher agent (`src/verify/v2`, `src/tools/llm`, `src/search`) | **DONE and verified 2026-11-15** (agent died on the usage limit after its tests passed; orchestrator re-ran tsc + full suite: 2,727 passed / 0 failed). Reports exist; mock-only |
| LLM-first turn loop, `off/shadow/on` lane switch (default off, fail-closed `on`), in-memory history (default off), system prompt with honorific policy | orchestrator (`src/llm/**`, 3 test files, 57 tests) | **DONE and verified 2026-11-15 08:40.** Mock-only (scripted fake model); not wired into `main.ts`; context hook not connected to legacy session state; no cards from the new lane; needs contract 1.4 before `on` can serve |

## 5. Pending (in order) and blocked

**UPDATE 2026-11-15 (end of the Gemini implementation-preparation phase):** the turn loop, the `off/shadow/on` switch, history, prompt/honorific policy, `main.ts` wiring (default off), inert Gemini speech placeholders and disabled search adapters are DONE and verified locally (Agent 2,736 passed / 0 failed, website 515 passed, tsc clean both); final report `docs/VOLTA_AI_GEMINI_API_INTEGRATION_REPORT.md`. Everything is mock-only (scripted fake model); no real Gemini call has been made. What remains is listed in that report (sections 11, 13, 14): contract 1.4, connecting the lane's context hook to the legacy session state, cards/proposals in the lane output, an independent security review, the owner decisions, and a capped real-API test campaign. **The phase stops here: nothing may be enabled, deployed, committed or paid for without the owner's explicit approval.** The older list below is kept for history; its "turn loop" item is done.

Pending (needs the two tasks above first): **turn loop** (`src/llm/**`: context assembly, function-calling loop, verifier v2 integration, `AGENT_LLM_FIRST=off|shadow|on` default off with the existing pipeline as fallback, honorific policy (Sir/Madam, මහත්මයා/මහත්මිය only when the preference is known; never inferred from a name; at most once per reply), in-memory history of 6 turns (disabled, no persistence), shadow comparison in memory only (no message logging)), Gemini voice/search adapters (disabled), read-only commerce backend routes (categories, policies as JSON with a "not confirmed" flag), website wiring for contract 1.4, independent QA, `docs/VOLTA_AI_GEMINI_API_INTEGRATION_REPORT.md` (incl. Ollama/VPS removal plan), then STOP for the owner's approval.
Blocked on the owner: gateway placement, privacy approval + customer notice + legal review, billing account (owner, currency, prepay), budget numbers, model selection after price/model re-verification, search provider and key, browser host, native Sinhala reviewers, old-server fate, production Step A/B, 8090 outside test, credential rotation (website root, AI-server panel/rescue, temporary SSH keys `…REMOVE-AFTER-MIGRATION` / `…REMOVE-AFTER-USE`, and the pasted Gemini key).
Known failing/unfinished: `tests/unit/tools-llm-calculator.test.ts` (TOO_LONG vs TOO_MANY_TOKENS) is assigned to the finisher agent; the voice-wiring/E2E 1.3 website changes (store-shell flag, chat route sending 1.3, e2e-agent entry) remain undone; remaining items listed in each phase report.

## 6. Last verified checkpoint

- After R0 (verified by the orchestrator, 2026-11-14): Agent `tsc` clean; **1,881 passed, 6 skipped, 0 failed**; website 515 passed (frontend wave); real-browser 63-71 passed (one timing-sensitive test known). Frozen benchmark files unmodified (`git status tests/bench` shows only new m8/r0 dirs).
- After the stopped-agent cleanup: control-character guard fixed in `src/verify/v2/safety.ts`; at that point 2,008 passed, 1 failing (calculator, above). **Re-verify now: agents are running and changing the tree.**
- Never claim completion without re-running: `npx tsc --noEmit`, `npx vitest run`, the frozen-hash tests, and the control-character guard (`tests/unit/r0-normalize-safety.test.ts`).

## 7. Operational lessons (do not repeat these mistakes)

1. **Doubled backslashes collapse in this shell tool**: `\\b` written through bash/python heredocs becomes a backspace (U+0008). Use the Edit/Write tools for regexes, or build backslashes with `chr(92)`; scan for control characters afterwards.
2. **Never run several SSH sessions in parallel**: UFW `LIMIT` on port 22 silently drops connections (timeouts, not bans). One session per server, 70 s apart.
3. Subagents hit the account usage limit; keep waves small, record state here, resume with SendMessage.
4. Benchmarks must never run on the live AI server (it starves shoppers).
5. Docker `up -d` without `--no-build --no-deps web` would start the stopped tunnel/agent compose services and clash on port 18787; `deploy-web.sh` must not be used as written.
6. A rollback must restore the website first, then the Agent (contract versions).
7. Never print, store or reuse a secret from chat; revoke anything pasted.

## 8. Non-destructive operations log

No destructive operation has been executed in this work: no server, container, image, model, backup, log or database was deleted; the old server was never contacted; no production file was edited. The 51 MB partial download `scratchpad/llm/dl/ollama-windows-amd64.zip` is scratch only and may be deleted by the owner at will.

## 2d. Real Gemini API test (2026-11-15)
- Commits 80dfc86 (adapter and schema fixes, shadow wiring in preview entry), 028ddb6 (fixes from the first real test), 431b404 (test report).
- Capped real-API test with invented prompts: 14/14 OK, about LKR 5 for the final run, 1 to 6 s per turn. Details: docs/VOLTA_AI_GEMINI_REAL_TEST_REPORT.md.
- Live shadow trial NOT started. Needs owner answers: billed project, privacy approval, budget numbers, systemd drop-in (StateDirectory) and one restart, deploy of a bundle from 028ddb6 or later.
- The pasted Gemini key is exposed in chat and must be revoked by the owner.
