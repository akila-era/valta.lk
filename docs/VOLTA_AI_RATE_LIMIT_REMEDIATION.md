# Urgent live rate-limit remediation (F-A): analysis and procedure for approval

Date: 2026-11-14. Written for: the project owner. **Nothing in this document has been executed.** No server was contacted, no environment variable changed, no service restarted, nothing deployed, committed or pushed. Everything marked "verified" below was produced by commands run on the local machine (unit tests, a local bundle build, and a local run of two bundles on a loopback port with a throwaway key).

## 1. What is wrong (verified in code)

- The website sends every guest to the Agent with the identity `anon` (`formatIdentity` in `src/auth/hmac.ts`: guest gives `"anon"`, customer gives `cust:<id>`). The identity is deliberately signed and carries no per-guest value.
- The Agent counted new conversations per identity (`checkNewSession(identityKey)`; committed version at `96db7c9`, and therefore the version that is live). All guests share the key `newsess:anon`, so **one counter covers every guest in the shop**.
- Default allowance is `newSessionsPerHour: 10`. The live environment does not set `AGENT_NEW_SESSIONS_PER_HOUR` (the variable names in the live `agent.env` are listed in the runbook; it is not among them), so the live cap is **10 new guest conversations per hour for the whole shop**. This has to be re-read on the server before approval (section 5, step 0).
- After the cap, three refusals inside a minute start a **60-second cooldown** for the same shared key, so new guests are refused for longer than the hour arithmetic suggests. Conversations already open are not affected (the cap is applied only when a session id is seen for the first time).
- A "new" conversation is: a first visit (new cookie), a return after 30 idle minutes (the Agent forgets the id), a visit after 8 hours, a sign-in or sign-out (the website rotates the id), or an Agent restart.

## 2. Is `AGENT_NEW_SESSIONS_PER_HOUR=200` a safe temporary mitigation?

Verified: yes, with these limits.

- 200 is the **largest value the Agent accepts** (`config.ts`: integer 1 to 200). A larger value makes `loadConfig` report an error and the service would not start, so never type a higher number.
- On the live (old) code it moves the shared guest cap from 10 to 200 per hour. Local proof (old bundle, 230 guests from 230 different addresses, limit 200): **200 allowed, request 201 refused**. So the defect remains, 20 times less severe.
- Risk it adds: none new. It loosens one limit. The per-address request limit (40 per minute), the per-session limit (15 per minute), concurrency (2), the signature check, the replay cache and the website's own limit (20 per minute per client) are untouched.
- What it does not fix: one script (or a spike) can still use up the shared 200 and block everyone else's *new* conversations for the rest of the hour. Only the code fix removes that.

## 3. Impact on legitimate shoppers (arithmetic, not a measurement)

The unit is **new conversations per hour**, not simultaneous shoppers. Someone already chatting is never blocked by this limit.

| Configuration | Guests who can START a conversation | What happens at the limit |
|---|---|---|
| Live today (10, shared) | 10 per hour, shop-wide (one every 6 minutes) | Everyone else gets the "Too many messages" reply, then a 60 s cooldown after 3 refusals |
| Mitigation (200, shared) | 200 per hour shop-wide (3.3 per minute) | Same behaviour, at 20 times the volume |
| Code fix, 10 per address plus a 2,000 per hour shop ceiling | 10 per hour **per visitor address**; shop-wide 2,000 | Only the visitor who is over their own allowance is refused |
| Code fix with `AGENT_NEW_SESSIONS_PER_HOUR=30` (recommended) | 30 per hour per address; shop-wide 2,000 | As above |

Honest limits of the arithmetic: the real number of shoppers who open the assistant per hour is **not known** from this analysis (the earlier log check showed no 429s, which suggests current traffic is below the cap, but that count must be repeated; command in section 5). The model path itself (one slot on a 6-core CPU, 2 to 10 s per model call, queue depth 6) saturates long before 200 per hour of simple router answers matters for the limiter.

Shared addresses: mobile carriers and offices put many people behind one address. The per-address limit would treat them as one visitor. 10 per hour is tight for that case; 30 is a better starting point (the existing 40-requests-per-minute per-address limit already has the same property).

## 4. Does the local fix isolate guests? (verified)

Fix: a guest's allowance is keyed on the **signed client IP** (`ip:<address>`), a customer's on the signed customer id, plus the shop-wide ceiling `newsess:*` of 2,000 per hour. The call site passes `{identityKey, clientIp}`.

Executed locally (loopback, throwaway key, real HTTP, signed guest requests with distinct session ids):

| Bundle | Limit env | Scenario | Result |
|---|---|---|---|
| Live-equivalent (HEAD) | 10 | 25 guests, 25 addresses | 10 allowed, 15 refused (first refusal at 11) |
| Live-equivalent (HEAD) | 200 | 230 guests, 230 addresses | 200 allowed, 30 refused (first refusal at 201) |
| Live-equivalent (HEAD) | 5 | 8 sessions, one address | 5 allowed, 3 refused |
| **Fix** | 10 | 25 guests, 25 addresses | **25 allowed, 0 refused** |
| **Fix** | 200 | 230 guests, 230 addresses | **230 allowed, 0 refused** |
| **Fix** | 5 | 8 sessions, one address | 5 allowed, 3 refused (one visitor cannot exceed their own allowance) |

Also executed: `vitest` for `tests/unit/rate-limit.test.ts`, `tests/unit/config.test.ts`, `tests/integration/m7-review-fixes.test.ts`: 39 passed. (The full suite, 1,299 passed, was run earlier today on the whole working tree.)

## 5. Bypass and abuse review

| # | Risk | Assessment |
|---|---|---|
| 1 | **Client address trust.** The website takes the *first* `X-Forwarded-For` entry. If the reverse proxy appends instead of overwriting, a visitor chooses their own address and each new fake address gets a fresh allowance; the per-address limits at both layers are then bypassable. If the proxy sets no header, every guest becomes `0.0.0.0` and the per-address key collapses to one shared key (the original defect again, at the per-address limit). | **Not verified.** The website's own integration document already asks for this to be confirmed. Must be checked before relying on the fix (step 0, command C4). The 2,000 per hour shop ceiling is the backstop either way. |
| 2 | Cookie-less flooding: every request without the assistant cookie mints a new token and therefore a new Agent conversation. | Bounded per address by the fix (default 10 per hour) and by the website's 20 per minute per client. With the old code and 200 it is bounded only by the shared 200. |
| 3 | Authentication: all Agent requests are HMAC-signed (key id, timestamp within 60 s, nonce replay cache, identity, client IP and body hash inside the signature), the Agent listens on loopback and is reached only through the forward-only tunnel. A visitor cannot choose identity, address or session id (the session id is an HMAC of a secret and the cookie). | Sound; unchanged by this fix. |
| 4 | Customers cannot be impersonated by guests, and guests cannot spend a customer's allowance: customers are keyed `cust:<id>` from the signed identity. | Sound. |
| 5 | IPv6: an attacker with a /64 can rotate addresses. | Per-address limits do not stop that; the shop ceiling does. Normalising IPv6 to a /64 key is a possible later improvement (not in the fix, not claimed). |
| 6 | Shop ceiling flooding (2,000 per hour) would block all new guests for a while. | Requires many addresses (or the spoofing in row 1). It is 200 times the live cap and above any plausible shop traffic. |
| 7 | Counters live in memory: a restart resets them (and forgets sessions). | An attacker cannot trigger a restart through the API. The restart is a visible, owner-approved action. |
| 8 | Memory: the store holds at most 20,000 keys and fails closed with a refusal when full. | Bounded; a refusal, never a crash. |
| 9 | Error messages and logs | The 429 reply names no key and no address; logs hold no message text. Unchanged. |

## 6. Artefacts and checksums

| Artefact | Meaning | SHA-256 |
|---|---|---|
| Live bundle on the AI server | Currently running (`/opt/volta-agent/agent.mjs`) | Starts `a1d3f8af`; **the full value must be read on the server** (step 0). I only know the prefix. |
| `agent.head.mjs` | Built here from commit `96db7c9` | `5cc9ccb0e79e4885c43c9dced2f1e1cd29f579b4cc352dd9156a5fd07018b014` |
| **`agent.min5.mjs` (recommended)** | Commit `96db7c9` plus **only** the two rate-limit edits (`src/security/rate-limit.ts`, one line in `src/http/server.ts`) | **`e3b40e6f4aa2cdf68f6387871a31dfd8b6fca136877b28ee5361d0d82dd3a21e`** |
| `agent.fix1.mjs` (not recommended now) | The whole uncommitted working tree (also contains the content relay client, address refusal, card limits, verifier changes) | `a87b1d467294bf25a9349c4723e15d2ad2d20939978525a0794a32917448bbdf` |

Verified: the minimal bundle builds identically twice (same hash), passes `node --check`, and a text diff against the HEAD-built bundle contains **exactly** the intended change (the new constant, the new `checkNewSession`, the one changed call). Files are in `C:\Users\Akila\AppData\Local\Temp\claude\e--valta-lk\8c821e5d-4e1d-4757-a376-0bee379772ee\scratchpad\` (`agent.min5.mjs`, test driver `ratecheck.mjs`).

**Not verified, stated plainly:** the HEAD-built bundle (`5cc9ccb0…`) does **not** have the live hash (`a1d3f8af…`). Most likely the build banner or build time differs; I could not prove it. So "the live bundle equals commit 96db7c9 plus nothing else" is true by process, not by hash. Consequences: (a) the minimal bundle is the right choice for a deploy (smallest possible change; the working-tree bundle would also ship the router, card and verifier changes and a client for a website route that is **not deployed**, `/api/internal/ai/erp/content`); (b) the post-deploy smoke test in section 7 is mandatory; (c) the config-only option (A below) changes no code at all and is immune to this uncertainty.

## 7. Procedure (for approval; nothing has been run)

Two steps, separately approvable. **Recommendation: Step A now, Step B in the next approved deployment window** (B after A shows the new variable is accepted; B then sets the value to 30).

The website, the tunnel, DNS, the firewall, Ollama and the production model are **not touched** by either step: the Agent's request and response contract is identical (the diff above), the website already sends the signed client address, and the model setting `AGENT_QWEN_MODEL` is not edited.

### Step 0. Read-only checks on the AI server and the website server (no changes)

On the AI server (as `voltaadmin`, with sudo):
```
C1  sudo sha256sum /opt/volta-agent/agent.mjs
C2  sudo grep -E '^(AGENT_NEW_SESSIONS_PER_HOUR|AGENT_RATE_[A-Z_]+|AGENT_MAX_CONCURRENT_PER_IDENTITY|AGENT_COOLDOWN_[A-Z]+|AGENT_AUTH_FAIL_PER_MIN|AI_CHALLENGE_MODE)=' /etc/volta-agent/agent.env || echo "none of these set (defaults apply: 10 new sessions/hour)"
C3  sudo tr '\0' '\n' < /proc/$(systemctl show -p MainPID --value volta-agent)/environ | grep -E '^(AGENT_NEW_SESSIONS_PER_HOUR|AGENT_RATE_|AGENT_COOLDOWN_|AI_CHALLENGE_MODE)' || echo "running process has none of these set"
    journalctl -u volta-agent --since -24h --no-pager | grep '"route":"/v1/chat"' | grep -oE '"status":[0-9]+' | sort | uniq -c
    systemctl is-active volta-agent ollama; free -m | head -2; df -h / | tail -1
```
C2 and C3 print only the named limit variables, never the keys or secrets. C3 shows what the running process really has (a file can differ from the process).

On the website server (client address check, row 1 above):
```
C4  grep -rnE 'X-Forwarded-For|X-Real-IP|real_ip|set_real_ip_from' /etc/nginx /etc/caddy /opt/valta 2>/dev/null | grep -v node_modules | head
```
Required reading: the proxy must **overwrite** the header with the connecting address (`proxy_set_header X-Forwarded-For $remote_addr;` or an equivalent; `$proxy_add_x_forwarded_for` appends and is spoofable) and nothing in front of it (a CDN) may hide the real address. If it does not, say so before Step B: the fix is still correct but gives less protection (row 1).

Stop here if C1 does not start with `a1d3f8af`, or C3 shows `AGENT_NEW_SESSIONS_PER_HOUR` already set: the plan assumed neither.

### Step A (configuration only): `AGENT_NEW_SESSIONS_PER_HOUR=200`

Approval needed: **change an environment variable of a live service and restart it.**

On the AI server:
```
TS=$(date +%Y%m%d-%H%M%S)
sudo cp -p /etc/volta-agent/agent.env /etc/volta-agent/agent.env.bak-$TS        # holds secrets: keep root:voltaagent 640, never print or upload
sudo grep -q '^AGENT_NEW_SESSIONS_PER_HOUR=' /etc/volta-agent/agent.env && { echo "already set: stop"; false; }
echo 'AGENT_NEW_SESSIONS_PER_HOUR=200' | sudo tee -a /etc/volta-agent/agent.env >/dev/null
sudo ls -l /etc/volta-agent/agent.env                                            # expect root voltaagent, -rw-r----- unchanged
sudo systemctl restart volta-agent
for i in 1 2 3 4 5 6 7 8; do sleep 2; systemctl is-active --quiet volta-agent && [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 127.0.0.1:8787/v1/health)" = 401 ] && echo HEALTHY && break; done
```
Expected: `HEALTHY` within about 6 seconds. Expected side effects: **about 3 to 8 seconds of failed chat requests** (the widget shows its plain error and the shopper retries); **all in-memory conversations are forgotten** (the context of anyone mid-chat restarts; their next message starts a new conversation and counts as a new one); rate counters reset (a benefit). The model stays loaded in Ollama (not restarted).

Rollback of Step A (undo the variable):
```
sudo cp -p /etc/volta-agent/agent.env.bak-$TS /etc/volta-agent/agent.env && sudo systemctl restart volta-agent
```
If the service does not start (for example a typo), the same command restores it. `systemctl` keeps restarting a failing service every 3 s without a start limit, so run the rollback at once, and read `journalctl -u volta-agent -n 20 --no-pager` (the configuration error names the variable, never a value).

### Step B (code): deploy the minimal bundle, then set the value to 30

Approval needed: **deploy an Agent bundle to the live server and restart it.** Preconditions: Step 0 done and C4 understood.

From the machine that holds the bundle (exact file above; verify the hash locally first, `sha256sum agent.min5.mjs` must print `e3b40e6f4aa2cdf68f6387871a31dfd8b6fca136877b28ee5361d0d82dd3a21e`):
```
scp -i <the owner's AI-server key> agent.min5.mjs voltaadmin@109.199.108.76:/tmp/agent.new.mjs
scp -i <the owner's AI-server key> tools/ops/deploy-agent.sh voltaadmin@109.199.108.76:/tmp/deploy-agent.sh
```
(Use the exact key; repeated failed logins are banned for an hour by Fail2ban.)

On the AI server:
```
sudo sha256sum /tmp/agent.new.mjs      # must print e3b40e6f4aa2cdf68f6387871a31dfd8b6fca136877b28ee5361d0d82dd3a21e
sudo bash /tmp/deploy-agent.sh e3b40e6f4aa2cdf68f6387871a31dfd8b6fca136877b28ee5361d0d82dd3a21e
```
`deploy-agent.sh` (already in the repository, used before): refuses a wrong hash, checks the bundle parses, copies the current bundle to `/opt/volta-agent/agent.mjs.bak-<timestamp>`, installs the new one, restarts the service, waits for a healthy answer and **restores the old bundle by itself** if it does not come up (exit code 2). It edits no environment file, no model, no tunnel, no firewall.

Then (own approval already covered by Step A's pattern; same commands, value 30, the variable already exists so replace instead of append):
```
sudo cp -p /etc/volta-agent/agent.env /etc/volta-agent/agent.env.bak-$(date +%Y%m%d-%H%M%S)
sudo sed -i 's/^AGENT_NEW_SESSIONS_PER_HOUR=.*/AGENT_NEW_SESSIONS_PER_HOUR=30/' /etc/volta-agent/agent.env
sudo systemctl restart volta-agent
```
(or edit the value in the same single restart as the bundle install if Step A was skipped; use the append form from Step A then.)

### Health checks (after either step)

AI server:
```
systemctl is-active volta-agent ollama                                   # active, active
curl -s -o /dev/null -w '%{http_code}\n' 127.0.0.1:8787/v1/health        # 401
sudo sha256sum /opt/volta-agent/agent.mjs                                # Step B: e3b40e6f...; Step A: unchanged
journalctl -u volta-agent -n 20 --no-pager                               # no error lines
curl -s 127.0.0.1:11434/api/ps | head -c 200                             # the production model still loaded
journalctl -t volta-health -n 3 --no-pager
```
Website server (path through the tunnel):
```
docker exec volta-web-1 node -e 'fetch("http://127.0.0.1:18787/v1/health").then(r=>console.log(r.status))'     # 401
docker ps --filter name=volta-ai-tunnel-new --format '{{.Status}}'
curl -s -o /dev/null -w '%{http_code}\n' https://valta.hexalyte.com/                                         # 200
```
Smoke test (mandatory after Step B, one conversation, no customer data; it uses one allowance slot): the same read-only chat probe used on 2026-11-13 (`docs/AI_PLAYWRIGHT_E2E_REPORT.md`): a guest asks "hi" and then "laptop for office work". Expected: HTTP 200, a greeting, then cards with prices and no "Something went wrong". Check twice from the website container using different client addresses: both must succeed (the real proof that guests are no longer sharing one counter). Do **not** hammer production to "test the cap"; the local table in section 4 is the proof.

### Rollback summary

| Situation | Action | Website change needed? |
|---|---|---|
| Step A went wrong | restore `agent.env.bak-<ts>`, restart | No |
| Step B bundle unhealthy | automatic (script restores the old bundle) | No |
| Step B bad behaviour found later | `sudo cp -p /opt/volta-agent/agent.mjs.bak-<timestamp> /opt/volta-agent/agent.mjs && sudo systemctl restart volta-agent` (the minimal bundle speaks exactly the same contract, so no website rollback is involved) | No |
| Nothing works at all | stop and report; do not touch the tunnel, firewall or model; the website degrades to its plain "assistant unavailable" message by design | No |

## 8. Do the website or the production model need changes?

- **Website: no.** It already signs the client address into every request; the Agent's contract version, request and response shapes are unchanged by the minimal bundle (verified by the diff). Whether its proxy overwrites `X-Forwarded-For` is a configuration *check* (C4), and only a change if the check fails (and then a separate approval).
- **Production model: no.** `AGENT_QWEN_MODEL` and Ollama are not touched; the model stays loaded; registry approvals unchanged.

## 9. Approvals required

1. Step 0 read-only server checks (an SSH session on both servers; no change). Needs the owner's key; I will not use the temporary migration key without you saying so.
2. **Step A**: editing `/etc/volta-agent/agent.env` and restarting `volta-agent`.
3. **Step B**: copying the bundle and the script, running `deploy-agent.sh` (restarts `volta-agent`), then the value change to 30 (another restart).
4. Separately, later: commit and merge of the uncommitted work (the minimal bundle is built from the committed tree plus two working-tree files, so the two edits should be committed in their own commit so that the live bundle is reproducible from a commit).

## 10. Open points (not hidden)

- Live values in section 1 are from the committed defaults and earlier checks, not re-read today (step 0 does that).
- The live bundle hash cannot be reproduced from source here; use the mandatory smoke test.
- Real hourly new-conversation volume is unknown.
- Proxy behaviour for the client address is unverified.
- IPv6 /64 rotation and shared (carrier) addresses are known limits of per-address keys.

## 11. Addendum after the read-only production audit (2026-11-14)

- The live bundle's full hash was read on the server: `a1d3f8aff347910285f8d8c0767b50a4c8ddf154d9885d7a79689fef6bed3e25`, byte-identical to the local `agent.m5c.mjs`. A build of commit `96db7c9` with the live import banner differs from it **only in comment path lines** (no code difference), so the live bundle is that commit's code.
- The earlier minimal bundle (`4b43f770…`) used a different import banner and absolute path comments. It was replaced by **`agent.min5.mjs`, SHA-256 `e3b40e6f4aa2cdf68f6387871a31dfd8b6fca136877b28ee5361d0d82dd3a21e`**, built with the live banner and relative paths (reproducible: two builds, same hash). A diff against the live bundle shows exactly the intended change (20 differing lines: the constant, `checkNewSession`, the one call site) and nothing else. Every hash in sections 6 and 7 above now refers to this file.
- Audit findings that change the plan: guests share one counter in the live code (confirmed in the live bundle); the live environment sets none of the rate limits (confirmed in the file and the running process); the proxy overwrites `X-Forwarded-For` on the public route, but the web container publishes port 8090 on all interfaces and external reachability is **unverified**; the server's SSH port has a UFW rate limit (more than about 6 connections in 30 s from one address is silently dropped), so connect one at a time.
