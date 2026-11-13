# M3-A completion report: architecture contracts and benchmark harness

Scope approved 2026-11-13: interfaces, architecture contracts and a benchmark harness, local only. Committed locally on `feature/ai-agent-m1` (not pushed, merged or deployed) as `58fb605` (contracts and benchmark harness), `b101a1e` (mock-only browser layer) and `8e133a4` (browser docs); this report and the plan documents are committed after them. No production server, credential, firewall, SSH or model change. No model downloaded. No server purchased.

## 1. Changed files (exact)

New code is in the Agent package (`apps/agent`, checked-out branch `feature/ai-agent-m1`), all uncommitted. Nothing in `src/pipeline`, `src/router`, `src/http` or `src/ollama` was edited, so live behaviour is unchanged: the new modules are not imported by the running Agent.

| File | What it is |
|---|---|
| `apps/agent/src/security/url-policy.ts` | Exact-hostname allowlist (production `valta.hexalyte.com` only, fixed in code), URL, redirect and sub-resource checks, blocked-address checks (private, loopback, link-local, metadata, IPv6, mapped, NAT64), DNS-result check for rebinding |
| `apps/agent/src/tools/action-classes.ts` | Action classes (read, reversible, sensitive, financial), confirmation rules, classification of the 10 live tools, single-use confirmation token shape |
| `apps/agent/src/browser/protocol.ts` | Strict request/response contract for the future browser worker (no cookies, headers, storage, scripts or free selectors; elements by worker-issued `ref` only; page text flagged untrusted; hard limits) |
| `apps/agent/src/models/types.ts` | Model descriptor types: licence evidence, measured vs estimated numbers, status (live, experimental, excluded) |
| `apps/agent/src/models/registry.ts` | Model registry with validation rules, `selectModel` (live models only, resource-aware, null when nothing fits), exact installed-tag check |
| `apps/agent/src/knowledge/types.ts` | Website knowledge contract (paths only, freshness) |
| `apps/agent/tests/unit/url-policy.test.ts` | 83 tests |
| `apps/agent/tests/unit/m3a-contracts.test.ts` | 21 tests |
| `apps/agent/tests/bench/m3-dataset.ts` | 98-message dataset (Sinhala, Singlish, English, mixed) |
| `apps/agent/tests/bench/bench-core.ts` | Router-mode and model-mode benchmark harness |
| `apps/agent/tests/bench/m3a-bench.test.ts` | 12 tests (router mode real; model mode against the fake Ollama) |
| `apps/agent/tests/real/m3a-model-bench.ts` | Manual entry point for a real model run (not part of the test run) |
| `apps/agent/tests/fake-ollama/server.ts` | Modified, additive: `/api/tags` and a model `size` in `/api/ps` |
| `docs/m3a-raw/router-bench.json` (main checkout) | Measured router benchmark output |
| `docs/AI_M3_MASTER_PLAN.md`, `docs/AI_WEBSITE_AGENT_PLAN.md`, `docs/AI_M3A_REPORT.md` (worktree) | Plans and this report |

Separate, from the stabilisation task and also uncommitted (website, worktree `feature/ai-widget`): `apps/web/src/components/assistant/assistant-panel.tsx`, `apps/web/src/components/assistant/cards.tsx`, new `apps/web/tests/e2e/assistant-mobile-keyboard.spec.ts`, and 15 regenerated screenshots in `docs/screenshots/assistant-voice/` (the browser tests rewrite them).

## 2. Architecture decisions

1. **Anonymous browser worker (your restrictions applied).** The protocol has no field for cookies, headers, storage, tokens, a profile directory, scripts or CSS/XPath selectors, so a logged-in or credentialed browser cannot be expressed in the contract. Elements are addressed only by `ref` ids the worker returned.
2. **One URL policy, three enforcement points to come.** Written as pure functions so the Agent, the browser worker and (with your approval) the host firewall can all apply the same rule. It is not left to model instructions.
3. **Production allowlist fixed in code**: `createPolicy({environment:"production"})` throws for any host list other than `valta.hexalyte.com`. Staging and development policies start empty and are built separately; loopback `http` exists only for the development policy.
4. **Financial actions have no tool, and a test proves it.** Every live tool is classified; cart tools are "reversible" (shopper click); there is no class-"financial" tool.
5. **Model registry blocks unvetted models.** Only local providers exist as a type (no remote or paid kind). A non-commercial model cannot be live or experimental; licence evidence is mandatory; `selectModel` considers live models only.
6. **Existing behaviour untouched.** The live allow-list in `src/ollama/models.ts` remains the source of what the Agent can actually request; a test checks the registry tags match it.

## 3. Test results

| Suite | Result |
|---|---|
| Agent, all tests (before M3-A: 893) | **1009 passed**, 0 failed (+116 new) |
| TypeScript check, Agent | clean |
| URL policy tests (look-alike hosts, schemes, ports, credentials, encoded and traversal paths, decimal/octal/hex IPs, IPv6, redirects, sub-resources, environments, DNS rebinding) | 83 passed |
| Contract tests (action classes, browser protocol, model registry) | 21 passed |
| Benchmark harness tests | 12 passed |
| Web unit | 82 assistant tests passed after the mobile and image changes; 344 earlier, whole web unit suite not re-run after the last edit |
| **Full browser suite (desktop and phone)** | **162 passed, 0 failed** (159 before plus 3 new phone-keyboard specs) |

The URL tests found one real defect while writing them (a percent-encoded `/%61pi/` path bypassed the blocked-path check); it is fixed and now covered.

## 4. Benchmark results

### Measured (router only, run locally on this Windows machine, Node 24.12; no model involved)

Dataset: 98 messages. **Developer-authored, not native-reviewed, not independent**, mock vocabulary, about 25 per group. Treat as a gap finder, not as a quality claim.

| Group | Intent accuracy (existing intents) | Abstained | Entity checks | New-category messages sent to a shopping tool |
|---|---|---|---|---|
| Sinhala script | 14/18 (77.8%) | 7 | 5/6 | 0/6 |
| Singlish | 14/19 (73.7%) | 4 | 3/5 | 0/5 |
| English | 18/19 (94.7%) | 2 | 8/8 | 0/7 |
| Mixed | 19/19 (100%) | 2 | 8/8 | 0/5 |
| **Overall** | **65/75 (86.7%)** | 15 | 24/27 | **0/23** |

Router latency: p50 about 1.5 ms, p95 about 4.9 ms (measured here, not on the AI server).

What it shows:
- The router **never ran a shopping tool** for general questions, policy questions or "open Google" requests (0 of 23): it abstains and asks. This is safe but means those requests get no useful answer yet (M3-B/C/D work).
- Sinhala script and Singlish are clearly weaker than English and mixed. Typical misses: "add to cart" and "pay" in pure Sinhala, delivery charge in Sinhala, "mama kalin balapu phone eke details" and "mata gewanna one" in Singlish.
- The 87% overall figure counts only the 75 messages whose intent the router has; the other 23 are the new categories.
- One dataset-authoring mistake (a typo and an unnatural Singlish phrase) was fixed before these numbers; no router tuning was done against this set.

### Model benchmark: harness built and tested, **not run against a real model**

I have no SSH access to the AI server (my key is rejected, and I did not reuse pasted passwords), and no Ollama exists on this machine. Running it would also evict the live Qwen on the production AI server, which your instructions say not to disturb. So **no new tool-selection, latency or memory numbers exist for Qwen3-1.7B or Qwen3-4B in this report.** Numbers below are earlier measurements or estimates, labelled as such:

| Model | Basis | Speed | Memory |
|---|---|---|---|
| Qwen3-1.7B | Measured earlier (M1-E, AI server) | about 5.1 tokens/s; warm planner p50 8.6 s; cold about 40 s | Fits alone; exact resident MB not measured (estimate about 1.4 GB) |
| Qwen3-4B-Instruct-2507 | Measured earlier (benchmark session) | about 3.9 tokens/s | About 525 MB left free on the 4 GB server (measured), so it is risky to run |
| English tool selection, Qwen3-1.7B | Measured earlier on 100 English prompts | | Qwen only 65/100, router-first 89/100 |

To get real numbers: bundle `tests/real/m3a-model-bench.ts` and run it on a machine that already has the model, **with your approval** (details in section 7).

## 5. Model licence evidence (read 2026-11-13)

| Model | Licence | Decision |
|---|---|---|
| Qwen3-1.7B | Apache-2.0 | Live, default |
| Qwen3-4B-Instruct-2507 | Apache-2.0 | Experimental (benchmark only); not downloaded or switched |
| Qwen2.5-3B-Instruct | qwen-research: "FOR NON-COMMERCIAL PURPOSES ONLY" | Excluded |
| SinhalaLLM-1.7B | Apache-2.0 | Experimental (reword fixed templates only; off by default) |
| Gemma 3 4B | Gemma Terms of Use: not non-commercial, but restrictions must be passed to downstream users, a hosted service counts as distribution, and Google "reserves the right to restrict (remotely or otherwise) usage"; Google may terminate for breach. The terms page says Gemma 4 has a separate licence | Excluded until you and legal approve |
| GPT-OSS 20B | Apache-2.0, about 16 GB memory | Excluded (does not fit) |
| DeepSeek, others | not verified | Not assessed |

The Gemma reading is from a page summary produced by the fetch tool, not a lawyer's reading. "Verify the exact installed model tag" is built in (`installedTagMatches`); the real installed tag on the AI server has **not** been checked because I cannot log in, and licence evidence for the live model is recorded in `src/models/registry.ts`.

## 6. Minimum hardware by workload (requirements, not quotes)

I have not researched current prices, so there are no cost figures here; I can gather quotes if you want them. Memory figures marked "card" come from model cards; the rest are my estimates and need measuring.

| Workload | Minimum I would plan for | Why |
|---|---|---|
| Browser worker (Playwright and Chromium, 2 concurrent tasks) | 2 vCPU, 4 GB RAM, about 20 GB disk, egress limited to `valta.hexalyte.com` | Chromium uses roughly 0.5 to 1 GB per context (estimate) |
| Voice (speech to text and text to speech, open engines) | 4 vCPU, 8 GB RAM for a small Whisper-class model; Sinhala quality unverified | Estimate |
| Vision (image understanding) | 8 GB RAM minimum for a small vision-language model on CPU, slow; a GPU is the realistic route | Estimate |
| Larger inference (7B to 8B class) | 8 to 16 GB RAM; GPT-OSS 20B needs about 16 GB (card) | Card and estimate |

## 7. Outstanding risks

1. **The model benchmark has not run.** Quality comparison between Qwen3-1.7B and Qwen3-4B on Sinhala, Singlish and mixed text is still unmeasured. To run it I need your approval and one of: SSH access for me, or you running the bundled script.
2. **The dataset is not independent.** Real accuracy needs native-reviewed, independently written data (blocker B5).
3. **Sinhala and Singlish routing is weaker** (about 74% to 78% on this set); mixed and English are strong. Do not call Sinhala production-ready.
4. **Not yet wired in.** The URL policy, action classes and registry are not enforced by the live pipeline; they become real only when M3-C/E use them, with regression tests.
5. **Security items from the earlier plan remain open:** rotate the root and admin passwords pasted in chat, rotate the preview key, and review SSH settings (I could not, no access).
6. **Disk cleanup plan, credential rotation checklist and the M2 catalogue contract** from the earlier stabilisation brief are **not done**; I paused them when the direction changed.
7. **Nothing is pushed**, so this work exists only in local commits on this machine.

## 8. Approvals needed

- Run the real-model benchmark, and how (SSH access for me, or you run it). It briefly evicts the live Qwen, so it should be a quiet moment.
- Commit the M3-A work and the stabilisation fixes (two repositories' working trees: Agent and web).
- Legal and owner decision on the Gemma terms, and which other models to assess.
- Cost approval for the second host and for larger inference (still not requested).
- Whether to resume the paused stabilisation items (credential checklist, disk plan, M2 contract).
