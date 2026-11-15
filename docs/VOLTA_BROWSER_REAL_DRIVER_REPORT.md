# Real Playwright browser driver: implementation report

Date: 2026-11-14 (updated after the independent review). Written for: the project owner and the orchestrating engineer. Scope: local implementation and local testing only. **Nothing was committed, pushed, deployed or run on any server.** Status words used: **Implemented, Integrated, Tested locally, Blocked, Pending approval.** The driver is **disabled by default** and is **not integrated** with the Agent's HTTP server, pipeline or model tool choice (those belong to other workstreams).

**Reviewer's verdict, unchanged until a new review:** the independent review (`VOLTA_VOICE_BROWSER_INDEPENDENT_REVIEW.md`) judged the driver **"Not safe to enable"** (BR-01, High). The fixes below close the findings the reviewer demonstrated, with real-Chromium tests, but **a fresh independent review has not happened and OS-level isolation does not exist**, so the verdict stands: **do not enable it in production.**

## 1. Status at a glance

| Item | Status |
|---|---|
| Real Playwright (headless Chromium) implementation of the `BrowserDriver` interface | **Implemented**: `src/browser/playwright-driver.ts` plus the in-page script `src/browser/page-script.ts` |
| Network-level egress filter (in-process proxy) | **Implemented**: `src/browser/egress-proxy.ts` |
| `browser.select` (dropdown option), end to end: interface, schema, service, mock, real driver | **Implemented, tested locally** (mock tool layer and real Chromium at driver level) |
| `browser.extract_products` | **Not implemented, skipped on purpose** (see section 6) |
| Tested with a real browser | **Yes, Windows 11 only**: 63 real-browser tests pass, 1 opt-in skipped, in two consecutive full runs |
| Tested on the target OS (Ubuntu 24.04 AI server) | **No** (not allowed in this assignment) |
| Wired to the Agent, the model's tool choice, or the website | **No** (not integrated) |
| OS-level isolation (separate user, firewall rules) | **Not implemented, not tested**: proposal only (security report) |
| Production ready | **No. Blocked** pending OS isolation, Linux verification and a fresh independent review |

## 2. What changed after the independent review

| Finding | Fix | Proof (real Chromium unless stated) |
|---|---|---|
| **BR-01 (High)** a page could make the driver click an element other than the one the tool layer classified (a "Search" input/div re-labelled "Pay now"; the driver's `data-vref` attribute moved) | References are no longer page attributes. An **isolated JavaScript world** (`volta-guard`, installed before any page script with `Page.addScriptToEvaluateOnNewDocument`) keeps the element objects and a **fingerprint** (tag, role, input type, accessible name, link target) per reference. Before a click the element is re-checked against its fingerprint, scrolled into view, and a hit test makes sure nothing covers its centre. A **capture-phase guard on `window`** then cancels every pointer, mouse and click event that is not aimed at that exact element in that exact state, **before any page handler runs**. Typing and selecting do the check and the action in **one synchronous call** (no page code can run in between) | The three swap tricks from the review (input, `div[role=button]`, moved attribute) are refused or harmless; a page that swaps the button **in its own `pointerdown` handler** (mid-click) never receives the click (its click handler does not run); an invisible overlay gives `covered` and neither handler runs; the driver writes **0** `data-vref` attributes into the page (checked in the live DOM); a replaced dropdown is refused. These four tests were `it.fails` or absent and are now ordinary passing tests |
| **BR-02 (Medium)** session cap not atomic; duplicate id leaked a context | The slot (count and id) is reserved synchronously before the first `await` (`opening` set) and released in `finally` | 8 simultaneous `open()` with cap 3: exactly 3 succeed and 3 live sessions; two simultaneous opens of the same id leave exactly one context |
| **PX-01 (Medium)** proxy tunnel cap not atomic | `pendingTunnels` is counted with open tunnels and the slot is taken before the first `await` | 30 simultaneous CONNECTs with cap 3: exactly 3 established (was 30) |
| **BR-03 (Medium)** hidden text reached the snapshot | Visible-text extraction replaces `innerText`: a text walk drops text whose element or ancestors are transparent (opacity under 0.1), `font-size` under 2px, clipped by `clip-path`/`clip`, pushed off the page (`text-indent`, negative offsets), in a zero-size or overflow-clipping box that does not overlap it, or whose colour has a contrast ratio under 1.1 with its background. Dropped text is **counted** (`hiddenTextDropped`) and a 500-character **sample** (`hiddenTextSample`) is kept for the injection signal and the audit **only**; the tool layer sets `injectionSuspected` from it and never shows it to the model | All six kinds from the review (opacity 0, off-screen, font-size 0, white-on-white, clip-path, zero-height) are absent from `text`; `display:none` and `visibility:hidden` still absent; count at least 6; the sample holds the instruction; a mock test shows the flag is raised and the model-facing result does not contain the text |
| **TS-01 (Info)** flaky "hostile page cannot reach..." test | The fixed 1.5 s sleep is replaced by polling until the page's own script has written its result line | Stable in the two full runs and in the earlier failing position |
| Reference format (found while integrating): the tool schema accepted only `e<number>` while the real driver produced `e<gen>-<n>`, so every click or type through the tool layer would have been rejected as `invalid_arguments` | The schema (and the worker contract) now accept `e<1-6 digits>` optionally followed by `-<1-5 digits>`, nothing looser | Mock test: `e12`, `e3-14`, `e123456-12345` accepted; selector-like, oversized and padded forms rejected |

Not fixed by this workstream (outside its file ownership): **PX-02** (IPv6 embedded IPv4 forms in `security/url-policy.ts`, 7 `it.fails` tests remain in `tests/unit/review-urlpolicy-providers.test.ts`) and **BR-04** (path spellings the policy allows). Both are in `src/security/`.

## 3. How the driver works (current)

- **Disabled by default.** `createPlaywrightDriver({ enabled: true })` is required; anything else throws. Creating a driver starts nothing; Chromium launches on the first `open`.
- **One browser, one isolated context per session** (own cookies, storage, cache, page). Hard cap on live sessions (default 3, atomic), maximum lifetime (5 minutes), a deadline on every call, one operation at a time per session, `close` safe to repeat, idle timer closes the browser (60 s).
- **Reading and acting happen in the isolated world** (page-script.ts). The model never supplies script; the class has no cookie, storage or script accessor.
- **Snapshot**: real final address, title, **visible** text (capped at 20,000 characters, hidden text dropped and counted), up to 300 interactive elements (role, name, tag, enabled, visible, `href`, `inputType`, value never for password, file or hidden fields), scroll position (`scrollY`), cart count (`data-cart-count`), ready flag, refused-request count.
- **References** (`e<generation>-<n>`) are keys into the world's registry, valid for the snapshot that produced them only. A stale, unknown, detached, changed or disabled element is refused with `unknown_element` (the model only ever sees that code; the internal reason is in the error message for tests and audit).
- **Click**: fingerprint check, scroll into view, hit test, armed guard, then a **real (trusted) mouse click** through the DevTools input pipeline (so user-activation rules apply and popups are still counted and closed). If the guard cancelled anything, the click is reported as refused (`element_changed`); if nothing reached the element, `click_not_delivered`; a click that navigates the page away is recognised (a fresh document has nothing armed).
- **Type**: refuses password, file, hidden and non-text fields; sets the value with the native setter and fires `input`/`change` (React-compatible), optionally `requestSubmit()` on the field's form. **Select**: a real `<select>` only, not `multiple`, option matched by exact visible text (case-insensitive), disabled options refused, `input`/`change` fired so the page's own handler runs.
- **Screenshots**, **refusals** (downloads, permission prompts, dialogs, service workers, WebSockets, popups, `file:`/`data:`/`javascript:`) and **failure mapping** are unchanged from the first version.

## 4. Results (executed 2026-11-14, Windows 11, Chromium headless shell, Node 24.12)

| Suite | Result |
|---|---|
| Real-browser command, run twice in a row | **63 passed, 1 skipped (the opt-in real-site test), 0 failed** in each run (was 51 passed, 6 expected failures, 1 skipped, 1 flaky failure before these fixes) |
| `driver.real.ts` | 26 passed |
| `egress-proxy.real.ts` | 9 passed |
| `resources.real.ts` | 3 passed |
| `review-egress.real.ts` (reviewer's attacks, flipped where fixed, plus new tests) | 24 passed: 0 `it.fails` left in the real-browser directory |
| `review-resources.real.ts` | 1 passed |
| Mock tool-layer tests `tests/browser` | **78 passed** (71 before; +7: select, confirmation bound to the option, schema reference forms, hidden-text signal) |
| `tsc --noEmit` | clean |

Memory (Windows working set of the Chromium process tree, no model running; shared pages are counted, so this over-states Linux): 1 session about 170 to 190 MB, 2 sessions about 267 MB, 3 sessions about 346 MB, after closing all sessions 112 MB and 3 processes, after `shutdown` 0 processes. The new in-page script did not change these numbers materially.

## 5. Known gaps and honest limits

- **Windows only.** Chromium's sandbox on Ubuntu 24.04 (restricted unprivileged user namespaces) and Linux memory are unverified.
- **Hidden-text filtering is a mitigation, not proof.** Not detected: low-contrast text a person could still read (a test records that `#777` on `#888` is kept), text on a background image or gradient (treated as unknown, kept), partly clipped text (kept whole, so characters beyond a truncated edge can be present), combined opacity of several ancestors that is low only in the product, canvas or image text, text in iframes and shadow DOM (not read at all).
- **Untrusted synthetic events are not a concern for clicks** (real input is used) but typing and selecting use script events, so a page that distinguishes trusted input can behave differently from a person.
- **A window of exposure remains inside the click**: the guard cancels events that are not on the armed element, but a page that stays benign through `pointerdown`, `pointerup` and `click` and misbehaves only afterwards is outside what a driver can prevent; the tool layer's classification, confirmations and step budget apply.
- **Legitimate dynamic pages**: a label that changes between snapshot and action (for example a counter in a button) is refused conservatively; the model must read the page again.
- Only the main frame is read; the real driver through `BrowserToolService` with fixtures was not run (the tool layer requires https and the production host; fixtures are http on a local port). Real-driver `select` was tested at driver level, the confirmation flow for `select` at tool level with the mock only.
- No browser-level change to same-site `/api` GETs by the page itself (blocked today by the URL policy). One request was refused in the single real-site visit; not investigated.
- `playwright-core` is not declared in `apps/agent/package.json`; Chromium files (about 150 MB) need an approved install on any server; the Agent's bundle must treat `playwright-core` as external.

## 6. Decisions and what was skipped

- **`browser.extract_products` was not built.** A structured read-only product extractor from page elements would carry page-written prices; the brief allowed skipping it. The catalogue tools remain the only price authority, and product discovery should use them, not page text. If it is wanted later, it must label every number as unverified page text and must not feed any recommendation.
- Wiring the tools into the pipeline, a confirmation endpoint and UI, and progress events are other workstreams (wave 2) and are **not integrated**.

## 7. Mock-only, requires infrastructure, blocked

- Mock-only: tool-layer tests (`tests/browser/*`), including every `browser.select` tool-layer rule.
- Requires infrastructure: OS-level network isolation and a separate browser user, Chromium installation and a memory budget on the AI server, a Linux run.
- Pending approval: any server run, wiring into the live Agent, enabling the driver anywhere, adding `playwright-core` to dependencies.

## 8. Requests for files this workstream does not own

1. `src/security/url-policy.ts`: PX-02 (embedded IPv4 in IPv6 forms, site-local) and BR-04 (blocked prefixes after a locale segment, `/_next/image`); decide whether same-site `/api` GETs from the page itself (xhr or fetch) may pass.
2. `src/http/server.ts` / pipeline: construct the driver only behind an explicit environment switch, never by default, with the production policy; the new `getScreenshot?` on the interface and `scrollY` are available for the website route and for verifying scrolls.
