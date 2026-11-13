# VOLTA AI browser control: architecture (M3-A)

Status: **contracts, policy code and a mocked test bed exist. No browser worker exists.** Nothing is deployed, no server provisioned, no port opened, nothing committed. Do not read this document as "browser automation works": it works against an in-memory mock only.

Written for: the project owner and the engineers who will build M3-E.

## 1. What was verified in the repository before designing

| Fact | Evidence | Consequence |
|---|---|---|
| The shopper's **cart lives in their own browser** (`localStorage` key `volta.cart.v1`, `apps/web/src/store/cart.ts`) | Source read | A server-side anonymous browser has a different, empty cart. It can never change the shopper's real cart. See section 3 |
| Catalogue filters are plain URL parameters: `q`, `category`, `min`, `max`, `stock`, `sale`, `brand(s)`, `sort` (`newest`, `price-asc`, `price-desc`, `name`), `page` | `catalogue-view.tsx` | Search and price filtering can be done by building a URL, not by typing into widgets |
| `robots.ts` already disallows `/api/`, `/cart`, `/checkout`, `/order-confirmation/`, `/search`, `/admin/` | Source read | Starting point for blocked paths. The worker policy blocks `/api`, `/admin`, `/checkout`, `/order-confirmation` |
| Checkout and order tracking are **hand-offs** in the Agent (`navigate: "/checkout" \| "/track-order"`) and cart changes are **proposals** the shopper confirms | `router/types.ts`, M1 pipeline | "Help me get to checkout" stays a hand-off to the shopper's own tab |
| Playwright 1.64.1 is a dev dependency of the web app (tests only); the Agent package has `zod` as its only dependency | `package.json` | No browser code or dependency exists in the Agent. This work added none |
| Model context is 2,048 tokens | `src/ollama/models.ts` | A page cannot be given to the model as text. Understanding must come from short element lists and deterministic extraction (section 8) |
| Existing safety filter, session registry, HMAC, rate limits, verifier | M1-D | Reused, unchanged: page text is scanned with the existing injection patterns |

## 2. What was built in M3-A (all under `apps/agent`, uncommitted)

| File | Responsibility |
|---|---|
| `src/security/url-policy.ts` | Exact-host allowlist; URL, redirect and sub-resource checks; blocked-address checks; DNS-result check (rebinding) |
| `src/browser/protocol.ts` | Wire contract for the future worker (strict, no cookie/header/storage/script fields) and hard limits |
| `src/browser/driver.ts` | `BrowserDriver` interface: the only thing a real Playwright driver must implement |
| `src/browser/tools.ts` | The eleven typed `browser.*` tools: strict argument schemas, result and failure types, idempotency table |
| `src/browser/policy.ts` | Element classification, forbidden fields, text sanitising and fencing, action hashes, search URL builder |
| `src/browser/sessions.ts` | Session manager: ownership, idle and lifetime timeouts, step budget, concurrency caps, cleanup, audit events |
| `src/browser/confirmations.ts` | Single-use confirmation tokens bound to session and exact action |
| `src/browser/service.ts` | `BrowserToolService`: the six-step pipeline every call goes through |
| `src/browser/loop.ts` | `BrowserTaskRunner`: the controlled action loop |
| `tests/browser/*` | Mock VOLTA store and mock driver, 66 tests, 15-scenario benchmark |

Nothing in the running Agent imports these files, so live behaviour is unchanged.

## 3. Key product decision: what the anonymous worker is for

The brief asks for "add this phone to my cart" **and** anonymous sessions that never touch a customer's browser state. Both are satisfiable only if the roles are separated:

1. **The server-side worker reads and verifies.** It opens approved public pages as a guest, reads the page, finds elements, takes screenshots, and can exercise a **sandbox** cart (the benchmark's "add to cart" and "verify cart" scenarios). Its cart belongs to a throw-away context and is destroyed with it.
2. **The shopper's real changes happen in the shopper's own browser**, exactly as today: the Agent returns a cart proposal, the shopper presses Confirm, the website's own cart code runs. The assistant never holds the shopper's cookies, so it cannot act "as" them.
3. **"Take me there" navigation** (checkout, track order, a product page) is returned as an allowlisted internal path that the shopper's own tab follows after they accept. That gives the Operator-like feel (the assistant moves the shopper around the site) without a server browser acting for them.

Recommendation: build 2 and 3 first (they need no new infrastructure and reuse tested code), and use the worker (1) only where a task genuinely needs a rendered page. Authenticated browser sessions are **not** designed here and are not enabled.

## 4. Component diagram

```
Shopper's browser (VOLTA AI modal)            Website server              AI server (Agent)                       Browser worker host (NOT BUILT)
  message ───────────────────────────► /api/assistant/chat ──signed──► router → planner → BrowserTaskRunner ──► Playwright driver
  ◄── reply, cards, proposals, navigate ◄───────────────────────────────  │       │                              (anonymous context per session,
  Confirm click ──► approval endpoint (issues the one-time token)         │       └► BrowserToolService            request interception, egress limits)
                                                                           └► existing tools / knowledge index
```

## 5. The tool surface

All arguments are strict (unknown fields rejected). No tool takes JavaScript, a shell command, a CSS/XPath selector, a cookie, a header, a download or an upload. Elements are named only by a `ref` the previous result returned.

| Tool | Arguments | Class | Repeatable | Verification |
|---|---|---|---|---|
| `browser.open_page` | `target` (path or https URL), optional `sessionId` | read | yes | Target checked before any request; landed URL re-checked after redirects; page `ready` |
| `browser.get_page_state` | `sessionId` | read | yes | Landed URL re-checked |
| `browser.find_elements` | `sessionId`, `role?`, `nameContains?`, `limit` | read | yes | Each element carries `actionClass` and `needsConfirmation` decided in code |
| `browser.click` | `sessionId`, `ref`, `confirmation?` | by element | **no** | Page before and after compared; link destinations checked first; financial refused; confirmation consumed |
| `browser.type_text` | `sessionId`, `ref`, `text`, `submit` | by field | **no** | Forbidden fields refused; typed value read back or page change seen; only a search box may submit |
| `browser.search` | `query?`, `category?`, `minPriceLkr?`, `maxPriceLkr?`, `inStockOnly?`, `sort?` | read | yes | The tool builds the catalogue URL itself |
| `browser.scroll` | `sessionId`, `direction` | read | yes | Page compared before and after |
| `browser.go_back` / `browser.go_forward` | `sessionId` | read | yes | Landed URL re-checked |
| `browser.take_screenshot` | `sessionId` | read | yes | Returns a handle only, never image bytes |
| `browser.close_session` | `sessionId` | read | yes | Ownership checked first; context destroyed |

Every call runs the same pipeline: **1** validate tool and arguments, **2** check session ownership, expiry and step budget, **3** validate the target and the element (URL policy, classification, confirmation), **4** execute through the driver, **5** re-check where the browser ended up and verify the effect by comparing before and after, **6** return structured output. Failures are typed (`blocked_url`, `blocked_redirect`, `not_your_session`, `confirmation_required`, `refused_financial`, and so on) and say whether a retry is sensible.

## 6. Action loop

```
user request → intent (existing router) → planner.next → policy validation → tool call → verify → next decision → outcome
```

Guarantees enforced by `BrowserTaskRunner`, each covered by a test that fails if the guarantee is removed:
- The planner may name a tool but **cannot choose the session** (the loop supplies its own) or add fields.
- Maximum 20 steps and 120 seconds; configuration cannot raise them. Cancellation is honoured. The session is destroyed on every exit path except "waiting for the shopper".
- A read-only step that fails for a transient reason is retried **once**, after re-reading the page. A step that changes something is **never** run twice with the same target (two refusals end the task).
- An unmet expectation is reported to the planner as such; it is never recorded as success.
- **A finish is accepted only if its claims are re-checked against a fresh page read.** "Added to cart" without a cart containing the item fails with `claim_not_verified`. The planner's own wording is never shown to the shopper: outcomes carry codes, to be rendered through fixed templates like the rest of the Agent.
- Two policy blocks end the task, so a model cannot probe the allowlist with variations.
- A confirmation-needing action **pauses the whole task**. Only a token issued by the approval path (never by the planner or a page) resumes it, and only for that exact action in that session.

## 7. Playwright evaluation

Verified in this repository: Playwright 1.64.1 is already installed for the web app's browser tests. The capabilities below are from Playwright's public documentation and my knowledge of it; **they have not been exercised in this session and must be proved by local tests in M3-E before anything depends on them.**

| Need | Playwright feature to use | Notes |
|---|---|---|
| Accessible, semantic element identification | Role and label locators, the accessibility snapshot of a page | Preferred over CSS. The driver converts each element to `{ref, role, name}` |
| Isolation | One `BrowserContext` per session, never a persistent profile | No cookie, storage or cache sharing; destroy the context to wipe it |
| Network layer | Route interception on the context (every request, including frames and workers) calling `checkSubresource` | Abort anything not allowed; also block service workers and downloads |
| Permissions | Grant none (camera, microphone, location, notifications, clipboard) | |
| Popups and new tabs | Handle the popup event: close anything whose URL fails the policy | Tabs are not exposed as a tool in M3-A |
| Screenshots | Page screenshot to local storage, return a handle | Not the only way the model understands pages |
| Alternatives | Puppeteer (Chrome only), Selenium (heavier), plain HTTP fetch plus an HTML parser (no JavaScript) | A plain fetch of server-rendered pages is cheaper and has far less attack surface; consider it for read-only tasks. Needs testing against the storefront, which is Next.js with client components |

Screenshot-based "computer use" models are **not** evaluated here (separate item in the brief); with a 2,048-token text model on 2 CPUs they are not realistic without a larger host.

## 8. Making this work with a small model

The planner today is a 1.7B model with a 2,048-token context. Feeding it page text is not viable (the tool layer caps page text at 1,500 characters for that reason). The design therefore relies on:
1. **The deterministic router** for intent and entities (Sinhala, Singlish, English, mixed). Measured on the M3-A set: 74% to 100% depending on language (see `AI_M3A_REPORT.md`); Sinhala and Singlish are the weak spots and M3-B should fix them first.
2. **Plan templates, not free planning**, for common tasks: intent plus entities select a fixed step sequence, and the model is used only to fill gaps or ask a question.
3. **`find_elements` with filters** and **purpose-built extractors** (price, stock, specification rows) so the model sees a few labelled facts, not a page. Product facts for cards still come from the verified shopping tools, not from reading pages.

| Example request | Intent (router) | Intended handling |
|---|---|---|
| "Phone ekak hoyala denna" | `search_products` | Existing search tool and cards (no browser needed) |
| "Rs. 150,000 ta adu hodama phone eka hoyanna" | `search_products`, `maxPriceLkr: 150000` | `browser.search` with category `mobile-phones`, max 150000, in stock. "Best" cannot be ranked, so the assistant says so and sorts by price or newest, as today |
| "Open the mobile phones category" | navigation | `browser.open_page /categories/mobile-phones`, or a navigate action for the shopper's own tab |
| "Compare these two products" | `compare_products` | Existing compare tool; browser only if a page must be read |
| "Add this phone to my cart" | `cart_add` | Existing proposal flow in the shopper's browser; worker only to verify the page and availability |
| "Find a phone with 256GB storage" | `search_products`, query "256GB" | `browser.search` with that query, then read specification rows. The current router has no storage entity, so this needs M3-B work |
| "Mata checkout page ekata yanna help karanna" | `checkout_handoff` | Hand-off to `/checkout` in the shopper's tab. The worker **cannot** open `/checkout` (blocked path) |

These mappings are design, not implemented behaviour.

## 9. Dependencies and infrastructure requirements

| Item | Needed for | Status |
|---|---|---|
| A separate host for the worker (about 2 vCPU, 4 GB RAM, 20 GB disk; sizing is an estimate) | Any real browser use | **Not approved, not provisioned** |
| Egress control that allows only `valta.hexalyte.com` on 443 (plus DNS). CDN addresses change, so a domain-allowlisting forward proxy is more reliable than IP firewall rules | Infrastructure enforcement layer | Design only; needs approval (firewall change) |
| Private, authenticated channel Agent to worker; no public port | Control traffic | Design only |
| Playwright and Chromium on the worker host; the Agent package must not gain them | Real driver | Not installed |
| Approval endpoint that issues confirmation tokens when the shopper presses Confirm | Pausing and resuming tasks | Not built (the store and loop are) |
| A knowledge index of approved pages (M3-D) | Answering policy, warranty and FAQ questions without a browser | Not built |

## 10. Phase dependencies and recommendation

```
M3-A contracts (done, mock only)
   ├─ M3-B multilingual intent  ─┐
   ├─ M3-D website knowledge ────┼─► M3-C general conversation lane ─► M3-H context and memory
   └─ M3-E1 local real driver ──► M3-E2 worker host + egress layer (needs purchase and approvals)
M3-F voice, M3-G image and document: independent, need their own host
M3-I security hardening and M3-J acceptance: last
```

Recommended order, and why:
1. **M3-B first.** Every browser task begins with understanding the request, and Sinhala and Singlish intent accuracy is the weakest measured link (74% to 78% on the M3-A set, developer-authored).
2. **M3-D next.** Most "find something on the site" requests (policies, FAQs, specifications) are answered more safely and cheaply from an index than by driving a browser.
3. **M3-E1 (a local, real Playwright driver against the storefront with the development allowlist)** to test sections 7 and 9's assumptions with real Chromium, still without any server or deployment.
4. **M3-E2 only after you approve the worker host and the egress design.**
