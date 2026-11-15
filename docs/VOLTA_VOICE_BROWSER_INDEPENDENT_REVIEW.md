# Independent review: real browser driver, egress proxy, voice pipeline and website voice routes

Date: 2026-11-14. Written for: the project owner and the orchestrating engineer. Reviewer: Agent F (did not write the code under review). **Local only: no server, tunnel, DNS or production site was touched; nothing was committed, pushed or deployed.** Everything marked "executed" was run on this Windows machine with real Chromium and a real Agent HTTP server; "read" means code reading only. Metrics are not merged into any single score.

## 1. Verdicts

| Component | Verdict | Why (finding ids) |
|---|---|---|
| Driver (`playwright-driver.ts`) | **Not safe to enable** | BR-01 (High): a page can make the driver click a different element from the one the tool layer classified, which defeats the "never click Pay / cart / sensitive without confirmation" control. BR-02, BR-03. |
| Egress proxy (`egress-proxy.ts`) | **Candidate for private staging after fixes** | Every network attack I tried was blocked. Open: PX-01 (tunnel cap), PX-02 (IPv6 embedded IPv4), and operating-system isolation still does not exist (PX-03). |
| Voice validation (`voice/audio.ts`, `text.ts`) | **Safe only in local tests** | VO-01 (the duration cap is bypassable by a lying header, with the validator reporting `exact: true`), VO-03; never exercised on a real browser-recorded file. |
| Voice routes (Agent: `serveVoice`, `VoiceService`, `server.ts` wiring) | **Candidate for private staging after fixes** | VO-02 (unauthenticated bodies buffered; can exhaust chat capacity), VO-04. Auth, replay, content sniffing, limits and queue held. With no engine configured the routes do not exist (404). |
| Website routes (`/api/assistant/voice/*`, `voice-agent.ts`) | **Candidate for private staging after fixes** | Read-only review (I could not add website tests under my file ownership); WB-01 (client-address trust) is an unverified dependency, and the routes inherit VO-01/VO-02 from the Agent. |

**Does any finding block even private staging?** Yes, one: **BR-01 blocks any staging that enables the real browser driver.** Nothing in the voice path blocks private staging of the routes with a test engine, but VO-01 and VO-02 should be fixed before a real speech engine is switched on.

## 2. Findings

Severity counts: **Critical 0, High 1, Medium 6, Low 3, Info 5** (15 findings). "Test" names the file and the test that proves it; tests marked `it.fails` assert the secure behaviour and are expected to fail today: they turn red when the defect is fixed (then change them to `it`).

| ID | Sev | Component | Evidence obtained | Suggested fix |
|---|---|---|---|---|
| **BR-01** | **High** | Driver `locate()` | Executed in real Chromium (`review-egress.real.ts`, section B). Snapshot says "Search"; after the snapshot the page script (a) changes an `<input type=submit>` to "Pay now", (b) changes a `div[role=button]` to "Pay now", (c) moves the driver's `data-vref` attribute from the harmless button onto a different `div` "Pay now". `click(ref)` was **accepted** in all three and the page's own handler ran (`document.title` became `clicked:Pay now` / `clicked:PAY`). The existing test only covers `a`/`button`/`summary`. Read: `service.ts` `click()` classifies from the stored **snapshot** element and the driver's `locate()` is the only later check, so a swapped element is never classified, confirmed or refused as financial. Precondition: script running on an allowed page (stored XSS, hostile product HTML, or an ordinary dynamic UI). | In `locate()`: (1) compare for **every** tag, not only `a`/`button`/`summary`: recompute the accessible name with the same function as `COLLECT` (aria-label, labels, text, value, placeholder) and require equal `role`, `tag`, `inputType` and name; (2) stop trusting an attribute the page can rewrite: keep an `ElementHandle` per ref from the isolated world at snapshot time and click that handle (a page cannot re-point a handle); (3) have the driver return the live description and make `service.ts` run `classifyElement` on it before clicking. |
| **BR-02** | Medium | Driver `open()` | Executed (`review-egress.real.ts`, section C). 8 simultaneous `open()` with `maxSessions: 3` → **8 live sessions**. 2 simultaneous `open(sameId)` → both succeed, 2 browser contexts, 1 map entry (the orphan is never closed until the browser exits, and its lifetime timer later destroys the id of the live session). Cause (read): the cap and duplicate checks run before the first `await`, the map is filled after several. | Reserve before the first await: a `pending` counter (`if (this.sessions.size + this.pending >= max) throw`) and an `opening` Set for ids; release both in `finally`. |
| **BR-03** | Medium | Driver snapshot `text` | Executed (`review-egress.real.ts`, "text that a human cannot see"). `innerText` excludes `display:none` and `visibility:hidden`, but **opacity:0, off-screen (left:-9999px), font-size:0, same-colour-on-same-background, clip-path and zero-height overflow text all reach `DriverPage.text`** (printed: `OPACITY0,OFFSCREEN,FONTSIZE0,WHITEONWHITE,CLIPPED,ZEROHEIGHT`). The reports say hidden text is absent. The tool layer fences and flags page text, but whether a model ignores it is not evaluated. | Filter in `COLLECT` with a text-node walk that drops nodes whose computed opacity is 0, font-size 0, that are clipped or outside the page box, or have contrast ratio about 1 with their background; keep fencing. Say in the reports that this is a mitigation, not proof. |
| **PX-01** | Medium | Proxy tunnel cap | Executed (`review-egress.real.ts`, section A2). `maxTunnels: 3`, 30 simultaneous CONNECTs to a stalling allowed upstream → **30 established**. Cause (read): the cap is checked before the async resolve and connect, the tunnel is counted after. | Count `pendingTunnels` at the check and release in `finally`: `if (this.tunnels.size / 2 + this.pending >= max) deny(503)`. |
| **PX-02** | Low | `isBlockedAddress` | Executed (probe + 7 `it.fails` in `review-urlpolicy-providers.test.ts`). Reported as NOT blocked: `::7f00:1`, `::127.0.0.1`, `::a9fe:a9fe` (IPv4-compatible), `::ffff:0:7f00:1` (IPv4-translated), `2002:7f00:1::` and `2002:a9fe:a9fe::` (6to4 carrying loopback and metadata addresses), `fec0::1` (site-local). Reachable only if the allowed host's own DNS returned such an AAAA record. | In `isBlockedAddress`: for `::/96`, `::ffff:0:0/96`, `2002::/16` (bits 16-47), Teredo `2001::/32`, also test the embedded IPv4 with `blockedV4`; block `fec0::/10`. |
| **PX-03** | Info | Proxy / architecture | (a) The proxy cannot see paths inside TLS, so `/api`, `/admin`, `/checkout` are enforced only by page interception and the tool layer (already disclosed). (b) CONNECT to the allowed name/IP can carry a different TLS SNI / Host (domain fronting to other virtual hosts on the same address): not testable without a real TLS upstream; **not tested**. (c) No operating-system isolation exists (already disclosed); Chromium's Linux sandbox is unverified. | Keep as designed; do the OS-level isolation proposal before any real enablement; test SNI mismatch on staging. |
| **BR-04** | Info | URL policy | Executed (probe). Allowed by the path policy because the server decides what they mean: `/api;x`, `/api%00`, `/%E2%80%8Eapi`, `/_next/image?url=%2Fapi%2Fx`, `/en/checkout`. Blocked prefixes match only at the root. Whether the shop has locale-prefixed routes or an image proxy that fetches internal paths is **unknown to me**. | Confirm the shop's real route list; consider also blocking `/_next/image` and matching blocked prefixes after a locale segment. |
| **VO-01** | Medium | `inspectAudio` | Executed (`review-voice-audio.test.ts`). A WebM declaring 2 s with **4.9 MB** of Opus blocks, an Ogg whose last granule says 2 s with 4.9 MB, and an MP4 whose `mdhd` says 2 s with a 4.9 MB `mdat` are all **accepted as `durationMs: 2000`**; Ogg and MP4 are labelled `exact: true`. The WebM Duration element wins over block timestamps. The 30 s cap therefore limits what the file claims, not what the engine must decode. Not measured: engine CPU time for such a file (no engine was run); the harm is an inference. | WebM: `ms = max(fromInfo, lastBlockMs + 20)`. All compressed formats: refuse when `bytes > declaredSeconds * 80_000` (Opus peaks at about 64 kB/s) and set `exact:false` unless payload-checked. Ogg: count lacing segments to bound the duration from above. Also set a maximum audio length inside the speech engine. |
| **VO-02** | Medium | `serveVoice` / `server.ts` | Executed (`review-voice-http.test.ts`). The body (up to 5 MB) is read **before** the signature is checked; 30 stalled unauthenticated 1 MB uploads grew the server's ArrayBuffer memory by about 20 MB (client shared one buffer). Voice requests count toward `AGENT_MAX_IN_FLIGHT` but are not refused at it: with the limit at 3, **4 stalled unauthenticated voice uploads make the chat route answer 503 QUEUE_FULL**. Fairness: the same stall on `/v1/chat` also does this (recorded test), so the class is older than voice, but voice adds a 5 MB buffer per stalled request. An upload aborted mid-way releases its slot (tested: no leak). Reachability: the Agent listens on loopback behind the tunnel. | Before `readCapped`, reject a request with no known `x-volta-key-id`, a timestamp outside the skew window or a malformed signature; keep a separate `voiceUploadsInProgress` limit (for example concurrency + queue depth + 2) returning 503 before reading; give voice uploads their own shorter `requestTimeout`. |
| **VO-03** | Low | `cleanText` | Executed (`it.fails`). Unicode TAG characters (U+E0000 to U+E007F, invisible, readable by a model) and U+061C survive a transcript; same family is missing from `policy.ts` `INVISIBLE`. The transcript is shown to the shopper for editing, but these characters would be invisible there. | Add `\u{E0000}-\u{E007F}`, `؜`, `᠎`, `︀-️` (with the `u` flag) to the strip list in both files. |
| **VO-04** | Low | `VoiceService` | Executed (`it.fails`). A provider that ignores the `AbortSignal` (fake `never resolves`, deadline 200 ms) never answers the request and the single worker slot stays taken forever. The shipped HTTP providers do honour the signal, so this is defence in depth. | `Promise.race` the job against the deadline inside `queue.run`, answer 504 and release the slot. |
| **VO-05** | Info | Wiring | Executed. Unauthenticated `GET /v1/voice/transcribe`: **405** when an engine is configured, **404** when not; this reveals whether voice is configured. Same pattern as the other routes. | Optional: answer 404 to every unauthenticated non-POST. |
| **VO-06** | Info | Voice docs | Read. "Audio is zeroed after use": only the original request `Buffer` is zeroed. Copies are made by `Buffer.concat`, `new Uint8Array(p.body)` (website), and the `FormData`/`Blob` for the engine; they wait for garbage collection. | Reword the claim; do not rely on it for privacy. |
| **TS-01** | Info | Authors' test | Executed. `driver.real.ts` "a hostile page cannot reach..." failed in 1 of 2 full real-browser runs and 1 of 3 isolated runs I made (`expected 'running' to contain 'fetch-loopback:blocked'`): the fixed 1.5 s wait races the page's own asynchronous attempts. The security outcome was never contradicted (nothing arrived at the server). | Poll for the result line (wait until the text no longer says `running`, with a timeout) instead of sleeping. |
| **WB-01** | Medium (conditional) | Website voice routes | Read. Limits and the signed client address use the first `X-Forwarded-For` entry; whether the proxy overwrites it is unconfirmed (the repository's own integration note asks for confirmation). If it can be spoofed, one visitor rotates addresses past the website limit (10 per minute) and the Agent limit (10 per minute, 60 per hour) and can keep the single speech worker busy, taking CPU that the language model shares on the 6-vCPU server. | Confirm the proxy sets `X-Forwarded-For` to the connecting address (not appends); keep the worker and queue as the global guard; per-minute global ceiling for voice. |

## 3. Attacks that were blocked (executed)

Real Chromium through the real driver and proxy, fixture log as proof (nothing reached another host, port, loopback or the decoy server):
- Meta refresh, `location=`, auto-submitted form POST, and `target=_blank` form to another host.
- `<img>`, stylesheet, `prefetch`, `preconnect`, `dns-prefetch`, `<a ping>`, `<object>`, `<embed>`, `<video>`, `<audio>`, `<script src>`, CSS `@import` and `url()`, `EventSource`, `Worker`, `sendBeacon`, dynamic `import()`, `fetch` (no-cors, credentials, keepalive), `fetch` to another port of the allowed host, `fetch` to `https://evil` and to the metadata address over https, `fetch` with a `ws:` URL, `WebSocket`.
- Service worker registration (blocked), **WebRTC/STUN to a loopback UDP socket: 0 datagrams received**.
- Page `fetch` to the proxy's own port by IP, by allowed name and with an `https` URL: none reached.
- In-page navigation to `data:`, `blob:`, `javascript:`, `file:`, `chrome:`, `view-source:`, `ftp:` and `about:`: no exposed content, session not left on those addresses.
- Invisible-overlay click-jacking: the click failed instead of hitting the overlay.
- 40 screenshots: store stayed within the configured count.
- The proxy credential is **not** on Chromium's command line; `--proxy-server` and `--host-resolver-rules` are (Windows process list).
- Raw proxy (production policy): 22 authority and host-confusion forms (trailing dot, userinfo both ways, `%00`, backslash, uppercase, punycode, hex/octal/short/decimal IPs, `0`, `0.0.0.0`, mapped and zone IPv6, `localhost.`, `*.localhost`, port 0443/65536/443443): no 200, and the resolver was only ever asked about the allowed name. CONNECT without a version, absolute-URI GET (403), unauthenticated absolute-URI (407), a pipelined second CONNECT, a 1 MB header, 100,000 headers: refused, proxy kept serving. Slowloris: 200 idle or half-header sockets were all closed by the server after about 30 s.
- URL policy (production): 41 refused spellings (also refused as sub-resource and as redirect target), blocked paths survive case, encoding, dot segments, backslash, double slash.
- Speech-engine settings: non-loopback names, `127.0.0.1.nip.io`, `localhost.evil.com`, credentials, https, `file:`, `[::ffff:127.0.0.1]`, empty and malformed values are refused at start without printing the value; a 302 from an engine to another local service is not followed (the second service saw 0 requests).
- Engine output: control, bidi and zero-width characters stripped, 5,000-character text cut to 800, non-JSON, non-string, over 200 kB and an endless stream all refused or timed out.
- Voice route auth over HTTP: unsigned, wrong secret, unknown key id, tampered body, replay, 10-minute-old timestamp, guest signature with a customer identity header, and a **chat signature replayed on the voice path** are all 401. Content-Type lies do not matter (bytes decide: JSON label + WAV bytes accepted; `audio/wav` label + PNG bytes 415). A chunked 7 MB body with no length is cut with 413. 30 simultaneous signed uploads against one worker and a queue of 3: 4 served, 26 refused with 503, queue back to zero. The 11th transcription a minute from one address is 429 with Retry-After while another address is unaffected. No log line contains audio or transcript text (the logger takes only fixed fields; the voice and browser source files contain no logging calls).
- Parse cost of 5 MB hostile files and an independent 600-input mutation fuzz (a different seed from the authors'): no crash, bounded time (numbers in section 5).

## 4. Claims in the existing reports that are overstated or unsupported

1. **"A page swapping Search for Pay now is refused"** (`VOLTA_BROWSER_REAL_DRIVER_REPORT.md`, the references bullet; and the security report): true only for `a`, `button`, `summary`. Disproved for input, div/role=button and re-pointed references (BR-01).
2. **"Hidden text is absent" / "visible text"** (security report section 5, driver report): true for `display:none` and comments only (BR-03).
3. **"Hard cap on live sessions"** and the proxy tunnel cap: not atomic (BR-02, PX-01).
4. **"WebRTC flags: set, not tested"** (security report layer 5): this review tested it: 0 UDP packets (Windows, one run). Linux untested.
5. **Voice "30 s duration cap", "exact from the header" for Ogg and MP4, `exact: true`:** the header is attacker-written; the cap limits the claim, not the audio (VO-01).
6. **"Per-job deadline"** (voice architecture): not enforced against a provider that ignores the abort signal (VO-04).
7. **"Audio zeroed after use"**: only the original buffer (VO-06).
8. **Voice HTTP tests "over real HTTP"** (implementation report): they ran behind a harness server, not `createAgentServer`. The orchestrator's `voice-wiring.test.ts` and this review's `review-voice-http.test.ts` now cover the real server.
9. **Memory figures** (browser fork, resource report): reproduced in order of magnitude, but they use a light fixture page; a 1,500-element page measured higher (section 5). Windows working set, not Linux, and they exclude the Agent and any speech engine.
10. **Not overstated, confirmed:** "no OS-level isolation", "Sinhala STT/TTS unevaluated", and the stated limits on webm duration and on browser-recorded files.

## 5. Test results (executed 2026-11-14)

| Suite | Result |
|---|---|
| Agent `npx vitest run` (unit, integration, mock browser, voice) | **67 files passed, 3 skipped; 1,436 tests passed, 13 expected failures (the open defects, `it.fails`), 3 skipped** (6 runs; two runs showed 1 failure each in my own pre-auth memory test, which was then made robust and passed 3 of 3 after) |
| Agent `tsc --noEmit` | clean (exit 0, includes the new review test files) |
| Agent `npm run test:real-browser` (real Chromium) | **Latest full run: 51 passed, 6 expected failures, 1 skipped, 1 FAILED** (59 tests). The failure is the authors' test "a hostile page cannot reach loopback..." (`driver.real.ts:232`): it reads the page's result line after a fixed 1.5 s sleep and saw `running`, i.e. the page had not finished; no request reached the fixture. It passed in the previous full run and 2 of 3 isolated reruns: a flaky test (TS-01), not a security failure |
| Website `vitest run` (`apps/web`, worktree `ai-widget`) | **408 passed (30 files)**; `tsc --noEmit` clean |
| Real-site sanity test | **not run** (forbidden for this review) |
| Server-side tests | none (no server contact) |

New review files (created by this review; no existing file was edited):
- `apps/agent/tests/real-browser/review-egress.real.ts`: 19 tests, 13 passing, 6 `it.fails` (BR-01 x3, BR-02 x2, PX-01).
- `apps/agent/tests/real-browser/review-resources.real.ts`: 1 test.
- `apps/agent/tests/unit/review-urlpolicy-providers.test.ts`: 59 tests, 52 passing, 7 `it.fails` (PX-02).
- `apps/agent/tests/unit/review-voice-audio.test.ts`: 13 tests, 9 passing, 4 `it.fails` (VO-01 x3, VO-03).
- `apps/agent/tests/unit/review-voice-http.test.ts`: 13 tests, 11 passing, 2 `it.fails` (VO-02, VO-04).

Measured figures: slowloris, 200 sockets, all closed after 30.2 s. Memory (Windows working set of the browser process tree, 1,500-element page, one run, no model): idle with one context 156 MB, **1 session peak 205 MB, 3 sessions peak 432 MB**, 0 processes left after shutdown (the authors measured 168-188 and 346 MB on a light page). Pre-authentication buffering: about 20 MB of server ArrayBuffer memory held for 30 stalled 1 MB uploads. Flood: 30 signed uploads, 4 x 200, 26 x 503. Parse and fuzz timings are printed by the tests with the label `PARSE-COST` and `FUZZ`.

## 6. What cannot be concluded for the 12 GB Linux server

- Chromium's Linux sandbox, memory on Linux (no shared-page inflation) and start-up under `ProtectSystem`, `MemoryMax` and a separate user: **unmeasured**.
- Browser plus speech engine plus language model on 6 shared vCPUs: latency for live shoppers: **unmeasured**; the Windows desktop numbers do not transfer.
- The speech engine's CPU time on a file like VO-01: **unmeasured** (no engine was run on hostile input).
- Whether the real shop's pages render completely when `/api` fetches are blocked, and whether any shop route is reachable through a path spelling the policy allows (BR-04): **unknown**; needs the real route list and a staging run.
- Domain fronting over CONNECT (PX-03 b), TLS errors, QUIC/HTTP3: **not tested**.
- Real browser-produced WebM/Ogg/MP4 recordings from phones: **not tested** (the parsers only saw synthetic builders and mutations of them).

## 7. Reproduce

```
cd apps/agent
npx vitest run tests/unit/review-urlpolicy-providers.test.ts tests/unit/review-voice-audio.test.ts tests/unit/review-voice-http.test.ts
npm run test:real-browser     # includes review-egress.real.ts and review-resources.real.ts (about 5 minutes)
```
Add `--reporter=verbose` to see the printed measurements. To see a defect's real failure message, temporarily change its `it.fails(` to `it(`.
