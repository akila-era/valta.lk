# Private website staging: architecture

Date: 2026-11-14. Written for: the project owner and operators.

**Two things are described and they must not be confused:**
1. **Local staging simulation: built and run on a developer machine** in this phase (the real Agent code and the real website code, on an invented fixture catalogue, nothing exposed).
2. **Private staging on the servers: designed, NOT built, blocked pending explicit owner approval** (it needs a change on the AI server and the website server).

## 1. Target flow

```
Staging website (preview-gated)  ──signed chat (contract 1.2)──►  private Agent 127.0.0.1:8788  (AI server)
        │                                                              │ read-only, signed, anonymous
        │                                                              ├──► website catalogue relay (production, read-only)
        │                                                              └──► Ollama 127.0.0.1:11434 (shared with the live Agent)
        ▼                                                              ▼
 staging UI: cards, fit chips                              verified reply (fixed templates + cards)
```

The private Agent never answers a real shopper: nothing routes live traffic to it, and its signing key (`stg1`) is different from the live Agent's.

## 2. Isolation properties (and how each is checked)

| Property | Design | Check |
|---|---|---|
| Separate port | 8788 loopback only; live stays on 8787 | `ss -tlnp` shows 127.0.0.1 only |
| Separate key | New `stg1` key generated on the server, never printed | live Agent rejects it; staging rejects the live key |
| Separate user | `voltastage` (corrected script), live files and env hidden from it | `sudo -u voltastage cat /etc/volta-agent/agent.env` fails |
| Separate resources | `MemoryMax`, CPU weight and quota, queue depth 2, no boot start | `systemctl show` |
| Same model runtime | Ollama is shared: **the one place isolation is weak** (a staging inference holds the single inference slot) | Staging tests are paced and never run a benchmark while live traffic is served |
| Same catalogue | The production relay, read-only, public data only, rate bucket shared with the live Agent | relay bucket of 120 per minute is global |
| No public exposure | no firewall, DNS or sshd change for step 1 (agent-first, from the server itself) | UFW status unchanged |

## 3. Reaching staging from a website (separate approval)

Not prepared as a runnable step. It needs: (a) the `voltatunnel` rule on the AI server to also permit `127.0.0.1:8788`, with a **separate tunnel key** so the live tunnel key cannot reach staging; (b) a second tunnel container on the website server (forward `18788`); (c) a preview-only website instance (a second web container, or the existing preview cookie gate `AI_ASSISTANT_PREVIEW_KEY`) pointing its `AI_AGENT_URL` at the second tunnel. Each is a production-adjacent change; rollback is removing the container and the extra rule. Design constraint: the live `volta-ai-tunnel-new` container and the live web container are never edited.

## 4. What was built and run locally (evidence)

- `apps/agent/tests/real/e2e-agent.ts`: the real Agent server over the fixture catalogue.
- `apps/web/playwright.real-agent.config.ts`: starts the storefront dev server, mock ERP, in-memory database and that Agent; 12 browser tests (greetings in three languages, multi-turn, budget retention, references, cards, fit chips, language switching, error and retry, phone). Passed on every run (three runs, the last after all review fixes).
- `tests/integration/m7-staging-security.test.ts`, `m6-contract-compat.test.ts`: the real Agent HTTP surface.

## 5. What this architecture does not cover

The browser-control worker (mock-only), voice and vision paths, uploads (there is no upload feature in the assistant), and any model-quality evaluation (no model runs in these tests).
