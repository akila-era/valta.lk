# Real browser: security report (network egress, isolation, injection, action integrity)

Date: 2026-11-14 (updated after the independent review). Written for: the project owner and the independent security reviewer. Local testing only; no server was touched. Status words: **Implemented, Tested locally (real Chromium on Windows), Mock-only, Requires infrastructure, Blocked, Pending approval.** This is a statement of evidence, not a certification.

**Verdict, stated plainly:** the independent review rated the driver **"Not safe to enable"** (BR-01) and the proxy **"candidate for private staging after fixes"**. The browser-side findings it demonstrated are now fixed and proven with real-Chromium tests (section 3), **but a fresh independent review has not been done and operating-system isolation does not exist. The real browser driver must stay disabled everywhere, production included.**

## 1. Threat model

The browser opens pages controlled by a website (the shop's own pages, which may carry third-party product text, and in the worst case a compromised page). Attackers: (a) a shopper or page trying to make the assistant open another site, an internal address or the metadata endpoint (SSRF); (b) a page returning instructions to the model (prompt injection, including text a person cannot see); (c) one shopper's browser state leaking to another; (d) a page exhausting memory or CPU; (e) a buggy or hijacked model or tool call asking for something it must not; (f) **a page that changes what a button is after the assistant chose it** (action integrity).

## 2. Layers (defence in depth)

| # | Layer | Where | Status |
|---|---|---|---|
| 1 | Tool layer: URL policy, element classification (financial refused, sensitive confirmed), confirmations bound to session, element, page and (for `select`) the chosen option, step budget | `service.ts`, `policy.ts` | Mock-tested; one real-driver visit in the sanity test |
| 2 | Driver guard: policy check before the browser is asked, final address re-checked after every read, session destroyed if the browser is somewhere it must not be | `playwright-driver.ts` | Tested locally (real Chromium) |
| 3 | Page-level interception of every request and redirect hop (`checkSubresource`), WebSockets, popups, downloads, dialogs, permissions, service workers | `playwright-driver.ts` | Tested locally |
| 4 | **Network egress proxy**, Chromium's only way out: allowlisted host, https, port 443, no IP literals, own DNS, every answer public, connection to the pinned address, per-instance credential, loopback only, **atomic tunnel cap** | `egress-proxy.ts` | Tested locally: raw sockets and a raw Chromium with no page-level checks |
| 5 | Browser flags (no own name resolution, proxy bypass cleared, WebRTC non-proxied UDP disabled, V8 limit) | launch arguments | Resolution and bypass tested; WebRTC reviewer-tested (0 datagrams); QUIC not tested |
| 6 | **Action integrity (new):** isolated-world registry, fingerprint check, cover check, capture-phase click guard, atomic fill/select | `page-script.ts` | Tested locally |
| 7 | **Visible-text filter (new):** text a person cannot see is dropped, counted and only used as an injection signal | `page-script.ts` | Tested locally (a mitigation, limits in section 5) |
| 8 | Operating-system isolation (separate user, firewall, `IPAddressDeny`) | not built | **Requires infrastructure; proposal in section 6; Blocked** |

Layers 2 to 4 are independent of each other (the raw-Chromium test shows layer 4 holding with 2 and 3 absent).

## 3. Findings of the independent review that belong to this workstream

| ID | Severity | State now | Evidence |
|---|---|---|---|
| BR-01 click target swap (input, `div[role=button]`, moved `data-vref`) | High | **Fixed, tested locally.** Plus two cases the review did not list: a swap **during** the click (in the page's own `pointerdown` handler) and an invisible overlay | Page handlers never ran in the swap-during-click and overlay cases; 0 `data-vref` attributes in the live DOM; a replaced `<select>` refused |
| BR-02 session cap and duplicate id | Medium | **Fixed, tested locally** | 8 simultaneous opens, cap 3: exactly 3; same-id double open: one context |
| PX-01 proxy tunnel cap | Medium | **Fixed, tested locally** | 30 simultaneous CONNECTs, cap 3: exactly 3 established |
| BR-03 hidden text in snapshots | Medium | **Fixed as a mitigation, tested locally** for the six kinds the review listed | All six absent from the snapshot text; counted; the sample raises `injectionSuspected` and never reaches the model |
| TS-01 flaky test | Info | **Fixed** | Deterministic wait |
| PX-02 IPv6 forms with embedded IPv4, site-local | Low | **Not fixed here (file outside this workstream: `src/security/url-policy.ts`)**; 7 `it.fails` tests remain in `tests/unit/review-urlpolicy-providers.test.ts` | Reviewer's tests |
| BR-04 path spellings the policy allows | Info | **Not fixed here** (same file) | Reviewer's probe |
| PX-03 (a) paths inside TLS, (b) SNI/domain fronting over CONNECT, (c) no OS isolation | Info | Open, as designed or untested | See section 7 |

## 4. SSRF, DNS rebinding, redirects (executed results, unchanged)

Proxy tests with raw sockets and the production policy: no credential or a wrong one gives 407 without a DNS lookup; 16 forbidden targets refused without any lookup (other hosts, look-alikes, subdomains, other ports, loopback, hex/decimal IPs, metadata, private ranges, mapped IPv6); 12 hostile DNS answer sets refused (including one mixed public and private answer); plain http refused in production mode; **pinning**: four connections to one name caused one resolver call, a later private answer was never used, and after the pin expired the then-private answer was refused. Real-browser tests: 16 forbidden addresses refused before the browser, redirects to another domain, loopback and metadata refused with 0 requests at the destination, a hostile page's fetch/XHR/WebSocket/image/iframe/beacon/popup attempts all failed with 0 requests, a raw Chromium with only the proxy saw 0 forbidden requests, and the production factory ignores a smuggled `testOnly` option. The reviewer additionally ran about 20 egress channels (meta refresh, form posts, prefetch, ping, workers, EventSource, WebRTC and others), 22 proxy authority tricks, header floods and a 200-socket slowloris: all blocked.

## 5. Action integrity, hidden text and injection

- **Action integrity (BR-01).** What a model asks to click is decided by the tool layer from the snapshot it was shown. The driver now guarantees that the click lands on that very element in that same state: the element is held by the isolated world (the page cannot re-point a reference, there is no attribute), compared with a fingerprint immediately before and again at event time by a guard that runs before any page handler. **What it does not cover:** a page that stays identical through the whole click and misbehaves afterwards, and legitimate pages whose labels change between snapshot and action (these are refused, conservatively).
- **Hidden text (BR-03).** Dropped: transparent, tiny font, off-page, clipped by `clip-path` or `clip`, zero-size or non-overlapping overflow boxes, and text whose colour is within a contrast ratio of 1.1 of its background. **Not detected (tested or reasoned):** low-contrast but readable text (`#777` on `#888` is kept, recorded in a test), text over background images or gradients, partly clipped text (kept whole), several semi-transparent ancestors, canvas or image text, iframes and shadow DOM. This is a mitigation, **not proof**.
- **Injection.** Tested with a real page (HTML comment, hidden text, a visible "ignore previous instructions" paragraph, a fake system line, zero-width and right-to-left characters, a forged fence, text written by the page's script): the driver acted on none of it, the existing `sanitizeText` and `wrapUntrusted` removed invisible characters and the forged fence, and `looksLikeInjection` flagged it; hidden instructions now also raise the flag without being shown. **Still not tested:** whether a language model, shown fenced page text, ignores an injection. That needs a model-level evaluation with a fixed attack set.
- A hostile page can lie in its visible text (a fake price). Prices must come from the verified catalogue, never from page text (this is why `browser.extract_products` was not built).

## 6. Operating-system isolation: proposal (NOT executed, Requires infrastructure, Pending approval)

The in-process proxy is only as strong as its process: Chromium is a child of the Agent and runs as the Agent's user. Proposed, on a staging machine first, never the live service: a separate unprivileged user and systemd unit for the browser (launched as a Playwright browser server on loopback and joined by the Agent; a follow-up driver change, **not implemented**) with `IPAddressDeny=any`, `IPAddressAllow=127.0.0.0/8 ::1`, `NoNewPrivileges=true`, `ProtectSystem=strict`, `ProtectHome=true`, `PrivateTmp=true`, `MemoryMax=900M`, `TasksMax=200`, `CPUQuota=150%`; plus a second control `nft add rule inet filter output meta skuid voltabrowser oifname != "lo" drop`; plus a separate unit and smaller memory cap than the model runtime. None of this was run. Whether Chromium's sandbox starts under that user on Ubuntu 24.04 must be tested on staging.

## 7. Open items before any enablement

1. **OS-level isolation (section 6): required. Blocked.** Until it exists and is tested, keep the driver disabled in production.
2. **A fresh independent review of the fixes** (action guard, visibility filter, caps): not done.
3. PX-02 and BR-04 (`src/security/url-policy.ts`), owned elsewhere.
4. The proxy cannot see paths inside TLS: `/api`, `/admin`, `/checkout`, `/order-confirmation` and cross-host redirects are enforced at layers 2 and 3 only. SNI/domain fronting over CONNECT is not tested.
5. QUIC, WebTransport, `chrome://` pages, extensions, a bad TLS certificate: not tested.
6. Windows-only evidence; Linux unverified.
7. The model-level injection evaluation: not done.
8. Human confirmation for sensitive actions: the backend store and the payload binding exist (mock-tested, now including `select`); the endpoint and UI are not built.

## 8. Verdict

On every executed test (63 real-browser tests, 0 failures, two consecutive runs; 78 mock tool-layer tests) the driver and proxy behave as designed, and the defects the independent review demonstrated in this workstream's code are closed. **It is not production ready and it is not approved for any enablement:** the OS layer, Linux verification, a fresh independent review and the model-level evaluation are missing.
