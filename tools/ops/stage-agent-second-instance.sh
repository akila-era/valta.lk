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
