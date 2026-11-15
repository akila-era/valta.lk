# VOLTA AI architecture assessment (wave 2)

Date: 2026-11-14. Written for: the project owner and the next engineer. Status words: **Implemented, Integrated, Tested locally, Tested in isolated staging, Production verified, Blocked, Pending approval.** "Production verified" appears only for what was read on the live servers on 2026-11-14 (the live Agent bundle is byte-identical to the one built from commit `96db7c9`; the website runs commit `6898dff`). Everything changed in this wave is **local and uncommitted**.

## 1. The system as it is

```
shopper browser
   │  same-origin, cookie volta_ai (random token, httpOnly)
   ▼
website (Next.js, container volta-web-1) ── nginx on the host overwrites X-Forwarded-For / X-Real-IP (verified)
   │  /api/assistant/chat | voice/*        derives the session id (HMAC of the cookie token) and the client address, signs every request (HMAC)
   │  ssh -L tunnel container (forward-only user voltatunnel, pinned host key) ── loopback only
   ▼
Agent (systemd volta-agent on the AI server, loopback :8787)
   HTTP layer: pre-auth header check → body read (caps, deadlines) → HMAC + replay → rate limits (ip, session, identity, new-session, ceiling, concurrency, cooldown)
   ├─ [new, off by default] browse path: intent rules → BrowserToolService → driver ──► isolated Chromium via an egress-filtering proxy
   ├─ pipeline: safety filter → router (deterministic, Sinhala/Singlish/English) → tools (catalogue over the website relay) → verifier → fixed templates
   │            Qwen only for English messages the router abstains on, and for optional chat replies (all verified)
   ├─ [new, off without an engine] voice routes /v1/voice/transcribe|speak → bounded queue → loopback speech engine
   └─ metrics (signed /v1/metrics)
   ▼
Ollama (loopback :11434, one model slot, production model qwen3:1.7b-q4_K_M)
Catalogue: website read-only relay /api/internal/ai/erp/* (own HMAC key, anonymous identity only) → the shop's ERP
```

## 2. Component status

| Component | Status |
|---|---|
| Router-first pipeline, scope guard, safety filter, templates, verifier, memory and reasoning, contract 1.0 to 1.2 | **Production verified** (live bundle hash read); frozen EVAL and HOLDOUT unchanged (hash tests pass) |
| Real catalogue through the relay | **Production verified** (reads); data quality **not** adequate (7 placeholder-quality products) |
| Per-address new-conversation limit (fix for the shared guest counter) | Tested locally; live still has the defect (confirmed in the live bundle); **Pending approval** (Step B) |
| Client-address hardening (website `clientIp`, /64, last forwarded entry) | Tested locally; not deployed (needs a website image build: disk 91%) |
| `/v1/chat` pre-authentication read limits (this wave) | Implemented, Tested locally |
| Voice routes (Agent + website) | Integrated (Agent wiring, absent without an engine), Tested locally with fakes; Sinhala **unevaluated** |
| Browser: real driver + egress proxy | Implemented; real Chromium tests (local); **Blocked** (see 6) |
| Browser integration (this wave) | Implemented, Integrated (off by default), Tested locally and with real Chromium on a fixture; **Blocked** for production |
| Metrics extension (this wave) | Implemented, Tested locally |
| Production entry `src/main.ts` (this wave) | Implemented, Tested locally; **not deployed** (the live service still starts the preview entry): Pending approval |

## 3. Changes made in this wave (all local)

1. **Pre-authentication body reads** (`src/http/preauth.ts`, `server.ts`): headers are checked before any body is read (an ill-formed or stale request gets 401 and its connection is dropped); only 8 bodies may be read at once; a body must complete within 10 s and never pause longer than 3 s (408); the slot is released on every path; voice requests no longer take a chat in-flight slot. The old defect (four stalled unsigned uploads made chat answer 503) is closed for `/v1/chat`, health and metrics, with real-socket tests. New error code `REQUEST_TIMEOUT` (408).
2. **Client address policy** (website chat route): `clientIp()` is called once; an unusable address becomes the reserved documentation address `192.0.2.1` (RFC 5737), a separate strictest bucket that no real visitor can share, instead of the all-zero address. Voice routes still use `0.0.0.0`: **the voice owner must change one line**, `apps/web/src/lib/assistant/voice-agent.ts:88` (`guestOrCustomerIp`) to return `UNIDENTIFIED_CLIENT_ADDRESS` from `@/lib/assistant/client-address` (and both voice routes should call `clientIp(req)` through `agentClientAddress(req)`).
3. **URL policy** (PX-02, BR-04): embedded-IPv4 IPv6 forms (`::/96`, IPv4-translated, 6to4, Teredo, site-local) are blocked; path parameters (`/api;x`), NUL and hidden characters, locale-prefixed routes (`/en/checkout`) and the image optimiser's inner address are judged like the plain path. The real shop route list is still unknown (see section 6). Browser text sanitiser now strips the same hidden characters as the voice cleaner (TAG characters, U+061C, U+180E, variation selectors, soft hyphen).
4. **Observability** (see `VOLTA_AI_MONITORING_REPORT.md`).
5. **Production entry** (`src/main.ts`, `src/main-browser.ts`, `src/app/stack.ts`, `scripts/bundle.mjs`): described in section 5.
6. **Browser integration** (see `VOLTA_BROWSER_INTEGRATION_REPORT.md`) and **contract 1.3**.

## 4. Duplicated logic, weaknesses and incomplete integrations found

| # | Finding | Status / recommendation |
|---|---|---|
| D1 | The pipeline wiring lived in `mock/stack.ts` and was copied into `tests/real/preview-agent.ts`; the live Agent therefore ran a test entry | **Fixed locally**: `app/stack.ts` is the one builder (`createMockStack` delegates to it); `main.ts` is the production entry; `preview-agent.ts` is kept for tests. Still: `MockToolBackend` is the real tool backend under a misleading name (rename later, no behaviour change) |
| D2 | Two bodies-with-limits readers: `http/preauth.ts` (chat) and `voice/http.ts` (voice) | Same approach, two copies. Recommendation: make voice use `preauth.ts` (voice owner) |
| D3 | Three lists of hidden characters: `browser/policy.ts`, `voice/text.ts`, `security/url-policy.ts` (plus one in the catalogue tool) | Aligned in this wave, still triplicated: one shared `util/invisible.ts` is the right cleanup |
| D4 | The contract is mirrored by hand in the website (`lib/assistant/schema.ts`), strict on both sides | Drift risk; contract tests exist; 1.3 is **not** mirrored yet (the website stays on 1.2 by design) |
| D5 | Client-address derivation in two places (chat route and voice helper) | Chat fixed; voice one line pending (item 2 above) |
| D6 | Sessions, rate counters, proposals, metrics are in process memory | A restart forgets conversations, counters and proposals (all safe, but conversations restart); a second Agent instance would not share limits. Fine for one instance; needs a shared store before scaling |
| D7 | One model slot, queue depth 6, 6 vCPUs | The bottleneck for latency: 2 to 10 s per model call; the router answers most turns without the model. Browser and speech compete for the same cores (see the resource report) |
| D8 | The live Agent runs from `tests/real/preview-agent.ts` | `main.ts` is ready; switching is **Pending approval** and needs a rehearsal (the old bundle backup stays the rollback) |
| D9 | `deploy-agent.sh` header has a stale IP (2.29.97.114); health check accepts 200/401/404 | Cosmetic; the smoke test after a deploy must be a signed chat |
| D10 | Frontend and website contract 1.3 not built | Blocked on the frontend wave |

## 5. Production entry (`src/main.ts`)

Same wiring as the preview entry on the live server (config, Ollama, scheduler, website relay + live site data, voice when an engine is configured, metrics) with deliberate differences: **no fixture fallback** (it refuses to start without `AGENT_CATALOGUE_URL`, `AGENT_CATALOGUE_KEY_ID`, `AGENT_CATALOGUE_SECRET`); every bad setting stops the start with a message that names the variable and the rule and never a value (tested: no secret appears); the assistant is on unless `AI_ASSISTANT_ENABLED=false` (the live env file does not set it, and the preview entry forced it on, so the live env keeps working unchanged); token and time metering around the model client; graceful shutdown; the browser agent only when `AGENT_BROWSER_ENABLED=true` **and** the browser build (`main-browser.ts`) is used. `npm run bundle` builds `dist/agent.mjs` with the same banner and flags as the live bundle (relative path comments, `--preserve-symlinks`), `npm run bundle:browser` builds `dist/agent-browser.mjs` with Playwright left external. Verified: the standard bundle contains no reference to Playwright; it starts, answers 401 unsigned and 404 on `/v1/browser/*`, and exits with a clear message when the signing key is missing. **Not rehearsed on the AI server, not deployed.** SHA-256 of the bundles built in this work (for reference only; they change with every source edit): see `npm run bundle` output.

## 6. Decisions made

1. **Deterministic browse path, no model in the loop** (see the browser report). A model choosing browser tools is Blocked until a measured injection evaluation exists.
2. **Detector in the HTTP layer, not in the router**: zero change to router, reasoning and frozen-benchmark behaviour; ordinary shopping never reaches it. Cost: a browse turn does not update the conversation memory (the next message starts from the memory as it was before the browse turn).
3. **Contract 1.3 is additive and optional**; `CONTRACT_VERSION` changed to `"1.3"` (health reports it) while 1.0 to 1.2 clients are byte-compatible (tests: fit still reaches 1.2 clients, never 1.0/1.1; no `browser` field below 1.3; unknown versions still 422).
4. **Browser code is physically absent from the standard bundle**; enabling needs both a switch and a different build.
5. **Fail closed**: unidentifiable address gets the strictest bucket, not silence; an unexpected tool result is never treated as success; an unverified action is reported as unverified.
6. **Approvals are real**: bound to session, identity, element and page; single use; expiring; enforced by a signed endpoint (no UI-only confirmation exists).

## 7. What stays Blocked

- **Browser for shoppers or production**: fresh independent review of the wave-1 browser fixes; operating-system isolation (separate user, no private-network access, CPU and memory limits: proposal only); Chromium on Linux unverified; the real shop route list (BR-04) unknown; website 1.3 routes and UI not built; owner approval. The memory of one session was about 190 MB and three about 350 MB on Windows; the shared 12 GB server has not been measured with the browser.
- **Voice**: Sinhala and Singlish recognition and speech unevaluated (no native recordings); no engine installed anywhere.
- **Deploying anything in this wave**: needs the owner's approval, a rehearsal and the two-step order (Agent first, website second; rollback website first).
- **Catalogue quality**: 7 placeholder-quality products; recommendations are not meaningful until real data exists.
- **Model evaluation** for browse/voice quality: not on the live host.

## 8. Verification (executed 2026-11-14, local)

Agent: `tsc` clean; unit and integration **1,616 passed, 3 skipped** (the earlier 7 expected failures are now ordinary passing tests); real-browser suite **71 passed, 1 skipped**; website `tsc` clean, **447 passed**. Frozen benchmark files untouched (`git status` shows no change under `tests/bench`; their hash tests pass).
