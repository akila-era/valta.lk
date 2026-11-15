# VOLTA AI: session recovery checkpoint

Checkpoint taken: 2026-11-15 00:15 (Asia/Colombo), because the session may end. Written for: whoever resumes (the owner, or a new Claude session). Companion: `docs/VOLTA_AI_TASK_PROGRESS.md` (phases, approval matrix, lessons). **Nothing here has been committed, pushed or deployed. No production system, VPS, DNS record, tunnel, environment variable or model was touched. No Gemini API call was made and no key was used.**

## 0. LATEST (2026-11-15 ~04:10 CET): everything is COMMITTED locally; Step B is DEPLOYED to production

All work is committed (Agent repo `feature/ai-agent-m1`: 6 commits a77dcbd..3e0d781; website worktree `feature/ai-widget`: 3 commits bdc1efb, bed898d, b126cee; nothing pushed). The owner approved **"Step B only"**: the audited minimal Agent bundle (sha256 `e3b40e6f…a21e`) and `AGENT_NEW_SESSIONS_PER_HOUR=30` were deployed to the AI server and verified (details, backups and rollback commands in `docs/VOLTA_AI_TASK_PROGRESS.md` section 2b). Nothing else in production changed. The committed tree also passes: `tsc` clean, 2,735 of 2,736 Agent tests (the one miss is a wall-clock bound in `verify-v2-fuzz` that passes 3/3 alone), website 515 passed. The full new Agent bundle and the website are NOT deployed (need the owner's approval, disk pruning and a branch push for the website). Sections 1 to 8 below describe the earlier checkpoint and remain valid history.

## 1. Incident found and repaired during this checkpoint (read this first)

`apps/agent/src/voice/audio.ts` was found as a **0-byte file** (last written 2026-11-14 23:58:07, the minute the gateway agent began creating `src/gateway/**`). The `src/voice/` directory has never been committed, so git had no copy; the IDE local history also recorded the empty file. Consequence at that moment: `tsc` failed and 66 tests failed.
- **Repair:** the module was rebuilt from the compiled bundle `apps/agent/dist/agent.mjs` (built 2026-11-14 13:44, after the VO-01 duration fixes), rewritten as typed TypeScript with comments re-written.
- **Verification (actually run):** `tsc --noEmit` clean after the repair; 95 of 96 voice tests passed (the one failure, `voice-http` "413 … decided while streaming", passes 3 of 3 in isolation: a load-timing flake while agents ran); a diff of the esbuild output of the restored file against the bundle's module shows **only** renamed locals (`codec2`, `ms2`, `version2` from bundling), one function moved, and class/arrow styling: **all constants, thresholds and parsing logic are identical**.
- **Cause: UNKNOWN.** Either the gateway agent or the stopped-modules finisher ran a command that truncated it; both were told (message queued) to report if their commands could have touched it. **Do not assume it cannot recur: commit `src/voice/` as soon as the owner approves commits, and keep a copy before running any agent with broad write access.**
- Other health scan: no other zero-byte files in agent src/tests/scripts, docs or the web worktree src/tests. One pre-existing control character exists in the tracked test `tests/integration/m1f-smalltalk.test.ts` (committed Nov 13; test data; not in `src`, the R0 guard only scans `src`).

## 1b. UPDATE 2026-11-15 00:35: gateway agent finished and independently verified

Orchestrator-run, with the finisher agent still active: `npx tsc --noEmit` clean; **`npx vitest run`: 2,530 passed, 0 failed, 6 skipped (105 files)**; the seven gateway/privacy files alone: **248 passed**; `src/voice/audio.ts` intact (24 KB). The gateway agent states it never touched `audio.ts` (only read-only commands); the cause of the truncation therefore points at the finisher agent or something outside both, and remains UNKNOWN. Spot-checks of the gateway done by the orchestrator: the API key is used only in the `x-goog-api-key` header through a `Secret` wrapper with one `reveal()` call site; no URL or log carries a key; the gateway never reads `process.env` itself; `.env.example` has empty placeholders only; `GEMINI_ENABLED=false` by default; base URL restricted to https `*.googleapis.com` unless an explicit flag allows a custom host. The no-disk-writes privacy test is satisfied by a single explicit exception for `src/gateway/budget-store.ts` plus a test that the ledger holds no text. Gateway report: `docs/VOLTA_AI_GATEWAY_REPORT.md`. **Gateway caveats (from the agent, accepted):** request shapes are hand-written from Google's docs (the generateContent request-body page was unreachable and the docs now present an "Interactions API" as primary, so an Interactions adapter may be needed); tool-config field names, function-result role, thought-signature handling and the streaming parameter are marked UNVERIFIED in code; seed prices are `verified:false` and paid calls are refused until a person verifies them; nothing is wired into the Agent; no independent security review yet; no real Gemini call has ever been made.

## 1c. UPDATE 2026-11-15 08:40: turn loop + lane switch built by the orchestrator (no agents running)

The finisher agent died on the usage limit (its tests all pass; reports exist). The owner then said to finish the rest without agents, which was taken as lifting "do not start the turn loop yet" for the approved scope. **Built and verified by the orchestrator:** `apps/agent/src/llm/` (config, history, prompt, turn, lane, factory, index; ~800 lines) and tests `tests/unit/llm-basics.test.ts` (22), `llm-turn.test.ts` (22), `llm-lane.test.ts` (13). **Verified at that point: `tsc` clean; full suite 2,727 passed / 0 failed / 6 skipped (112 files); after the `main.ts` wiring and the voice placeholder the final run is 2,736 passed / 0 failed / 6 skipped (114 files), website 515 passed; frozen bench files untouched; `src/voice/audio.ts` intact (24,067 bytes).** What it is: `AGENT_LLM_FIRST=off|shadow|on` (default off; with it unset the factory returns the legacy pipeline object itself); `AGENT_LLM_HISTORY=off|memory` (default off; in memory only, bounded, TTL, LRU, isolated per key); turn loop over the gateway `generate()`, real tool executor, verifier v2 and repair (autofix, regenerate once, redact, honest notice; never a template reply); shadow mode serves the legacy answer unchanged and not delayed, then counts only (no text, session id or address); `on` is FAIL-CLOSED (refuses to serve until contract 1.4 has a source for model text; a test-only shim exists). **Mock-only:** all of it is tested against a scripted fake model; nothing here shows how Gemini behaves. **Wired (later the same session):** `src/main.ts` now builds the lane only when `AGENT_LLM_FIRST` is `shadow` or `on` (unset = the legacy pipeline object, unchanged; a bad value stops the start) and `src/voice/gemini.ts` holds inert Gemini speech placeholders; 5 wiring tests + 4 placeholder tests. **Final report: `docs/VOLTA_AI_GEMINI_API_INTEGRATION_REPORT.md`.** **Still not done:** the lane's per-conversation context (exclusions, honorific preference, session notes) is a hook (`contextFor`) not yet connected to the legacy pipeline's session state; cards are not produced by the new lane (text only); `ProposedAction` to client-action mapping not done.

## 2. Agents that may still be running (they die with the session)

| Role | Scope (files it owns) | State at checkpoint |
|---|---|---|
| Gateway agent | `apps/agent/src/gateway/**`, `tests/**/gateway-*.test.ts`, additive `.env.example` lines, `docs/VOLTA_AI_GATEWAY_REPORT.md` | **RUNNING, unfinished, UNVERIFIED.** ~1,960 lines in `src/gateway/` (config, secret wrapper, errors, provider, gemini-provider, resilience, budget, budget-store, prices, schema, gateway, factory, index). Known problems: `tsc` errors in `tests/unit/gateway-gemini-adapter.test.ts` (~lines 230-231), failing `tests/unit/gateway-budget.test.ts` soft-limit test, and the existing privacy test `tests/integration/m1e-reliability.test.ts` fails because the budget FileStore writes to disk (see section 4). The agent was told how to resolve it |
| Foundations finisher | `src/verify/v2/**`, `src/tools/llm/**`, `src/search/**`, their tests, `docs/VOLTA_AI_VERIFIER_V2_REPORT.md`, `docs/VOLTA_AI_TOOLS_AND_SEARCH_REPORT.md` | **RUNNING, unfinished, UNVERIFIED.** verifier v2 ~1,700 lines, tool layer ~1,290, search ~1,010 lines; search tests being added; the earlier calculator test failure may or may not be fixed |

No Ollama, model runtime, Playwright browser or OS-level background process of ours is running (checked 00:12: the Chrome/node processes on this PC are the owner's own, started days ago). A 51 MB partial download `scratchpad/llm/dl/ollama-windows-amd64.zip` is inert scratch.

## 3. Test results snapshot (run 00:10-00:12 while agents were still editing: a SNAPSHOT, not a verified checkpoint)

- `cd apps/agent && npx tsc --noEmit`: **errors** in `tests/unit/gateway-gemini-adapter.test.ts` (agent's in-progress work); `src/voice/audio.ts` repaired.
- `npx vitest run`: **2,313 passed, 3 failed, 6 skipped (101 files).** The 3 failures: (1) `m1e-reliability` disk-write invariant vs the gateway FileStore; (2) `voice-http` 413 test: load-timing flake (passes 3/3 alone); (3) `gateway-budget` soft-limit test: in-progress.
- Last **fully verified** green checkpoint (orchestrator-run, no agents active): after R0, `tsc` clean, **1,881 passed / 0 failed / 6 skipped**, frozen benchmark files unmodified; website suite 515 passed. After the stopped-agent cleanup: 2,008 passed / 1 failing (calculator, assigned to the finisher).
- Real-browser suite last run 63-71 passed (one known timing-sensitive test). Not re-run this session segment.
- Real Gemini API tests: **NONE exist; none run.** Everything for Gemini uses a fake provider. Real-model behaviour, Sinhala quality, latency and cost are completely untested.

## 4. Open design conflict to resolve (decision recorded, not yet implemented)

The budget controller needs **persistent numeric counters** so a restart cannot reset spend (required by the plan). The existing invariant test says the Agent writes nothing to disk. Resolution agreed in the message to the gateway agent: keep the FileStore in ONE file, store only numbers and reservation ids (never message text, sessions, addresses), add a test proving that, and give `m1e-reliability` a narrow explicit allow-list for that one file with a comment. Do not weaken the test any other way. Alternative for the owner: keep budget state in the website database instead (decision for the gateway-placement phase).

## 5. Modified files (uncommitted; counts at 00:12)

Repo `E:\valta.lk`: **181 changed paths** (git status); website worktree `.worktrees/ai-widget`: **58**. Main groups (all uncommitted since `96db7c9` / `6898dff`):
- Agent source: `src/router`, `src/reasoning`, `src/verify` (+`v2/`), `src/pipeline`, `src/http`, `src/contract` (1.3), `src/observability`, `src/security`, `src/session`, `src/app/stack.ts`, `src/main.ts`, `src/browser/**`, `src/browser-agent/**`, `src/voice/**` (untracked: **at risk**), `src/catalogue-intel/**`, `src/gateway/**`, `src/tools/llm/**`, `src/search/**`, `scripts/*`.
- Agent tests: R0, M8 DEV sets (`tests/bench/m8-intelligence`, `r0-local-rules`), browser, voice, security, gateway, verify-v2, tools-llm, search.
- Website: client-address hardening (`src/lib/security`, `src/lib/assistant/client-address.ts`), contract 1.3 mirror, browser confirm/cancel routes (flag off), voice routes, widget components, relay content route, tests.
- Ops: `tools/ops/prepared/**` (never run), `tools/ops/stage-agent-second-instance.sh` (never run).
- Docs: ~60 `docs/VOLTA_*` and `docs/AI_*` documents (list with `git status --short docs`).
**Unverified files** = everything under `src/gateway`, `src/verify/v2`, `src/tools/llm`, `src/search` and their tests until the two agents report and the orchestrator re-runs verification; and `src/voice/audio.ts` (restored, validated as in section 1).

## 5b. Safety snapshots (copies, not commits)

Because `src/voice/` and other new directories are untracked, snapshot archives were taken at 2026-11-15 00:10 into `C:\Users\Akila\AppData\Local\Temp\claude\e--valta-lk\8c821e5d-4e1d-4757-a376-0bee379772ee\scratchpad\snapshots\`: `agent-20261115-001011.tar.gz` (Agent src, tests, scripts, package.json, .env.example; includes the restored `src/voice/audio.ts`, 591 lines), `web-20261115-001011.tar.gz` (website worktree src and tests) and `docs-ops-20261115-001011.tar.gz` (docs and tools/ops). They contain the in-progress, UNVERIFIED gateway/verifier/tools/search files too. Restore a single file with e.g. `tar -xzf agent-20261115-001011.tar.gz -C /e/valta.lk apps/agent/src/voice/audio.ts`. The scratchpad is session-scoped: copy the snapshots somewhere permanent if you need them after the session.

## 6. Exact recovery instructions

1. `cd E:\valta.lk\apps\agent` and run: `npx tsc --noEmit` ; `npx vitest run` ; then in `E:\valta.lk\.worktrees\ai-widget\apps\web`: `npx tsc --noEmit` ; `npx vitest run`.
2. Scan for corruption: zero-byte files `find apps/agent/src apps/agent/tests docs -type f -size 0`; control characters (python: regex `[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]` over `src` and `tests`); the guard test `tests/unit/r0-normalize-safety.test.ts` must pass. (`grep -P` does not work in this shell.)
3. Check that `src/voice/audio.ts` is non-empty (~500 lines). If it is empty again, rebuild it from `apps/agent/dist/agent.mjs` lines under the marker `// src/voice/audio.ts` as described in section 1 (scratch script `scratchpad/recover_audio.py` and the restored build in `scratchpad/audio.restored.mjs` exist).
4. Check frozen files: `git status --short apps/agent/tests/bench` must show only the new directories `m8-intelligence` and `r0-local-rules`.
5. Decide per partial module (gateway, verifier v2, tools, search): read its files, run its tests, fix or finish, then re-verify. Do not trust any agent report that lacks run output.
6. Resolve section 4 (disk invariant), the failing gateway-budget test and the TypeScript errors in `gateway-gemini-adapter.test.ts`.

## 7. Next steps, in order (nothing past step 3 without the owner's approval of the phase)

1. Finish and verify the gateway, verifier v2, tool and search modules (above), with the full suite green.
2. **Turn loop** (`src/llm/**`): context assembly, function-calling loop over the gateway `ModelProvider` interface, verifier v2 integration, lane switch `AGENT_LLM_FIRST=off|shadow|on` (default off, existing pipeline as fallback), honorific policy (Sir/Madam, මහත්මයා/මහත්මිය only when a preference is known, never inferred from a name, at most once per reply), in-memory history of 6 turns (disabled, no persistence), shadow comparison in memory only. **The owner said: do not start the turn loop yet.**
3. Gemini voice (STT/TTS) and search adapters: disabled skeletons behind the existing provider interfaces; fake-provider tests only.
4. Independent QA; final report `docs/VOLTA_AI_GEMINI_API_INTEGRATION_REPORT.md` (architecture, env configuration, secrets, model selection, cost controls, files changed, tests and results, security review, remaining dependencies, production requirements, mock-only list, features needing real Gemini tests, blockers).
5. STOP for the owner's approval before any activation, billing, traffic migration or decommissioning.

## 8. Standing restrictions (unchanged)

No commit/push/merge/deploy; no production change; no VPS shutdown or deletion; no DNS/tunnel/firewall change; no paid Gemini call; **the Gemini key pasted in chat must never be used and should be revoked**; frozen EVAL/HOLDOUT/TEST sets never modified or tuned on; one SSH session per server at a time and only for owner-requested read-only audits; shell tool: never write regex backslashes through heredocs.
