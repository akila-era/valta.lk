# Private staging Agent: security and script review

Date: 2026-11-14. Author: Agent D (Infrastructure and Security). Written for: the project owner first, then operators.

> **EXECUTION IS BLOCKED pending explicit owner approval.** The reviewed script, `tools/ops/stage-agent-second-instance.sh` (88 lines), has been read line by line and syntax-checked (`bash -n`: OK; no carriage returns). It has **not** been run and must not be run until the owner approves. The script file was **not edited**; corrected text is given below for the Principal Orchestrator to decide.

## 1. Verdict in plain words

The script is careful in the right places: it checks the file hash, refuses to start on a busy port, binds to loopback only, never prints a secret, limits memory, and does not touch the live Agent, Ollama, the firewall or sshd. It is **safe enough to approve only after two changes**: run the staging Agent as its **own** system user (so test code cannot read the live secrets), and add a few guards so a failed start cleans up after itself. The remaining findings are smaller. The biggest operational risk is not in the script but in sharing Ollama with the live Agent: a heavy test slows real shoppers.

## 2. Scope and method

Read: the script, `install-agent-new-server.sh`, `add-tunnel-user-new-server.sh`, `harden-new-ai-server.sh`, `install-ollama-new-server.sh`, `apps/agent/src/config.ts`, `http/server.ts`, `auth/hmac.ts`, `security/rate-limit.ts`, `main.ts`, `tests/real/preview-agent.ts`, `backend/site-transport.ts`, and the migration and staging documents. Facts about the server come only from those documents. Anything else is marked unknown.

## 3. Findings (numbered, with severity)

Severity: High = fix before approval; Medium = fix or accept in writing; Low = recommended; Info = observation.

### 1. High: staging runs as the same Unix user as the live Agent

The unit uses `User=voltaagent Group=voltaagent`, the live Agent's identity. Consequences, all following from ordinary Linux rules:
- The staging process is **new, not yet field-tested code**. As group `voltaagent` it can read `/etc/volta-agent/agent.env` (mode 640, group `voltaagent`), which holds the **live** chat HMAC key and catalogue credential. `ProtectSystem=strict` makes the file system read-only; it does not hide it.
- As the same uid it can read `/proc/<live pid>/environ` (same secrets) and send signals (`kill`) to the live Agent.
- The staging bundle file would be owned by the service user, so the process owns the code it runs (it cannot write it under `ProtectSystem=strict`, but ownership by root is the better rule).

Recommendation: a dedicated user `voltastage`, bundle and directory owned by root, env file `root:voltastage 640`, and `InaccessiblePaths=/etc/volta-agent /opt/volta-agent`, `ProtectProc=invisible`, `ProcSubset=pid` in the unit (systemd on Ubuntu 24.04 supports these; exact systemd version: unknown, recorded in the pre-check). Corrected script in section 5.

### 2. High (operational): shared Ollama and CPU; live shoppers can be slowed or refused

Both Agents call the same Ollama (`OLLAMA_MAX_LOADED_MODELS=1`, `NUM_PARALLEL=1`). Each Agent has its own queue (`queueMaxDepth` default 6, one running job); neither knows about the other, so Ollama sees up to two simultaneous requests and serves one at a time. Recorded evidence: a 4B benchmark ran with median model calls near 32 s and CPU near 99 percent; a 9B benchmark made the live Agent answer `503 ASSISTANT_BUSY`. The live deadline is 45 s (`AGENT_DEADLINE_MS`), so a staging call that holds the model for 30 s can push a live reply into a timeout.
The script's `Nice=10` and `CPUQuota=100%` limit the **Agent process**, which is light; the CPU consumer is the Ollama process, which these settings do not touch (finding 13).
Mitigation (not in the script, in the runbook and env): same model as live only (never change `AGENT_QWEN_MODEL` on staging while live differs, because with one loaded model Ollama would unload the live model and reload, 17 to 34 s cold load recorded), few and short requests, one at a time, a low staging queue (`AGENT_QUEUE_MAX_DEPTH=2`, `AGENT_MAX_IN_FLIGHT=4`), a quiet window chosen by the owner, and stop conditions on live health. No benchmark may run.

### 3. Medium: reuse of the production catalogue relay credential

The script copies `AGENT_CATALOGUE_URL`, `AGENT_CATALOGUE_KEY_ID` and `AGENT_CATALOGUE_SECRET` from the live env into the staging env. The credential is the pair that signs the Agent's read-only calls to the website relay `/api/internal/ai/erp` (`backend/site-transport.ts`: three GET routes; guest identity; order data never requested; `redirect: "error"`). Assessment:
- **Impact if staging leaks or misbehaves:** the attacker or bug can read **public catalogue data** only (settings, product list, one product), the same data any visitor sees. No customer or order data flows through this path by design. That bounds the harm.
- **But:** the relay cannot tell staging calls from live calls, so audit and rate limiting at the website are mixed, a buggy new bundle that loops on catalogue pages (up to 20 pages of 100 per refresh) can load the production website, and rotating the live credential silently breaks staging.
- The credential is copied into a **second file that survives `stop`** (only `remove` deletes it).
- **Silent downgrade:** if any of the three names is missing from the live env, `grep ... || true` copies nothing and the Agent falls back to the mock catalogue (`preview-agent.ts`: real catalogue only when `AGENT_CATALOGUE_URL` is set), so validation would look healthy against fake data.
Recommendations: (a) ask the website owner whether the relay supports a **second key id** (unknown from the repository); if yes, use a staging-only pair and do not copy the live one; (b) if not, the owner accepts the reuse in writing for the test window, and rotates nothing during it; (c) refuse to start unless all three names are present (corrected script); (d) run `remove`, not only `stop`, when the test ends so the copy is deleted.

### 4. Medium: a failed start leaves a crash-looping unit and partial state

`set -e` aborts the script at the first failing command. `systemctl is-active "$UNIT"` returns non-zero when the unit is not active, so a bundle that crashes at start stops the script **after** the unit file, the env file (with the copied credential) and the started service are in place. The unit has `Restart=on-failure RestartSec=5` and no start limit: systemd's default limit (5 starts in 10 s) is never reached at 5 s spacing, so a crash-looping bundle restarts forever, logging each time. A configuration error exits with code 1 (`main.ts`) and is restarted just the same.
Fix: `StartLimitIntervalSec=300`, `StartLimitBurst=3` in `[Unit]`, and an explicit wait-then-stop step in the script that prints the journal tail and stops the unit when the port does not open.

### 5. Medium: the "port already in use" guard can fail open

`if ss -tln | grep -q ":${PORT} "` runs under `pipefail`. `grep -q` exits at the first match and `ss` may receive SIGPIPE; the pipeline then returns 141 (non-zero), the `if` treats it as "not in use", and the guard silently passes. With output this small the race is rare, but it is the one guard whose purpose is to prevent two instances. The pattern also depends on the column layout. Fix: `[ -n "$(ss -H -tln "sport = :${PORT}")" ]` (no pipe).

### 6. Medium: hash is checked on one copy of the file and installed from another

The hash is verified on `$BUNDLE` (typically in `/tmp`, uploaded by `voltaadmin`), then `node --check` and later `install` read the path again. A writer with access to that file (the uploading admin, or any process of that user) could replace it between the check and the install. The expected hash is not validated as 64 hex characters, and a path with spaces would break the `sha256sum -c` line. Risk is low (trusted admin) but the fix is cheap: copy once into a root-owned temporary directory, verify and check **that copy**, install from the copy, and validate the hash format.

### 7. Medium: memory limit and V8 heap, and swap

`MemoryMax=400M` is a hard kill limit (the process is OOM-killed inside its own cgroup; this protects the live Agent and Ollama, which is good). But Node sizes its heap from host memory, not from the cgroup, so it may grow towards the limit instead of collecting, and then be killed. Also, with cgroup v2 the default swap limit is unlimited, so staging pages could use the shared 4 GB swap (swappiness 10, recorded). Recommendations (estimates, tune after the first observation): `NODE_OPTIONS=--max-old-space-size=256`, `MemoryHigh=300M` (throttles before the kill), `MemorySwapMax=0`, `OOMScoreAdjust=500` (if the whole host ever runs out, staging is killed first), `TasksMax=64`. Do **not** add `MemoryDenyWriteExecute=true`: V8 needs executable memory and the Agent would not start.

### 8. Low: `umask 077` leaks into the unit file

`umask 077` is set before the env file is written and never reset, so `/etc/systemd/system/volta-agent-staging.service` is created mode 600. systemd (root) still reads it, so nothing breaks, but it is non-standard and surprising. The corrected script sets `umask 022` globally and uses a subshell `( umask 077; ... )` for the secret file only, writing to a temporary name and moving it into place so the secret file never exists with looser modes.

### 9. Low: missing preconditions

No check that the script runs as root (the only hint is the unreadable live env message), that the **live Agent is active** before starting (a staging test beside an already-broken live Agent confuses diagnosis), or that enough memory is available. `curl` has no timeout (`-m`), and a fixed `sleep 3` replaces a wait for the port. The corrected script adds: root check, live Agent active check, `MemAvailable` floor (2000 MB, estimate, adjustable), `curl -m 5`, a 15 s wait loop.

### 10. Low: configuration parity is only partial

Only six variable names are copied. Any other live setting (for example queue depth, deadline, `AGENT_ENGLISH_MODE`, `AI_CHALLENGE_MODE`, `AGENT_CHAT_REPLIES` is copied but others are not) is absent in staging, so staging may behave differently from live for reasons unrelated to the new bundle. Note also: `AI_ASSISTANT_ENABLED` is not copied and is not needed **if** the bundle is built from `tests/real/preview-agent.ts` (which forces it to true; confirmed in the 2026-11-13 bundle `docs/m3b-raw/work/deploy/agent.real.mjs`). If the new bundle uses `main.ts`, the pipeline is "not enabled" and every chat fails with `AI_UNAVAILABLE`: unknown for the new bundle, so the runbook checks the health body for `"enabled":true` and `"ready":true` before any chat. The `grep` pattern also ignores lines such as `export NAME=` (unlikely in a systemd env file). Recommendation: compare variable **names** only (command in the runbook) and document every difference.

### 11. Low: `stop` and `remove` do not verify the result

`stop` prints the live Agent's state but not whether the staging port is closed. `remove` runs `disable --now ... || true`, then deletes the unit and directories; if the stop failed, a process keeps running from deleted files and still listens on 8788. `reset-failed` is not called, and the service user (if one is added) is left. Fix in the corrected script: verify the unit is inactive and the port closed before deleting, `reset-failed`, remove the user it created.

### 12. Low: unit hardening can be stronger, and shutdown is slow if stuck

The unit matches the live unit's sandbox (`NoNewPrivileges`, `ProtectSystem=strict`, `ProtectHome`, `PrivateTmp`), which is good. Additions that are compatible with a Node HTTP service that makes outbound HTTPS calls: `PrivateDevices`, `ProtectKernelTunables/Modules`, `ProtectControlGroups`, `RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX`, `RestrictNamespaces`, `LockPersonality`, `CapabilityBoundingSet=` (empty), `SyslogIdentifier`. `TimeoutStopSec=15` (the Agent handles SIGTERM, closes connections and exits 0: `main.ts`/`preview-agent.ts`; the default 90 s only matters if it hangs). Not added: an outbound IP allow-list (`IPAddressAllow`), because the website server's address is not in the repository (unknown); a host-level egress rule is a firewall change and a separate approval.

### 13. Info: the resource limits protect the wrong thing in one respect

`Nice=10` and `CPUQuota=100%` (one of six vCPUs) bound the Agent process only. `CPUWeight=20` is a better relative setting. Real protection for the live service is **test discipline** (finding 2), not these values.

### 14. Info: what the script does well (keep)

`set -euo pipefail` with `${1:?}` argument checks; hash verified before anything is installed; `node --check` parses without executing; bundle mode 644, env file 640 with group read only; secret generated with `openssl rand -hex 32` and never echoed (the `printf` builtin keeps it off any process argument list); key id `stg1` differs from the live key; host fixed to 127.0.0.1 (the Agent also refuses non-loopback); different port; started but **not enabled**, so a reboot does not bring it back; `Restart=on-failure` (a clean stop by SIGTERM exits 0 and is not restarted); logs go to the journal with no message text by design; no UFW, sshd, Ollama, model, tunnel, DNS or live-unit change; `rm -rf` targets are constants, not user input (with `set -u` they cannot be empty).

## 4. Boot, restart, shutdown, recovery (as written)

| Topic | Behaviour | Assessment |
|---|---|---|
| Boot | not enabled: staging does **not** return after reboot; unit and env files stay | Good; the leftover env file holds the copied credential until `remove` |
| Restart | `on-failure`, 5 s, no limit | Add start limit (finding 4) |
| Stop | SIGTERM, graceful close, exit 0, no restart | Good |
| Kill by OOM | SIGKILL counts as failure, restarts after 5 s; only the staging cgroup dies | Good, add `MemoryHigh` |
| Ollama down | the Agent answers `AI_UNAVAILABLE`; health `ollama.reachable=false` | Not a staging fault |
| Live Agent crash | independent unit; staging unaffected | Good (with separate user, also cannot be killed by staging) |
| Staging fills disk | none expected: no data files, journal only | Journal size on the server: unknown |

## 5. Recommended corrected script (text for the Orchestrator to decide; the file was NOT edited)

Changes: findings 1, 3, 4, 5, 6, 7, 8, 9, 11, 12. Not run, not even syntax-checked in its new form (a `bash -n` check is the first step if adopted).

```bash
#!/usr/bin/env bash
# PREPARED, NOT RUN (corrected proposal). Second, private Agent ("staging") on the AI server: 127.0.0.1:8788 only.
#   sudo bash stage-agent-second-instance.sh start  /tmp/agent.new.mjs <expected-sha256>
#   sudo bash stage-agent-second-instance.sh status
#   sudo bash stage-agent-second-instance.sh stop      # stops and disables staging; removes nothing
#   sudo bash stage-agent-second-instance.sh remove    # stops, deletes staging unit, directories, env file and the staging user
set -euo pipefail
umask 022
ACTION="${1:?usage: start <bundle> <sha256> | status | stop | remove}"
DIR=/opt/volta-agent-staging
ENVDIR=/etc/volta-agent-staging
UNIT=volta-agent-staging
SVC_USER=voltastage
LIVE_UNIT=volta-agent
LIVE_ENV=/etc/volta-agent/agent.env
NODE=/opt/node/current/bin/node
PORT=8788
MIN_AVAIL_MB=2000

[ "$(id -u)" -eq 0 ] || { echo "run as root"; exit 1; }
port_busy() { [ -n "$(ss -H -tln "sport = :$1")" ]; }

case "$ACTION" in
  start)
    BUNDLE="${2:?path to the new agent bundle}"; EXPECTED="${3:?expected sha256 of the bundle}"
    [[ "$EXPECTED" =~ ^[0-9a-f]{64}$ ]] || { echo "expected sha256 must be 64 lowercase hex characters"; exit 1; }
    [ -f "$BUNDLE" ] || { echo "missing $BUNDLE"; exit 1; }
    systemctl is-active --quiet "$LIVE_UNIT" || { echo "the live Agent is not active: not starting staging"; exit 1; }
    [ -r "$LIVE_ENV" ] || { echo "cannot read the live environment file"; exit 1; }
    for n in AGENT_CATALOGUE_URL AGENT_CATALOGUE_KEY_ID AGENT_CATALOGUE_SECRET OLLAMA_URL AGENT_QWEN_MODEL; do
      grep -q "^${n}=" "$LIVE_ENV" || { echo "live env lacks ${n}: staging would not match live (names only checked)"; exit 1; }
    done
    avail=$(awk '/^MemAvailable:/ {print int($2/1024)}' /proc/meminfo)
    [ "$avail" -ge "$MIN_AVAIL_MB" ] || { echo "only ${avail} MB available (need ${MIN_AVAIL_MB}): not starting"; exit 1; }
    if port_busy "$PORT"; then echo "port ${PORT} is already in use: is staging already running?"; exit 1; fi
    # Verify and install the SAME root-owned copy.
    WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
    cp -- "$BUNDLE" "$WORK/agent.mjs"
    echo "${EXPECTED}  ${WORK}/agent.mjs" | sha256sum -c - || { echo "HASH MISMATCH: not starting"; exit 1; }
    "$NODE" --check "$WORK/agent.mjs"
    id "$SVC_USER" >/dev/null 2>&1 || useradd -r -s /usr/sbin/nologin -M "$SVC_USER"
    install -d -o root -g root -m 755 "$DIR"
    install -o root -g root -m 644 "$WORK/agent.mjs" "$DIR/agent.mjs"
    install -d -o root -g "$SVC_USER" -m 750 "$ENVDIR"
    KEY="$(openssl rand -hex 32)"
    (
      umask 077
      {
        grep -E '^(OLLAMA_URL|AGENT_CHAT_REPLIES|AGENT_QWEN_MODEL|AGENT_CATALOGUE_URL|AGENT_CATALOGUE_KEY_ID|AGENT_CATALOGUE_SECRET)=' "$LIVE_ENV"
        printf 'AGENT_HMAC_KEYS=stg1:%s\nAGENT_HOST=127.0.0.1\nAGENT_PORT=%s\n' "$KEY" "$PORT"
        printf 'AGENT_RATE_IP_PER_MIN=300\nAGENT_RATE_SESSION_PER_MIN=300\nAGENT_RATE_IDENTITY_PER_MIN=300\nAGENT_NEW_SESSIONS_PER_HOUR=200\n'
        printf 'AGENT_QUEUE_MAX_DEPTH=2\nAGENT_MAX_IN_FLIGHT=4\n'
      } > "$ENVDIR/agent.env.new"
    )
    unset KEY
    chown root:"$SVC_USER" "$ENVDIR/agent.env.new"; chmod 640 "$ENVDIR/agent.env.new"
    mv -f "$ENVDIR/agent.env.new" "$ENVDIR/agent.env"
    cat > "/etc/systemd/system/${UNIT}.service" <<EOF
[Unit]
Description=VOLTA AI Agent (STAGING, loopback only, second instance)
After=network-online.target ollama.service
Wants=network-online.target
StartLimitIntervalSec=300
StartLimitBurst=3
[Service]
User=${SVC_USER}
Group=${SVC_USER}
EnvironmentFile=${ENVDIR}/agent.env
Environment=NODE_OPTIONS=--max-old-space-size=256
ExecStart=${NODE} ${DIR}/agent.mjs
Restart=on-failure
RestartSec=5
TimeoutStopSec=15
SyslogIdentifier=${UNIT}
MemoryHigh=300M
MemoryMax=400M
MemorySwapMax=0
TasksMax=64
OOMScoreAdjust=500
Nice=10
CPUWeight=20
CPUQuota=100%
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
PrivateDevices=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
ProtectProc=invisible
ProcSubset=pid
InaccessiblePaths=/etc/volta-agent /opt/volta-agent
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
RestrictNamespaces=true
LockPersonality=true
CapabilityBoundingSet=
[Install]
WantedBy=multi-user.target
EOF
    systemctl daemon-reload
    systemctl start "$UNIT" || true        # started, but NOT enabled: it does not survive a reboot
    ok=0
    for _ in $(seq 1 15); do
      if systemctl is-active --quiet "$UNIT" && port_busy "$PORT"; then ok=1; break; fi
      sleep 1
    done
    if [ "$ok" -ne 1 ]; then
      echo "staging did not come up; last journal lines (no secrets are logged):"
      journalctl -u "$UNIT" -n 15 --no-pager || true
      systemctl stop "$UNIT" || true
      echo "staging stopped; live Agent: $(systemctl is-active "$LIVE_UNIT" || true)"
      exit 1
    fi
    echo "unit: $(systemctl is-active "$UNIT")"
    echo "health: HTTP $(curl -s -m 5 -o /dev/null -w '%{http_code}' "127.0.0.1:${PORT}/v1/health") (401 = up, signature required)"
    ss -H -tlnp | grep -E ":${PORT} |:8787 " || true
    echo "live Agent still active: $(systemctl is-active "$LIVE_UNIT" || true)"
    ;;
  status)
    echo "staging: $(systemctl is-active "$UNIT" || true)"
    systemctl show "$UNIT" -p MemoryCurrent -p NRestarts -p ActiveEnterTimestamp 2>/dev/null || true
    ss -H -tlnp | grep -E ":${PORT} |:8787 " || true
    echo "live Agent: $(systemctl is-active "$LIVE_UNIT" || true)"
    ;;
  stop)
    systemctl stop "$UNIT" 2>/dev/null || true
    systemctl disable "$UNIT" 2>/dev/null || true
    if port_busy "$PORT"; then echo "WARNING: port ${PORT} is still listening"; fi
    echo "staging stopped; live Agent: $(systemctl is-active "$LIVE_UNIT" || true)"
    ;;
  remove)
    systemctl stop "$UNIT" 2>/dev/null || true
    systemctl disable "$UNIT" 2>/dev/null || true
    if port_busy "$PORT"; then echo "port ${PORT} still listening: not deleting; investigate"; exit 1; fi
    rm -f "/etc/systemd/system/${UNIT}.service"; systemctl daemon-reload; systemctl reset-failed "$UNIT" 2>/dev/null || true
    rm -rf "$DIR" "$ENVDIR"
    id "$SVC_USER" >/dev/null 2>&1 && userdel "$SVC_USER" || true
    echo "staging removed; live Agent: $(systemctl is-active "$LIVE_UNIT" || true)"
    ;;
  *) echo "unknown action"; exit 1 ;;
esac
```

Notes on the proposal: `MemorySwapMax=0` and `NODE_OPTIONS` are estimates to tune after the first run. `ProtectProc=invisible`, `ProcSubset=pid` and `InaccessiblePaths=` need systemd 247 or newer; Ubuntu 24.04 ships 255 (version on this server: unknown, confirm in the pre-check). The `grep` in the env block exits non-zero only if no name matches, which the earlier loop already ruled out; under `set -e` that would abort inside the subshell, which is the intended fail-closed behaviour. If the owner prefers a minimal change, the two changes that matter most are the separate user (finding 1) and the failed-start cleanup (finding 4).

## 6. Risk summary for the owner

| Risk | Before changes | After recommended changes |
|---|---|---|
| Staging code reads live secrets | Possible | Blocked (separate user, hidden paths) |
| Staging slows live shoppers | Possible | Reduced by discipline and queue limits; not eliminated (shared Ollama) |
| Production catalogue credential copied | Yes, persists after stop | Same value unless a second key exists; deleted by `remove`; owner sign-off |
| Crash loop leaves residue | Yes | Start limit and cleanup |
| Anything public | No | No |
| Firewall, sshd, Ollama, model changed | No | No |
