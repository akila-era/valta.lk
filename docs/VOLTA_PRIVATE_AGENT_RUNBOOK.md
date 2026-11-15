# Private staging Agent: operator runbook

Date: 2026-11-14. Author: Agent D (Infrastructure and Security). Written for: the project owner (sections 0 to 2), then the operator.

> **EXECUTION IS BLOCKED pending explicit owner approval.** Nothing in this runbook has been run. The script `tools/ops/stage-agent-second-instance.sh` was only syntax-checked. Do not execute any step, including the read-only ones on the server, until the owner has given the approval recorded in section 1. Read `VOLTA_PRIVATE_AGENT_SECURITY_REVIEW.md` first: it recommends script changes (separate user, failed-start cleanup) that the Principal Orchestrator must decide before this runbook is used. Commands below work with the script as written unless marked "corrected script".

## 0. What this does, in plain words

It starts a second, hidden copy of the Agent on the AI server, tests it from the server itself with signed messages, and then removes it. No shopper can reach it, no public port opens, the website, tunnel, firewall, Ollama and models are not changed. The only shared thing is Ollama and the processor, so the test is small and has stop conditions.

## 1. OWNER APPROVAL GATE (before step 1)

Do not start until all of these are recorded in writing by the owner (date, time, name):

- [ ] I approve running the staging script on the AI server in a quiet window of my choosing: from ______ to ______.
- [ ] I accept the script changes the Orchestrator decided (separate user, failed-start cleanup) or accept the risks in the security review for the script as written.
- [ ] I accept or reject reuse of the production catalogue credential (security review finding 3). If a separate key exists, its name is: ______.
- [ ] I confirm no benchmark, model download, browser worker, voice or indexing job will run in the window.
- [ ] I understand shared Ollama means live shoppers could slow down, and that the operator will stop at the first stop condition.
- [ ] Reviewed bundle commit and SHA-256 are: ______ / ______ (computed at build time, from the reviewed commit).
- [ ] Who is on call and can run the rollback: ______.

## 2. Stop conditions (apply at every step)

Stop immediately and go to `VOLTA_PRIVATE_AGENT_ROLLBACK.md` if:

| Condition | Where seen |
|---|---|
| Live `volta-agent` not `active`, or its `NRestarts` rose | steps 2, 5, 8 |
| Unsigned probe of 8787 does not give 401 | steps 2, 5, 8 |
| Any listener other than SSH on a non-loopback address | steps 2, 5 |
| `MemAvailable` below 3000 MB, or swap more than 500 MB above baseline | every monitor line |
| Staging `NRestarts` above 0, or `MemoryCurrent` above 350 MB | steps 5 to 7 |
| One-minute load above 5 for 2 minutes | monitor |
| A staging reply takes more than 40 s | step 7 |
| Hash mismatch, unexpected output, or any command fails in a way this runbook does not describe | any |
| Staging health shows `"ready":false` or `"enabled":false` | step 6 |

If unsure, stop. Doing nothing is always safe.

## 3. Step 1: pre-check, read-only, and save the baseline

On your workstation: `ssh voltaadmin@<AI server address>` (key only; the address is not in this document). Create a baseline folder: `mkdir -p ~/stg-baseline && cd ~/stg-baseline`.

```
date -u +%FT%TZ | tee time.txt
systemctl is-active volta-agent ollama                       # active, active
systemctl show volta-agent -p ActiveEnterTimestamp -p NRestarts | tee live-unit.txt
systemctl show ollama -p ActiveEnterTimestamp -p NRestarts | tee ollama-unit.txt
sudo sha256sum /opt/volta-agent/agent.mjs /etc/systemd/system/volta-agent.service /etc/volta-agent/agent.env | tee live-hashes.txt
sudo sha256sum /etc/ssh/sshd_config.d/* | tee sshd-hashes.txt
sudo sshd -T -C user=voltatunnel,host=x,addr=1.1.1.1 | grep -E '^(allowtcpforwarding|permitopen|forcecommand|permittty) ' | tee tunnel-rules.txt
sudo ufw status verbose | tee ufw.txt
ss -H -tlnp | tee listeners.txt
ollama list | tee models.txt
ollama ps | tee ollama-ps.txt
free -m | tee mem.txt; uptime | tee load.txt; df -h / | tee disk.txt
systemctl --version | head -1; systemctl list-timers --no-pager | head -12
journalctl --disk-usage
curl -s -m 5 -o /dev/null -w 'live health: %{http_code}\n' 127.0.0.1:8787/v1/health        # 401
id voltaagent; id voltastage 2>&1 | head -1                                        # voltastage: no such user (before)
sudo grep -c . /etc/volta-agent/agent.env                                          # a line count only
for n in OLLAMA_URL AGENT_CHAT_REPLIES AGENT_QWEN_MODEL AGENT_CATALOGUE_URL AGENT_CATALOGUE_KEY_ID AGENT_CATALOGUE_SECRET; do sudo grep -q "^$n=" /etc/volta-agent/agent.env && echo "present: $n" || echo "MISSING: $n"; done
sudo cut -d= -f1 /etc/volta-agent/agent.env | sort                                 # variable NAMES only; never print values
```

Expected: both services `active`; live health 401; listeners include `0.0.0.0:22` / `[::]:22` and 127.0.0.1 for 8787 and 11434 (and possibly resolver sockets on 127.0.0.53/54: record them) and nothing on 8788; `tunnel-rules.txt` shows `permitopen 127.0.0.1:8787`; all six names `present`. **If a catalogue name is MISSING, stop**: the Agent would silently use the mock catalogue.

Never run `cat` on `agent.env`, `agent.env.new` or any key. `cut -d= -f1` prints names only.

Check that memory and load are quiet: `MemAvailable` (`awk '/MemAvailable/{print int($2/1024)" MB"}' /proc/meminfo`) should be well above 3000 MB (about 9000 MB is expected with the 1.7B model loaded: estimate) and the load average below 2 (estimate). Check with the owner that the quiet window has started.

## 4. Step 2: copy the bundle and the script, verify the hash

From the workstation (the bundle was built from the reviewed commit; its SHA-256 was recorded at build):

```
sha256sum agent.new.mjs                        # compare with the owner-approved value
scp agent.new.mjs stage-agent-second-instance.sh voltaadmin@<AI server address>:/tmp/
ssh voltaadmin@<AI server address> 'sha256sum /tmp/agent.new.mjs; bash -n /tmp/stage-agent-second-instance.sh && echo script-syntax-ok'
```

Expected: the two hashes are identical to the approved value; `script-syntax-ok`. Different hash: stop, delete `/tmp/agent.new.mjs`, do not continue. Also confirm the script's own SHA-256 equals the value the Orchestrator approved (record it in the approval).

Bundle entry check (read-only, on the server): `grep -c 'AI_ASSISTANT_ENABLED: "true"' /tmp/agent.new.mjs` should print 1 or more. If 0, the bundle was probably built from `main.ts` (pipeline not enabled) and chat would fail: stop and ask.

## 5. Step 3: start (the first action that changes the server)

```
sudo bash /tmp/stage-agent-second-instance.sh start /tmp/agent.new.mjs <approved-sha256>
```

Expected output, in order (script as written): `agent.mjs: OK` (or the `/tmp/agent.new.mjs: OK` line); `active`; `health: HTTP 401 (401 = up, signature required)`; two `ss` lines, one for `127.0.0.1:8788` and one for `127.0.0.1:8787`; `live Agent still active: active`. With the corrected script: the same, preceded by its preconditions.

Stop conditions: any `HASH MISMATCH`; `port 8788 is already in use`; a missing-file or missing-user message; the health code is anything but 401 (000 means it did not start: run `sudo journalctl -u volta-agent-staging -n 20 --no-pager`, then roll back); `live Agent still active` not `active`.

## 6. Step 4: isolation checks

```
ss -H -tlnp | tee ~/stg-baseline/listeners-after.txt
diff <(awk '{print $4}' ~/stg-baseline/listeners.txt | sort) <(awk '{print $4}' ~/stg-baseline/listeners-after.txt | sort)
```

Expected diff: only `127.0.0.1:8788` added. No `0.0.0.0:8788`, no `*:8788`, no `[::]:8788`. The only public listener remains SSH (port 22).

```
sudo ufw status verbose | diff - ~/stg-baseline/ufw.txt && echo ufw-unchanged
sudo sha256sum /etc/ssh/sshd_config.d/* | diff - ~/stg-baseline/sshd-hashes.txt && echo sshd-unchanged
sudo sshd -T -C user=voltatunnel,host=x,addr=1.1.1.1 | grep -E '^(allowtcpforwarding|permitopen|forcecommand|permittty) ' | diff - ~/stg-baseline/tunnel-rules.txt && echo tunnel-rules-unchanged
sudo sha256sum /opt/volta-agent/agent.mjs /etc/systemd/system/volta-agent.service /etc/volta-agent/agent.env | diff - ~/stg-baseline/live-hashes.txt && echo live-files-unchanged
systemctl show volta-agent -p ActiveEnterTimestamp -p NRestarts | diff - ~/stg-baseline/live-unit.txt && echo live-not-restarted
systemctl show ollama -p ActiveEnterTimestamp -p NRestarts | diff - ~/stg-baseline/ollama-unit.txt && echo ollama-not-restarted
```

Expected: each line prints its `...-unchanged` / `...-not-restarted` text and nothing else. Any diff output: stop.

Process and file owner checks (names only):

```
ps -o user=,pid=,rss=,args= -C node            # staging process with its user and RSS in KB (about 100000 to 150000: estimate); live process also listed
sudo ls -l /opt/volta-agent-staging /etc/volta-agent-staging          # agent.mjs 644 root:root (corrected) or voltaagent (as written); agent.env 640 root:<service group>
systemctl show volta-agent-staging -p User -p MemoryMax -p Nice -p CPUQuotaPerSecUSec -p Restart -p UnitFileState
```

Expected: `UnitFileState=disabled` (not enabled), `MemoryMax=419430400`, `Nice=10`, `CPUQuotaPerSecUSec=1s`, `Restart=on-failure`. With the corrected script, `User=voltastage`. With the script as written the user is `voltaagent`; record that the owner accepted finding 1.

Corrected script only: `sudo -u voltastage cat /etc/volta-agent/agent.env` must fail with permission denied (it prints nothing; do not use it on a script as written).

## 7. Step 5: signed requests from the server itself

Create the helper (it reads the staging key from the file and never prints it; do not copy it elsewhere). The canonical string follows `apps/agent/src/auth/hmac.ts`; verify the helper against `signRequest` on a development machine before approval (not done here).

```
sudo install -d -m 700 /root/volta-staging-check
sudo tee /root/volta-staging-check/sign.mjs >/dev/null <<'EOF'
import { createHash, createHmac, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
const [, , method, path, bodyFile] = process.argv;
const env = readFileSync("/etc/volta-agent-staging/agent.env", "utf8");
const line = env.split("\n").find((l) => l.startsWith("AGENT_HMAC_KEYS="));
const [keyId, secret] = line.slice("AGENT_HMAC_KEYS=".length).trim().split(":");
const body = bodyFile ? readFileSync(bodyFile) : Buffer.alloc(0);
const identity = process.env.IDENT ?? "anon";
const clientIp = process.env.CLIENT_IP ?? "198.51.100.250";
const ts = String(Math.floor(Date.now() / 1000));
const nonce = process.env.NONCE ?? randomBytes(16).toString("hex");
const canonical = [ts, nonce, method.toUpperCase(), path, identity, clientIp, createHash("sha256").update(body).digest("hex")].join("\n");
const signature = createHmac("sha256", process.env.WRONG_KEY ? "x".repeat(64) : secret).update(canonical).digest("hex");
const headers = { "x-volta-key-id": keyId, "x-volta-timestamp": ts, "x-volta-nonce": nonce, "x-volta-identity": identity, "x-volta-client-ip": clientIp, "x-volta-signature": signature };
if (bodyFile) headers["content-type"] = "application/json";
const t = Date.now();
const res = await fetch("http://127.0.0.1:8788" + path, { method, headers, body: bodyFile ? body : undefined, signal: AbortSignal.timeout(50000) });
console.log(res.status, `${Date.now() - t} ms`);
console.log((await res.text()).slice(0, 700));
EOF
```

Health (signed), expected `200`, body containing `"ok":true`, `"enabled":true`, `"ready":true`, `"ollama":{"reachable":true,...}`, `"contractVersion"`:

```
sudo /opt/node/current/bin/node /root/volta-staging-check/sign.mjs GET /v1/health
```

Stop if `ready` or `enabled` is false (step 5 stop condition) or the status is not 200.

Auth negative tests, all expected `401`:

```
curl -s -m 5 -o /dev/null -w '%{http_code}\n' 127.0.0.1:8788/v1/health                       # unsigned
sudo WRONG_KEY=1 /opt/node/current/bin/node /root/volta-staging-check/sign.mjs GET /v1/health   # wrong key
sudo NONCE=00000000000000000000000000000001 /opt/node/current/bin/node /root/volta-staging-check/sign.mjs GET /v1/health   # first use: 200
sudo NONCE=00000000000000000000000000000001 /opt/node/current/bin/node /root/volta-staging-check/sign.mjs GET /v1/health   # replay: 401
```

Chat tests, **one at a time, waiting for each answer, never in parallel**. Create bodies (the session id must be 16 to 64 letters, digits, `_` or `-`):

```
sudo bash -c 'cd /root/volta-staging-check
printf %s "{\"sessionId\":\"stgcheck-0001-aaaaaaaa\",\"message\":\"hello\",\"contractVersion\":\"1.2\"}" > b1.json
printf %s "{\"sessionId\":\"stgcheck-0001-aaaaaaaa\",\"message\":\"show me phones under 150000\",\"contractVersion\":\"1.2\"}" > b2.json
printf %s "{\"sessionId\":\"stgcheck-0001-aaaaaaaa\",\"message\":\"what is the weather in Colombo today\",\"contractVersion\":\"1.2\"}" > b3.json'
sudo /opt/node/current/bin/node /root/volta-staging-check/sign.mjs POST /v1/chat /root/volta-staging-check/b1.json
sudo /opt/node/current/bin/node /root/volta-staging-check/sign.mjs POST /v1/chat /root/volta-staging-check/b2.json
sudo /opt/node/current/bin/node /root/volta-staging-check/sign.mjs POST /v1/chat /root/volta-staging-check/b3.json
```

Expected: `200`, a JSON reply with `reply`, `cards` (b2 should contain product cards from the real catalogue if the catalogue relay answers), `meta`; b3 politely declines live information. Router answers are fast; model-backed answers may take tens of seconds (recorded: model calls near 30 s on the 4B; 1.7B speed unknown). The fuller message set (three languages, multi-turn, budget, fit codes, contract 1.1 and 1.2, off-site refusal) follows `docs/AI_PRIVATE_STAGING_READINESS.md` section 4 and `apps/agent/tests/real/remote-smoke.ts`; keep it short and sequential.

Session isolation (expected: second call is `400` or `422` style `VALIDATION_FAILED` with "This session id cannot be used"):

```
sudo IDENT=cust:stgtest /opt/node/current/bin/node /root/volta-staging-check/sign.mjs POST /v1/chat /root/volta-staging-check/b1.json
```

(The session `stgcheck-0001-aaaaaaaa` was first used by `anon` in the earlier call.) The status code of `VALIDATION_FAILED` is defined in `apps/agent/src/errors.ts`; read it from the response, not from this document.

## 8. Step 6 and 7: monitor while testing

In a second SSH session, repeat every 30 to 60 seconds during the tests (read-only):

```
awk '/MemAvailable/{print "avail MB", int($2/1024)}' /proc/meminfo; free -m | awk '/Swap/{print "swap used MB", $3}'; uptime
systemctl show volta-agent-staging -p MemoryCurrent -p NRestarts
systemctl is-active volta-agent; curl -s -m 5 -o /dev/null -w 'live health %{http_code}\n' 127.0.0.1:8787/v1/health
ollama ps
journalctl -u volta-agent-staging -n 10 --no-pager
journalctl -u volta-agent -n 10 --no-pager
```

Expected: available memory far above 3000 MB, staging `MemoryCurrent` under about 150 MB (estimate), `NRestarts=0`, live `active` and 401, `ollama ps` showing only the live model. Journal lines contain route, status, latency, identity kind and error codes only; if you ever see message text or key material in a journal line, stop and report it.

## 9. Step 8: end the test

```
sudo bash /tmp/stage-agent-second-instance.sh stop
sudo bash /tmp/stage-agent-second-instance.sh remove       # also deletes the env file with the copied catalogue credential
sudo rm -rf /root/volta-staging-check /tmp/agent.new.mjs
```

Then run every check of section 4 of `VOLTA_PRIVATE_AGENT_ROLLBACK.md` and compare with `~/stg-baseline`. Do not use `stop` alone as the finish: it leaves the credential copy on disk. Then delete `~/stg-baseline` only after the owner has seen the comparison (it holds hashes and names, no secrets). Report to the owner: start and end time, what was tested, any stop condition, peak memory seen, and whether anything differed from the baseline.

## 10. After the test

Staging is not enabled at boot, so a reboot would also leave nothing running. Any follow-up (testing through the website, enabling anything, deploying the bundle to live) is a **separate approval** with its own plan; see `VOLTA_PRIVATE_AGENT_ARCHITECTURE.md` section 5.
