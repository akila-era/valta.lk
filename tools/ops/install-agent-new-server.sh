#!/usr/bin/env bash
# Installs the Agent on the NEW AI server as a loopback-only service, with a FRESH test HMAC key generated on the server (never printed).
# Needs /tmp/agent.new.mjs already copied. Run as root:  sudo bash install-agent-new-server.sh <expected-sha256> [qwen-tag]
set -euo pipefail
EXPECTED="${1:?expected sha256}"; TAG="${2:-qwen3:1.7b-q4_K_M}"
echo "${EXPECTED}  /tmp/agent.new.mjs" | sha256sum -c -
NODE=/opt/node/current/bin/node; "$NODE" --check /tmp/agent.new.mjs
id voltaagent >/dev/null 2>&1 || useradd -r -s /usr/sbin/nologin -M voltaagent
install -d -o voltaagent -g voltaagent -m 755 /opt/volta-agent
install -o voltaagent -g voltaagent -m 644 /tmp/agent.new.mjs /opt/volta-agent/agent.mjs
install -d -m 750 -o root -g voltaagent /etc/volta-agent
if [ ! -f /etc/volta-agent/agent.env ]; then
  umask 077
  printf 'AGENT_HMAC_KEYS=test1:%s\nAGENT_HOST=127.0.0.1\nAGENT_PORT=8787\nOLLAMA_URL=http://127.0.0.1:11434\nAGENT_CHAT_REPLIES=true\nAGENT_QWEN_MODEL=%s\n' "$(openssl rand -hex 32)" "$TAG" > /etc/volta-agent/agent.env
  chown root:voltaagent /etc/volta-agent/agent.env; chmod 640 /etc/volta-agent/agent.env
fi
cat > /etc/systemd/system/volta-agent.service <<EOF
[Unit]
Description=VOLTA AI Agent (loopback only)
After=network-online.target ollama.service
[Service]
User=voltaagent
Group=voltaagent
EnvironmentFile=/etc/volta-agent/agent.env
ExecStart=$NODE /opt/volta-agent/agent.mjs
Restart=always
RestartSec=3
MemoryMax=600M
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload; systemctl enable --now volta-agent; sleep 3
systemctl is-active volta-agent
echo "health HTTP: $(curl -s -o /dev/null -w '%{http_code}' 127.0.0.1:8787/v1/health) (401 = up, signature required)"
ss -tlnp | grep -E ':8787|:11434'
journalctl -u volta-agent -n 4 --no-pager
