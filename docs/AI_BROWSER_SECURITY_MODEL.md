# VOLTA AI browser control: security model (M3-A)

Status: policy and tool-layer controls are implemented and tested **against a mock**. The browser-level and infrastructure-level layers are specified but **not built**. Mocked tests do not make this production-ready.

## 1. Principles

1. The model is never trusted with a security decision. Allowlists, classification, confirmation and verification are code.
2. Anonymous only: no cookies, tokens, credentials, saved profiles or logged-in sessions exist anywhere in the contract.
3. Defence in depth: every rule is enforced in more than one place, so one bug does not open the door.
4. Web pages are untrusted data, always.
5. Unverified means not done: the assistant never says an action succeeded without checking.

## 2. Domain allowlist policy

| Rule | Where it is implemented |
|---|---|
| Production hostname is exactly `valta.hexalyte.com`; the production policy is fixed in code and throws if given any other host list | `createPolicy`, `productionPolicy` |
| https only; port 443 only; no credentials in the URL; no IP literals (decimal, octal, hex, IPv6, mapped forms are normalised first and refused) | `checkUrl` |
| Exact host match: no wildcards, no subdomains, no trailing-dot or look-alike hosts (tested with Cyrillic and punycode variants) | `checkUrl` |
| Blocked paths: `/api`, `/admin`, `/checkout`, `/order-confirmation`, after percent-decoding (repeated), backslash and slash normalisation and `..` resolution | `pathCheck` |
| Redirects and sub-resources go through the same rule; third-party hosts, websockets and inline scripts are refused; `data:` only for images, fonts and media | `checkRedirect`, `checkSubresource` |
| Staging and development policies are separate objects that start empty and never inherit production hosts; plain http to loopback exists only in the development policy | `createPolicy` |
| Resolved addresses must all be public (private, loopback, link-local including 169.254.169.254, carrier NAT, multicast, IPv6 unique-local including the AWS metadata address, NAT64 and documentation ranges are refused); the driver must connect to the address it checked | `isBlockedAddress`, `resolvePublicAddresses` |
| A policy object is frozen: it cannot be changed after creation | tested |

## 3. The three enforcement layers

| Layer | Requirement | Status |
|---|---|---|
| 1. Browser navigation | The tool layer checks every target before the driver is called, checks every link before clicking it, and re-checks where the browser landed; off-site means the whole session is destroyed | **Implemented and tested (mock driver)** |
| 2. Network and request interception | The real driver intercepts every request, redirect, frame and worker with `checkSubresource`, resolves DNS itself and refuses non-public addresses, blocks downloads and permission prompts | **Specified, not built**. The mock driver demonstrates the intended behaviour |
| 3. Infrastructure | The worker host can reach only `valta.hexalyte.com:443` and DNS; no route to the AI server, website server internals, metadata endpoints or the LAN | **Specified, not built; needs approval for firewall or proxy changes and a separate host** |

Why layer 1 is not enough, shown by the benchmark: with a deliberately leaky mock driver, a redirect to an external host **did leave the driver** (1 request in the benchmark) before the tool layer stopped the assistant from seeing anything. Layers 2 and 3 exist to make that impossible, and are required before any real use.

## 4. Anonymous, isolated sessions

| Control | Implementation |
|---|---|
| One isolated context per session; nothing shared between sessions | Tested: cart, storage and history are per session; closing wipes them |
| Bound to the assistant session **and** identity that created it | `BrowserSessionManager.use` |
| A foreign session id and an unknown one are indistinguishable | Tested: same reason and retryability |
| Idle timeout 60 s; maximum lifetime 120 s; at most 20 steps per session | `DEFAULT_SESSION_LIMITS`; the runner cannot exceed the contract maximums |
| Concurrent limits: 2 sessions overall (the worker's resource budget) and 1 per identity | Tested |
| Cleanup: expired sessions are destroyed through the driver; `closeAllFor` ends all of an assistant session's browsers (chat cleared or session ended) | Tested |
| Real driver must also: no persistent profile, no service workers, no downloads, no permissions, memory and CPU limits per context | Specified, not built |

## 5. Action classes and approval

| Class | Examples | Rule in code |
|---|---|---|
| read | open, search, read, scroll, screenshot | Runs |
| reversible | Add to cart, remove, change quantity | Returns a proposal first. Runs only with a one-time token bound to this session and this exact action, issued after the shopper confirms. Compare and wishlist buttons are reversible without confirmation |
| sensitive | Sign in, register, save address, send message, subscribe, links under `/account`, checkout links | Needs a token; the anonymous worker cannot reach account or checkout pages anyway |
| financial | Buy now, Pay now, Place order, Apply coupon | **Refused with or without a token.** There is no path to payment. The shopper is handed to the existing checkout in their own tab |

Forbidden fields (never typed, whoever asks): passwords, one-time codes, card data, personal details (email, phone, address, ID numbers), discount and coupon codes; and any text that looks like a card number or an API key.

Confirmation tokens are single-use, expire after 120 seconds, are spent by any failed attempt, and cannot be minted by the planner, the loop or a page. The approval endpoint that issues them is **not built** (the store is).

## 6. Prompt injection protection

| Threat | Control |
|---|---|
| A page tells the assistant to ignore rules, reveal a prompt, open another site, or pay | Page text is sanitised (invisible and bidirectional characters removed), capped (1,500 characters for the model), fenced as untrusted data with a delimiter the page cannot forge, and scanned with the existing injection filter (a signal, never obeyed either way) |
| A page changes the allowlist | The allowlist is code, frozen, and has no input from page content |
| A page requests secrets or environment variables | The worker has none; no tool returns any; the contract has no cookie, header or storage field |
| A link leads off-site | The click never happens (destination checked first) |
| Persuading the planner to act | Tested with a deliberately **gullible** planner that does whatever the page says: it was blocked, made no request off-site, clicked nothing, and the task ended after two violations |

## 7. Audit

Events contain codes and counts only: type, short session hash, tool, outcome, error code, duration and the hostname of a blocked destination. There is no field for URLs, page text, element names, typed text, tokens or customer data, and the sink copies by allow-list. A test feeds in a secret query, a phone number, a token and a hostile URL and proves none of them appear in the audit output.

## 8. Test evidence

| Evidence | Result |
|---|---|
| URL policy tests (look-alike hosts, schemes, ports, credentials, encoded paths, IP spellings, IPv6, redirects, sub-resources, environments, rebinding) | 83 passed |
| Browser tool, session and policy tests | 49 passed |
| Action-loop and injection tests | 17 passed |
| Benchmark invariants (15 scenarios x 20 runs) | 0 incorrect actions, 0 off-site pages shown to the assistant, 0 session leaks |
| **Mutation checks** (control removed, tests must fail): landing re-check, ownership check, confirmation requirement, financial refusal, link pre-check, claim verification, session override, duplicate-step guard, session cleanup | **All 9 removals made tests fail**; the code was restored and all tests pass |

## 9. Residual risks and gaps (be explicit)

1. **Everything above is proved against a mock.** No real Chromium, no real network, no real storefront was exercised. Real browsers have behaviours (popups, service workers, `window.open`, iframes, downloads, redirects through JavaScript, HTTP/3, DNS caching) that the mock does not reproduce.
2. **Layers 2 and 3 do not exist.** Until they do, a worker must not be run against the internet.
3. **The element classifier uses English names.** Sinhala or Singlish button labels would not be recognised as financial or sensitive. The live site's buttons are English today; this must be revisited if the site is localised. The safe default for an unrecognised label is "read", which is a known weakness: M3-E should invert it (anything not on a known-safe list needs confirmation).
4. **Token approval endpoint is not built**, so no real shopper can confirm anything yet.
5. **Screenshots may show page content.** Handles are returned, not bytes, but storage, retention and who can fetch them are not designed.
6. **Resource exhaustion** (heavy pages, infinite scroll, large DOMs) is bounded by step and time budgets in code, but memory and CPU limits belong to the host and are not built.
7. **Chromium and Playwright vulnerabilities** need patching and a locked-down host (non-root, no host mounts, no secrets, read-only filesystem, separate network). Not built.
8. **Sinhala and Singlish intent weakness** (measured) means the wrong browser task may be planned; the controls limit the harm but not the annoyance.
9. **No real customer data was used anywhere**, and none should be until an approved staging environment exists.
