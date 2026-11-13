#!/usr/bin/env bash
# PREPARED, NOT RUN. Starts a SECOND, private Agent instance ("staging") on the AI server so a new Agent bundle can be validated agent-first
# while the live Agent keeps serving. It listens on 127.0.0.1:8788 only (no public port, no firewall change, no sshd change), has its own
# environment file and its own signing key (generated here, never printed), a memory cap and a low CPU priority. It does NOT touch the live
# unit, the live bundle, Ollama, the model, the website tunnel or DNS.
#
#   sudo bash stage-agent-second-instance.sh start  /tmp/agent.new.mjs <expected-sha256>
#   sudo bash stage-agent-second-instance.sh status
#   sudo bash stage-agent-second-instance.sh stop            # stops and disables the staging unit; removes nothing else
#   sudo bash stage-agent-second-instance.sh remove          # also deletes /opt/volta-agent-staging and /etc/volta-agent-staging (staging only)
#
# Validation then runs on the server itself (signed requests to 127.0.0.1:8788, see docs/AI_PRIVATE_STAGING_READINESS.md), so the website is
# not involved at all. Reaching it from the website would need a tunnel change and is a separate approval.
set -euo pipefail
ACTION="${1:?usage: start <bundle> <sha256> | status | stop | remove}"
DIR=/opt/volta-agent-staging
ENVDIR=/etc/volta-agent-staging
UNIT=volta-agent-staging
LIVE_ENV=/etc/volta-agent/agent.env
NODE=/opt/node/current/bin/node
PORT=8788

case "$ACTION" in
  start)
    BUNDLE="${2:?path to the new agent bundle}"; EXPECTED="${3:?expected sha256 of the bundle}"
    [ -f "$BUNDLE" ] || { echo "missing $BUNDLE"; exit 1; }
    echo "${EXPECTED}  ${BUNDLE}" | sha256sum -c - || { echo "HASH MISMATCH: not starting"; exit 1; }
    "$NODE" --check "$BUNDLE"
    [ -r "$LIVE_ENV" ] || { echo "cannot read the live environment file (run as root)"; exit 1; }
    # Refuse to share the live port or to start twice.
    if ss -tln | grep -q ":${PORT} "; then echo "port ${PORT} is already in use: is staging already running?"; exit 1; fi
    id voltaagent >/dev/null 2>&1 || { echo "user voltaagent is missing"; exit 1; }
    install -d -o voltaagent -g voltaagent -m 755 "$DIR"
    install -o voltaagent -g voltaagent -m 644 "$BUNDLE" "$DIR/agent.mjs"
    install -d -m 750 -o root -g voltaagent "$ENVDIR"
    umask 077
    {
      # Only what the staging Agent needs: the model and catalogue settings of the live Agent (names copied, values never printed), a NEW signing key, a different port.
      grep -E '^(OLLAMA_URL|AGENT_CHAT_REPLIES|AGENT_QWEN_MODEL|AGENT_CATALOGUE_URL|AGENT_CATALOGUE_KEY_ID|AGENT_CATALOGUE_SECRET)=' "$LIVE_ENV" || true
      printf 'AGENT_HMAC_KEYS=stg1:%s\nAGENT_HOST=127.0.0.1\nAGENT_PORT=%s\nAGENT_RATE_IP_PER_MIN=300\nAGENT_RATE_SESSION_PER_MIN=300\nAGENT_RATE_IDENTITY_PER_MIN=300\nAGENT_NEW_SESSIONS_PER_HOUR=200\n' "$(openssl rand -hex 32)" "$PORT"
    } > "$ENVDIR/agent.env"
    chown root:voltaagent "$ENVDIR/agent.env"; chmod 640 "$ENVDIR/agent.env"
    cat > "/etc/systemd/system/${UNIT}.service" <<EOF
[Unit]
Description=VOLTA AI Agent (STAGING, loopback only, second instance)
After=network-online.target ollama.service
[Service]
User=voltaagent
Group=voltaagent
EnvironmentFile=${ENVDIR}/agent.env
ExecStart=${NODE} ${DIR}/agent.mjs
Restart=on-failure
RestartSec=5
MemoryMax=400M
Nice=10
CPUQuota=100%
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
[Install]
WantedBy=multi-user.target
EOF
    systemctl daemon-reload
    systemctl start "$UNIT"        # started, but NOT enabled: it does not survive a reboot unless someone enables it on purpose
    sleep 3
    systemctl is-active "$UNIT"
    echo "health: HTTP $(curl -s -o /dev/null -w '%{http_code}' 127.0.0.1:${PORT}/v1/health) (401 = up, signature required)"
    ss -tlnp | grep -E ":${PORT} |:8787 " || true
    echo "live Agent still active: $(systemctl is-active volta-agent)"
    ;;
  status)
    systemctl is-active "$UNIT" || true
    ss -tlnp | grep -E ":${PORT} |:8787 " || true
    systemctl is-active volta-agent || true
    ;;
  stop)
    systemctl disable --now "$UNIT" 2>/dev/null || systemctl stop "$UNIT" || true
    echo "staging stopped; live Agent: $(systemctl is-active volta-agent)"
    ;;
  remove)
    systemctl disable --now "$UNIT" 2>/dev/null || true
    rm -f "/etc/systemd/system/${UNIT}.service"; systemctl daemon-reload
    rm -rf "$DIR" "$ENVDIR"
    echo "staging removed; live Agent: $(systemctl is-active volta-agent)"
    ;;
  *) echo "unknown action"; exit 1 ;;
esac
