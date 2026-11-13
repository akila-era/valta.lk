# VOLTA AI M3: multilingual, general-purpose, website-only assistant. Master plan (M3-A deliverable)

Status: plan and evidence. M3-A contracts and the mock-only browser layer exist and are committed locally (not pushed or deployed). **No real Playwright browser worker exists.** Owner decisions of 2026-11-13: anonymous worker approved with strict limits (exact host `valta.hexalyte.com`); Qwen2.5-3B removed; Qwen3-1.7B stays default, Qwen3-4B experimental only; Gemma deferred; M3-B (Sinhala and Singlish intent) first, then M3-D, then M3-E1; infrastructure purchases not approved. This replaces `AI_WEBSITE_AGENT_PLAN.md` (same direction, narrower brief); that file's sections 2 to 4 (anonymous browser worker, allowlist, separate host) still apply and are repeated below where needed.

## 0. Corrections to earlier advice (read first)

1. **I recommended `qwen2.5:3b-instruct` earlier. That was wrong for a commercial store.** Its model card says `License: qwen-research`, and the licence text (read in this session) says use is "FOR NON-COMMERCIAL PURPOSES ONLY" (clause 2.a, with "Non-Commercial" defined as research or evaluation in 1.i), and "If you are commercially using the Materials, you shall request a license from us" (2.b). It must **not** be used for VOLTA.LK unless Alibaba Cloud grants a separate licence. It is removed from the candidate list. (This is my reading of the text, not legal advice.)
2. The browser-worker advice and the 4 GB limits stand.

## 1. Current architecture map (what exists)

| Layer | Component | Notes |
|---|---|---|
| Browser | VOLTA AI modal (`apps/web/src/components/assistant`) | Language choice, cards, confirm-gated cart, voice UI (off), clear conversation |
| Website server | `/api/assistant/chat` | Same-origin guard, rate limit, session cookie, HMAC-signed forward, strict response validation, preview gate |
| Tunnel | `ai-tunnel` container to AI server `127.0.0.1:8787` | One forwarded port only |
| Agent API (`apps/agent`, about 5,300 lines, only dependency `zod`) | auth, replay cache, abuse guard, sessions, safety pre-filter, router, pipeline, tools, verifier, scheduler, metrics | 893 tests passing |
| Inference | Ollama: `qwen3:1.7b-q4_K_M` (planner, chat replies), `SinhalaLLM-1.7B` (optional polisher, off) | One model loaded at a time, `num_ctx` 2048 |

## 2. Existing functionality map (must keep working)

HMAC and replay protection; rate limits; identity-bound sessions; safety pre-filter; response verifier (cards, actions, links, sensitive data, `needsNativeReview`); 10 shopping tools and product, comparison, stock and accessory cards; confirm-gated cart proposals; deterministic router (English, Singlish, Sinhala); Qwen planner fallback; verified Qwen-written chat replies; no message retention. Regression gate for every M3 phase: Agent 893 tests, web unit 344, web browser suite (159 + new specs).

## 3. Model evaluation report (M3-A)

Licences below were read from the model cards on 2026-11-13. "Not verified" means I have not read it this session and will not rely on it.

| Model | Licence (verified) | Commercial use | Sinhala | Fits 4 GB server | Verdict |
|---|---|---|---|---|---|
| Qwen3-1.7B (live) | Apache-2.0 | Yes (permissive) | None in our tests (Qwen never sees Sinhala today) | Yes, about 1.1 GB, 5.1 tok/s | Keep as default |
| Qwen3-4B-Instruct-2507 | Apache-2.0 | Yes | Not measured | Barely: earlier test left about 525 MB free, 3.9 tok/s | Candidate only for a bigger host, or alone on the server |
| Qwen2.5-3B-Instruct | **qwen-research (non-commercial)** | **No** | n/a | n/a | **Excluded** |
| Gemma 3 4B-it | "gemma" terms (Google), prohibited-use policy; commercial terms not stated on the card, must read the linked terms | To be confirmed from the terms | Card says 140+ languages but does not name Sinhala | Not tested | Evaluate only after reading the terms and testing Sinhala |
| GPT-OSS 20B | Apache-2.0 | Yes | Not measured | **No**: card says it needs about 16 GB memory | Needs a different, approved host |
| SinhalaLLM-1.7B (existing optional polisher) | Apache-2.0 (base SmolLM2-1.7B, Apache-2.0) | Yes | Purpose-built, but its own card says: weak world knowledge, often wrong from memory, weak at arithmetic and reasoning, formal replies, 2,048 context, not for medical/legal/financial advice | Yes (swap about 5 to 7 s) | Use only for rewording and RAG-style answers from supplied text |
| DeepSeek open-weight models | **Not verified** | Unknown | Unknown | Distills of 7B and up do not fit 4 GB | Not assessed yet |
| Other multilingual open models | **Not verified** | Unknown | Unknown | Unknown | Phase M3-A task |

**What this means.** On a 2 vCPU / 4 GB machine only models of about 4B parameters or less are usable, at about 4 to 6 tokens per second. None of them will give a "ChatGPT-like" quality in Sinhala, long reasoning or coding. This is a hardware fact, not an engineering gap. Real improvement needs a larger inference host (a cost decision for you). M3 will therefore:
- build the model registry, capability registry and resource-aware router so a bigger model can be plugged in later without code changes elsewhere;
- benchmark each candidate on our own Sinhala, Singlish, English and mixed eval sets, plus tool-calling and RAG-answer tasks, before any is routed to;
- never download a model above the 4 GB server's budget without a separate approval (as you required).

## 4. Sinhala capability gap report (evidence from this repo)

| Capability | Today | Gap |
|---|---|---|
| Intent understanding | Hand-written lexicon router. Developer-authored sets: SET_B 98%, SET_A 98% (in-sample), **SET_C 63% first run (the least biased number)**; English 100-prompt eval: Qwen only 65/100, router only 81/100, router-first 89/100 | Brittle on unseen phrasing; all sets written by one author; mock vocabulary only. Needs an independently written, native-reviewed set |
| Free-form Sinhala answers | None. Sinhala replies are fixed templates, optionally reworded by SinhalaLLM, always marked `needsNativeReview` | No general Sinhala conversation, no Sinhala writing or explanations |
| Qwen with Sinhala | Qwen never receives Sinhala; chat replies are English only | Unknown quality; must be measured |
| Typos and informal spelling | Spelling-variant normaliser (Singlish and English) | Sinhala-script typo tolerance is minimal |
| Conversation references ("that product", "the previous one") | Limited (last-card references in the router) | Needs a context resolver in M3-H |
| Native review | No reviewers engaged (open blocker B5) | **Blocks any claim of Sinhala quality** |

## 5. Hardware requirements and resource budget

| Service | Needs | Where |
|---|---|---|
| Agent API + router + knowledge index (BM25, in memory) | small CPU, under 200 MB | AI server (exists) |
| Qwen3-1.7B or SinhalaLLM | about 1.1 to 1.5 GB each, one at a time | AI server (exists) |
| Embedding model for semantic search | extra RAM and CPU competing with Qwen | **Not on the AI server.** Start with keyword (BM25) retrieval; add semantic search only on a separate host or after measuring |
| Browser worker (Chromium) | about 1 GB or more per context, 2 vCPU | **Separate host** |
| Speech-to-text and text-to-speech | open models (for example Whisper-class STT) need 1 to several GB; Sinhala quality unverified | **Separate host** |
| Image understanding (vision-language model) | several GB | **Separate host** |
| Document parsing (PDF, DOCX, XLSX, TXT) | libraries only, CPU | Separate worker with strict limits |

Rule: do not run browser, vision, voice and a larger model together on the existing server. A second machine (purchase, needs your approval) is required for anything beyond text chat and retrieval.

## 6. Security architecture

Unchanged controls stay (HMAC, replay, rate limits, identity-bound sessions, verifier, safety filter, no retention). Additions:
- **Allowlist enforced three ways** (Agent URL validation, browser request interception, host egress rules with approval). Exact `https` hosts only; DNS and redirect re-checks; private, loopback and metadata ranges blocked; external iframe and sub-resource requests aborted. A request to open Google or another site gets a polite refusal before any tool runs (router lexicon plus a tool that has no URL argument for the open internet).
- **Anonymous browser worker**, throw-away context per task, no cookies or tokens in the worker. Customer data and actions use typed, signed website tools authorised by the backend (see the earlier plan, section 2). Authenticated browser sessions are not built.
- **Untrusted content rule:** pages, product text, uploaded files and images are wrapped as data, length-capped and scanned; they cannot change instructions or unlock tools.
- **Action classes:** read-only, reversible (confirm click, undo), sensitive (explicit confirmation card), financial (no tool exists; a test asserts it). Single-use confirmation tokens bound to session and exact action.
- **Uploads:** type and size allow-list, content sniffing, malware scan (needs a scanner such as ClamAV on the worker host), temporary storage deleted after the answer, never logged.
- **Memory:** short-term context lives in the browser and request only; the "view and clear" control already exists for the window. Any long-term customer profile is **not** in scope until you approve a privacy design.
- **General answers:** a separate lane marked "AI-generated, may be wrong", with no prices, stock, order or customer claims, which still come only from tools.

## 7. Multi-agent plan (agents, interfaces, file ownership)

I run the agents as sequential work packages inside this repository, one owner per directory, with interfaces agreed first (M3-A). Each package ends with: changed files, summary, test evidence, limits, security notes.

| Agent | Package | Owns (new unless stated) |
|---|---|---|
| 1 Principal AI Architect | Interfaces: `ModelProvider`, `CapabilityRegistry`, `Tool.actionClass`, `BrowserWorkerProtocol`, `KnowledgeSource`; final integration | `apps/agent/src/contract` (extend), `docs/` |
| 2 Multilingual and Sinhala | Normalisers, language detection and persistence, context resolver, eval datasets and per-language metrics | `src/router` (extend), `tests/eval` |
| 3 Multi-model and reasoning | Model registry, capability registry, resource-aware routing, timeouts, fallback (never to a paid API), general-answer lane | `src/ollama` (extend), `src/models` |
| 4 Website knowledge and RAG | Crawler of approved pages and APIs into a local index, freshness checks, source references | `src/knowledge` |
| 5 Browser automation | Playwright worker, allowlist, isolation, screenshots | `apps/browser-worker` |
| 6 Voice and multimodal | STT and TTS service, vision, document parsing, upload validation | `apps/media-worker` |
| 7 Backend security | Approval framework, tokens, authorisation tests, red-team suite | `src/security`, `tests/security` |
| 8 Frontend experience | Approval cards, source labels, progress, language UI, upload UI | `apps/web/src/components/assistant` |
| 9 QA and performance | Regression gates, load and latency, memory reports | `tests`, `docs` |

## 8. Phases (each independently testable, reviewed before the next)

| Phase | Deliverable | Exit evidence | Dependencies and approvals |
|---|---|---|---|
| M3-A | This report plus interface definitions (types only), allowlist schema, benchmark harness for new candidates | Interfaces compile; 893 + 344 tests still pass; license table complete | None to start. Reading Gemma and DeepSeek terms is part of it |
| M3-B | Multilingual pipeline upgrade and an independently written eval set (native-reviewed) | Intent accuracy reported **per language group**; Sinhala output flagged | Native reviewers (blocker B5) for any quality claim |
| M3-C | Model registry and router, general-answer lane, writing, explanation and coding replies | Benchmarks on our sets; regression green; no model above budget downloaded | Any model larger than the 4 GB budget needs a resource approval |
| M3-D | Website RAG over approved pages and APIs | Retrieval accuracy tests, freshness tests, injection fixtures | Production domain name; staging data only |
| M3-E | Website-only browser control (local fixtures) | Allowlist, redirect, SSRF, isolation and confirmation tests | Worker host (purchase) for anything beyond local development |
| M3-F | Voice in and out | Real route tests; native Sinhala evaluation before any quality claim | Separate host; engine licences verified |
| M3-G | Image and document intelligence | Upload-validation and cleanup tests, document Q&A tests | Separate host; scanner |
| M3-H | Context and memory | Reference-resolution tests, clear and view controls | Privacy design if anything is stored |
| M3-I | Security and performance hardening | Red-team suite, load and memory report | None |
| M3-J | Integration and acceptance | All acceptance prompts from the brief with evidence | Staging environment approval |

## 9. Acceptance prompts (planned evidence)

Each prompt in your brief becomes an automated test with recorded output: the Sinhala, Singlish, English and mixed samples; "Find the warranty policy on VOLTA.LK" (retrieval with source reference); "Open the product page and add this item to my cart" (browser to confirm-gated proposal); "Open Google and search for this product" (polite refusal, no navigation attempted); and the security set (external redirect, SSRF, unauthorised customer access, prompt injection, unauthorised financial action, cookie and token extraction). General writing, reasoning and coding prompts will be tested for response, labelling and safety, not for quality parity with large commercial assistants.

## 10. Status vocabulary for the final report

Implemented / Tested / Partially supported / Mocked / Deferred / Blocked by approval. Today: everything in M3 is **not implemented**. Existing M1 features keep their previous status.

## 11. Decisions and approvals needed

1. Confirm: the anonymous worker design (no authenticated browser sessions).
2. Confirm: drop `qwen2.5:3b-instruct` (non-commercial licence). Keep Qwen3-1.7B as default.
3. Approve M3-A coding (interfaces, benchmark harness; local only).
4. A second host for browser, voice and vision workers (purchase), or local development only.
5. A larger inference host if you want quality beyond about 4B models (purchase).
6. Production domain name for the allowlist.
7. Native Sinhala reviewers and legal review (B5, B6) remain open and block quality claims.
8. Whether to read and accept Google's Gemma terms before testing Gemma, and which other multilingual models you want evaluated.
