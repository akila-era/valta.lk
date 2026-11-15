# Real browser: end-to-end test report

Date: 2026-11-14 (updated after the independent review fixes). Written for: the project owner. All numbers come from commands executed in this work on Windows 11 (Node 24.12, Playwright 1.64.1, headless Chromium). Mock tests and real-browser tests are kept apart: `npm test` runs mocks and unit tests only; `npm run test:real-browser` starts a real Chromium. Status words: **Tested locally (real Chromium)**, **Mock-only**, **Not tested**.

## 1. What was exercised

| Scenario | Evidence | Result |
|---|---|---|
| Authorised navigation, title, URL, visible text, links, buttons, search box, cart count | Real Chromium, local fixture site | Pass |
| Same-site redirect: final address reported | Real | Pass |
| Click a link (the page navigates away; the click guard recognises it), back, forward | Real | Pass |
| Click a button: the page's own handler ran and the new text was read back | Real | Pass |
| Type into a search box and submit: results page reached | Real | Pass |
| **Select a dropdown option** by visible text: the page's change handler ran, the new value read back from the page | Real (driver level) | Pass |
| `select` refusals: missing option, disabled option, multiple select, non-select element, stale reference, **replaced dropdown** | Real (driver level) | All refused with `unknown_element` |
| `select` through the tool layer: verification, sensitive option text, extra arguments, session ownership, **confirmation bound to the chosen option and single use** | **Mock-only** (tool layer) | Pass (5 tests) |
| Element reference format `e12` / `e3-14` accepted, selector-like and oversized forms rejected | Mock-only (schema) | Pass |
| **Action integrity**: "Search" input and `div[role=button]` re-labelled "Pay now" after the snapshot; the driver attribute moved; a swap **during** the click; an invisible overlay | Real | Refused or harmless; the page's own handler never ran in the mid-click and overlay cases; 0 page attributes written |
| **Hidden text**: opacity 0, off-screen, font-size 0, white-on-white, clip-path, zero-height | Real | None reaches `text`; counted; sample kept for the signal only |
| Low-contrast but readable text | Real | **Kept** (stated limit) |
| Hidden text raises `injectionSuspected` and never reaches the model-facing result | Mock-only (tool layer) | Pass |
| Unknown, stale, disabled element; password-field typing | Real | Refused with the expected codes |
| Content caps (huge text, 2,000 elements) | Real | 20,000 characters and 300 elements |
| Screenshot: real PNG, owner-bound, size cap, expiry | Real | Pass |
| Popup, dialog, download | Real | Contained; session still usable |
| Blocked hostname, path, scheme, IP forms, credentials, port | Real | 16 refused; 0 requests reached the server |
| Redirects to another domain, loopback, metadata; redirect loop | Real | Refused, 0 requests; loop ended in under 15 s |
| Hostile page (fetch, XHR, WebSocket, image, iframe, beacon, popup) | Real; the wait for the page script is now **deterministic** (TS-01) | Every attempt failed; 0 requests |
| DNS rebinding, pinning, mixed answers | Real (proxy with fake resolver, plus raw Chromium) | Refused or pinned as designed |
| Reviewer's exfiltration channels, proxy authority tricks, header floods, slowloris | Real | Blocked (all kept as tests) |
| **Session cap exactly holds** under 8 simultaneous opens; same-id double open | Real | 3 of 8 succeed; one context |
| **Proxy tunnel cap exactly holds** under 30 simultaneous CONNECTs | Real (raw sockets) | 3 established |
| Cookie and `localStorage` isolation between sessions; clean start after close | Real | Pass |
| Prompt-injection page | Real | Data only; nothing executed; helpers fenced and flagged it |
| Timeout, blocked thread, memory-allocating page | Real | Clean errors; other sessions worked |
| Killed browser process | Real | Clean `closed` errors in under 5 s; next open relaunched |
| Production factory: disabled by default; smuggled `testOnly` ignored | Real | Pass |
| One read-only visit to the real home page through the production factory, proxy and tool layer | Real (real DNS and TLS), earlier in this work | Pass (title read, 156 elements, off-site address refused, session closed). **Not re-run after the fixes** (only one visit was allowed) |

## 2. Counts

| Command | Result |
|---|---|
| `npm run test:real-browser`, two consecutive full runs | **63 passed, 1 skipped (the opt-in real-site test), 0 failed**, both runs |
| by file | `driver.real.ts` 26, `egress-proxy.real.ts` 9, `resources.real.ts` 3, `review-egress.real.ts` 24, `review-resources.real.ts` 1; production sanity skipped |
| Earlier, before these fixes (for comparison, not mixed into the numbers above) | 51 passed, 6 expected failures (the reviewer's open defects), 1 skipped, 1 flaky failure |
| `npx vitest run tests/browser` (mock tool layer, loop, bench) | **78 passed** |
| `npx tsc --noEmit` | clean |

## 3. Not covered (do not read this report as covering them)

- **Agent end to end**: no model chose a browser tool, no conversation reached the driver, no voice, no website UI. The driver is **not integrated** with the Agent (wave 2 work).
- **The tool layer on top of the real driver with fixtures** (fixtures are http on a local port; the tool layer is https and production-host only). Only the single real-site visit went through `BrowserToolService`, and that was before the fixes. Consequence: the reference-format fix and the `select` tool-layer rules are proven with the mock, and the real driver's `select` at driver level, but not the two together.
- The shop's real pages in depth (product lists, search, filters); Linux and the AI server; memory under real model load; the OS-level isolation; a bad TLS certificate; QUIC; model-level injection resistance.
- Human confirmation flows (backend endpoint and UI are other workstreams).

## 4. Real-site observation

The single home-page visit reported `blockedRequests: 1`; its cause was not investigated. A likely explanation is a same-site `/api` call that the URL policy refuses for every resource type, which could leave client-rendered shop pages incomplete for the assistant (request to the owner of `src/security/url-policy.ts`).

## 5. Measured memory (Windows working set of the Chromium process tree, no model running)

| Situation | Processes | Memory (this run) |
|---|---|---|
| 1 session on a product page | 4 | about 169 to 189 MB |
| 2 sessions | 5 | about 267 MB |
| 3 sessions | 6 | about 346 MB |
| After closing all sessions | 3 | 112 MB |
| After 6 open/close cycles | 3 | unchanged |
| After shutdown | 0 | none |

These feed the resource report; they are not Linux figures. The independent review measured a 1,500-element page at 205 MB for 1 session and 432 MB for 3.
