# Gemini shadow trial on the live AI server: verified facts, exact procedure, and what is needed from the owner

Date: 2026-11-15. Written for: the project owner. Status: **PREPARED, NOT EXECUTED.** Nothing in this document has been run on any server. The owner chose "Shadow mode on the live server"; this plan turns that into exact steps and lists what only the owner can supply. **No customer message has been sent to Google, no key has been used, and the live Agent still runs with every Gemini and LLM-first setting absent (off).**

## 1. What shadow mode is, and what it is not

- **Is:** customers keep getting the existing assistant's answers, unchanged and not delayed. After each answer, for a sampled share of conversations, the Agent sends **that customer's message text** (current message only; history is off) with the system prompt and the tool list to Gemini, runs the model's answer through the verifier, and **counts** the outcome in memory. A counts-only line is written to the journal every `AGENT_LLM_STATS_SECONDS`.
- **Is not:** customers never see Gemini text. No Gemini answer text, no customer text and no session or address is stored or logged; the counters hold numbers and fixed codes only.
- **What it can tell you:** how often the new lane completes at all, verifier pass and repair rates, tool-call counts, latency buckets, language agreement with the existing pipeline, real cost in LKR per request, and failure codes.
- **What it cannot tell you:** whether the answers are GOOD (the text is deliberately not kept), and Sinhala/Singlish quality. That needs the capped real-API test with invented prompts and native-speaker review (separate step, no customer data). **Recommendation: run that local test first**, because it can find problems before any customer text leaves the shop.

## 2. Evidence gathered (all verified, with how)

| Fact | How verified |
|---|---|
| Request shape of the adapter matches Google's official docs (URL, `x-goog-api-key` header, `functionResponse` as a `user` turn, tool modes, `generationConfig.thinkingConfig.thinkingLevel` lowercase, `usageMetadata` fields) | Read from Google's own plain-text documentation `https://aistudio.google.com/llms-full.txt` on 2026-11-15 (the earlier summary-tool reading is superseded) |
| Prices: `gemini-3.5-flash-lite` $0.30 in / $2.50 out per 1M tokens (output includes thinking); `gemini-3.8-flash` $0.75 / $3.75 until 2026-12-31, then $1.50 / $7.50 | Official pricing page text, same source; saved as the reviewed file `tools/ops/prepared/gemini/price-table.reviewed.json`; checked by a test |
| **Free tier: "Content used to improve our products". Paid tier: "Content not used to improve our products"** | Official pricing page, same source. **The key must belong to a BILLED project, or customer messages may be used by Google to improve its products** |
| `maxOutputTokens` includes thinking tokens, and thinking is billed; `gemini-3.8-flash` defaults to `medium` thinking and rejects `minimal`; `gemini-3.5-flash-lite` defaults to `minimal` | Official thinking and models pages |
| The Interactions API is the documented default for new work; `generateContent` is "still supported for existing integrations, but is considered a legacy API" | Official index page. This adapter uses the legacy API: an Interactions adapter may be needed later |
| A real defect found by an end-to-end run of the real bundle against a local test double: the shop tools' schemas were rejected by the converter (`maxLength`), so every real tool request would have failed; fixed and covered by tests | Local run 2026-11-15; commit 80dfc86 |
| Local end-to-end shadow run (fake endpoint, fake key): customers received the existing answers; 3 of 3 shadow requests reached the endpoint at `/v1beta/models/gemini-3.5-flash-lite:generateContent` with the key only in the header, `thinkingLevel:"minimal"`, 5 tools, mode AUTO; ledger recorded numbers only; lane counters `tried 3, completed 3, passed 3` | `scratchpad/audit7/shadow-e2e.mjs` |
| The AI server can reach Google (HTTP 403 without a key, 0.3 s), outbound traffic is allowed, clock synchronised, Node 24.22.3 | Read-only session 2026-11-15 |
| The service runs with `ProtectSystem=strict` and no writable path, so a spend ledger file CANNOT be written today | Same session. Needs a systemd drop-in (section 5, step 2) |

## 3. What the owner must provide or decide (nothing can start without these)

1. **A NEW Gemini API key** (revoke the one pasted in chat first). Never in chat. Two safe ways: (a) save it as one line in a file outside the repository, for example `C:\Users\Akila\gemini.key`, tell me the path: I will copy it to the server with restricted permissions, append it to the root-owned env file without ever printing it, and delete the temporary copy; or (b) add the line yourself on the server (`sudo nano /etc/volta-agent/agent.env`, line `GEMINI_API_KEY=...`).
2. **Confirmation that the key's Google project has BILLING enabled (paid tier).** Only you can see this. If it is a free-tier key, do not proceed (customer text would be used to improve Google products).
3. **Privacy approval and customer notice.** Sending customers' messages to Google is a change in how personal data is processed: decide the notice text for the site's privacy page and whether legal advice is needed under Sri Lanka's Personal Data Protection Act (No. 9 of 2022). Customers type only into the chat; the lane sends the message text, never names, addresses or order data (the Agent has none).
4. **Budget:** confirm LKR 3,000 / soft 2,400 / hard 2,700 / reserve 300 and the exchange rate (the default 337.05 is unofficial; give the current rate). Also the prepaid amount: Google's minimum prepay (about $5) is already about 62% of the hard limit.
5. **Model and settings** (recommended): `gemini-3.5-flash-lite` for chat and fast, `GEMINI_THINKING_LEVEL=minimal`, `GEMINI_MAX_OUTPUT_TOKENS=1024`. (`gemini-3.8-flash` is smarter but defaults to medium thinking, costs 2.5x more per token and doubles in price on 2027-01-01.)
6. **Sample rate and duration:** recommended `AGENT_LLM_SHADOW_SAMPLE=0.2` for the first 3 days (about 20 sampled conversations a day at current traffic, a few LKR per day), then review; stop sooner on any stop condition (section 7).
7. **A systemd change on the live service** (section 5, step 2) and **one restart** of the Agent (a few seconds; in-memory conversations reset).
8. **A commit/deploy approval for the new bundle** (built from commit 80dfc86 or later).

## 4. Settings to add (names and values; the key value is never shown)

```
AGENT_LLM_FIRST=shadow
AGENT_LLM_SHADOW_SAMPLE=0.2
AGENT_LLM_STATS_SECONDS=300
GEMINI_ENABLED=true
GEMINI_API_KEY=<from the key file, never printed>
GEMINI_MODEL=gemini-3.5-flash-lite
GEMINI_FAST_MODEL=gemini-3.5-flash-lite
GEMINI_THINKING_LEVEL=minimal
GEMINI_MAX_OUTPUT_TOKENS=1024
GATEWAY_PRICE_TABLE_PATH=/etc/volta-agent/gemini-prices.json
GATEWAY_BUDGET_STORE_PATH=/var/lib/volta-agent/budget.json
GATEWAY_LKR_PER_USD=<the owner's current rate>
```
`GEMINI_ALLOW_UNVERIFIED_PRICES` stays unset: prices come from the reviewed file.

## 5. Exact procedure (one SSH session per server at a time; every step backed up; NOT RUN)

1. **Pre-flight (read-only, repeat just before):** live bundle sha equals `ba09e35c…` (or the then-current one); services active; `/v1/health` 401; Google reachable (done 2026-11-15).
2. **Ledger directory (service configuration change):** create the drop-in `/etc/systemd/system/volta-agent.service.d/10-state.conf` containing `[Service]` and `StateDirectory=volta-agent` and `StateDirectoryMode=0700`, then `systemctl daemon-reload`. systemd then creates `/var/lib/volta-agent` owned by `voltaagent`, writable despite `ProtectSystem=strict`. Rollback: delete the drop-in, `daemon-reload`.
3. **Price table:** copy `price-table.reviewed.json` to `/etc/volta-agent/gemini-prices.json` (`root:voltaagent`, mode 640).
4. **Key:** from the owner's key file (or by the owner), appended to `/etc/volta-agent/agent.env`; the env file is backed up first (`cp -p`, as in Step B); the temporary copy is removed; the script prints only the variable NAMES and the line count.
5. **Other settings (section 4)** appended to the same file (after checking the file ends with a newline, as in Step B).
6. **Bundle:** build from the committed tree with the live flags (same entry as before), verify the hash locally and on the server, `deploy-agent.sh` (backup, install, one restart, health check, automatic rollback).
7. **Verify:** health 401; process shows the variables (names; `AGENT_LLM_FIRST=shadow`); one guest chat through the website returns the usual answer; after the stats interval the journal shows `llm_lane_stats` with `tried` greater than 0 (if the conversation was sampled), `failures` empty, `costLkr` small; `/var/lib/volta-agent/budget.json` exists and holds numbers only.
8. **Watch (first hour, then daily):** `journalctl -u volta-agent | grep llm_lane_stats | tail -1`, the ledger totals, and any alert lines.

## 6. Expected cost (estimate, not measured)

About 1,200 input tokens per shadow request (system prompt plus 5 tool declarations) and a short answer: roughly $0.0004 to $0.0006, about LKR 0.15 to 0.2 per request at 337 LKR per USD with minimal thinking. 20 sampled conversations a day is a few LKR per day. Medium thinking on `gemini-3.8-flash` would cost about 10 times more per request. The budget controller refuses calls beyond the hard limit and the lane then degrades silently for the customer (they never depend on it in shadow mode).

## 7. Stop conditions and rollback

Stop (set `AGENT_LLM_FIRST=off` or remove the Gemini lines, restart, revoke the key if needed) if: any customer-visible change is observed; error rate in the journal rises; `failures` shows a code other than occasional timeouts; cost per request is more than twice the estimate; the owner withdraws approval; or Google changes the model or terms. Rollback commands: restore `/etc/volta-agent/agent.env` from its backup and `systemctl restart volta-agent`; the previous bundle is kept as `agent.mjs.bak-*`.

## 8. Not covered

Sending real customer text is irreversible once done (Google keeps prompts for an unspecified period on the paid tier and 30 days for search grounding: search is not enabled). Customers never get Gemini answers in this phase; `on` mode stays fail-closed until contract 1.4, the lane's connection to the conversation state, cards, and an independent security review exist.
