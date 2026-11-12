# AI shopping assistant: website integration (local build, not deployed)

Branch `feature/ai-widget`, based on the live branch `phase2/home-cards`. Nothing here is deployed, and the assistant is **off by default**: with no settings, the site behaves exactly as before (no button, the route answers 404).

## What it is

A separate floating "Shopping assistant" button and panel (bottom left; the store's WhatsApp chat stays bottom right and is untouched). Shoppers type a question; the website server forwards it, signed, to the private Agent API and shows the answer as text plus cards (products, comparison, stock, accessories, cart). Cart changes the assistant proposes are applied to the browser cart only after the shopper presses **Confirm**, once each.

```
Browser  ->  POST /api/assistant/chat  (this site, same-origin)  ->  signed request  ->  Agent API (private)
```

The browser never talks to the Agent. The Agent is not exposed by this change.

## Files

| File | Purpose |
|---|---|
| `src/app/api/assistant/chat/route.ts` | The only new endpoint. Off (404) unless configured; same-origin; rate limited; strict validation; signs and forwards; validates the answer |
| `src/lib/assistant/config.ts` | Reads and validates the settings; any problem turns the assistant off |
| `src/lib/assistant/sign.ts` | HMAC signing, identical to `apps/agent/src/auth/hmac.ts` (a test checks a vector produced by that code) |
| `src/lib/assistant/session-id.ts` | Derives the conversation id on the server |
| `src/lib/assistant/schema.ts` | Strict schemas for what the browser sends and what the Agent may answer (contract 1.1) |
| `src/components/assistant/assistant-panel.tsx` | The launcher and panel |
| `src/components/assistant/{cards.tsx,labels.ts,types.ts}` | Presentational cards (blue `#2563EB`, mobile first, Sinhala labels provisional) |
| `src/components/layout/store-shell.tsx` | Mounts the panel only when configured |
| `tests/stubs/fake-agent.ts`, `playwright.config.ts` | A fake Agent for browser tests |
| `.env.example` | The new settings, all off |

## Settings (server side only)

```
AI_ASSISTANT_ENABLED=true            # exactly "true", otherwise off
AI_AGENT_URL=http://127.0.0.1:18787  # loopback http (an SSH tunnel's local port) or https; other plain http is refused
AI_AGENT_HMAC_KEY_ID=web1
AI_AGENT_HMAC_SECRET=<32+ random characters, same as the Agent's AGENT_HMAC_KEYS>
AI_AGENT_TIMEOUT_MS=50000            # optional, 1000 to 120000
AI_ASSISTANT_DEMO_DATA=true          # cards say "Demo data" while the Agent serves MOCK data; false only for real data
```

Pages are rendered per request, so the settings are read at runtime (checked in the build output: no page is prerendered).

## Security decisions

- **Identity only from the session.** The signed-in customer comes from the existing `volta_session` cookie; the browser cannot send an identity, a customer id or a session id (the request schema is strict and rejects them). A guest is signed as `anon`. The Agent trusts identity and client IP only because they are signed.
- **Conversation id derived on the server.** The browser holds a random httpOnly `volta_ai` cookie (one day); the id sent to the Agent is an HMAC of that cookie and the identity. Signing in or out therefore gives a new conversation automatically (the Agent refuses to share an id between identities), which removes session fixation and resolves decision D1 of the M1-D report. Nothing is stored on the server.
- **No personal data to the Agent.** Only the message, a cart snapshot (product id, option, quantity), the page type and the language go; never a name, phone, email or address (a test checks this).
- **Answers are validated** against a strict schema before the browser sees them: unknown fields, off-site links, actions that do not ask for confirmation, a Sinhala answer without the native-review flag, or another contract version are all refused (the shopper sees a generic message). Agent error text is never forwarded; only fixed wording and a Retry-After.
- **Agent metadata is not forwarded** (model name, queue time, request ids).
- **No message text is logged or stored by this code** (a test checks the console stays silent, including for a message that holds a password).
- **Same-origin and rate limited** with the site's existing `guard` (20 messages a minute per client).
- **Cart.** The Agent only proposes. The browser cart changes only after Confirm, and each proposal is applied at most once. Checkout, payment and orders are not reachable from the assistant.

## Before this can go live (not done, needs your approval)

1. **The Agent must be reachable from the website server.** The Agent runs on the AI server; the website is on another host. That needs the tunnel (blocker B3): an SSH tunnel user or WireGuard, an `AllowUsers` change, and the shared secret stored in both environments. Until then leave `AI_ASSISTANT_ENABLED` unset.
2. **The Agent still serves mock data.** Its tools read an in-memory mock catalogue (products such as "Nova X1" that do not exist in the store). Real shoppers would be shown demo products. Before enabling it for customers, the tool backends must read the real catalogue (the M2 work: internal routes reusing `lib/erp`, staging ERP first, blocker B2). Keep `AI_ASSISTANT_DEMO_DATA=true` until then.
3. **Client IP.** The route uses the site's existing `clientIp()` (first `X-Forwarded-For` entry). The reverse proxy must overwrite that header with the real client address, otherwise a visitor can choose the IP the Agent rate limits on. Please confirm the nginx setting.
4. **Sinhala** is provisional and flagged for native review (B5); not claimed production-ready.
5. **Deployment.** The server's disk is 91% full and it hosts other projects; a rebuild needs space and a backup first. The Agent itself is not part of this web image.

## How to try it locally

1. Start the mock Agent from the `feature/ai-agent-m1` branch: `AGENT_DEV_SECRET=<32+ chars> npx tsx tests/real/dev-mock-agent.ts` in `apps/agent` (mock data, loopback only).
2. Start the site with the settings above, using the same secret.
3. Open the site, press the blue button at the bottom left.

## Tests

- `tests/unit/assistant-lib.test.ts` (14): signing vector, configuration rules, session id derivation, request and response schemas.
- `tests/integration/assistant-route.test.ts` (29): against a fake Agent that verifies the signature: off, origin, validation, rate limit, identity and session handling, response filtering, error mapping, redirects, timeouts, no logging.
- `tests/unit/assistant-cards.test.ts`, `assistant-confirm-interaction.test.ts`: cards and Confirm/Cancel.
- `tests/e2e/assistant-widget.spec.ts` (8, real Chromium, desktop and mobile): launcher and dialog, cards and demo label, comparison, confirm-gated cart (the real `volta.cart.v1` changes only after Confirm), signed request and derived session, error state, Sinhala notice, order hand-off, phone layout.
