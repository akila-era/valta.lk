#!/usr/bin/env bash
# Deploys a new Agent bundle on the AI SERVER. Run on the AI server as root (or with sudo) AFTER copying the bundle to /tmp:
#   scp docs/m3b-raw/work/deploy/agent.mjs root@2.29.97.114:/tmp/agent.new.mjs
#   sudo bash deploy-agent.sh <expected-sha256>
# It changes only /opt/volta-agent/agent.mjs (after backing it up) and restarts volta-agent. It does not touch Ollama, models, the
# environment file, sshd, the firewall or any other service. If the new Agent does not come up healthy it restores the old file.
set -euo pipefail
EXPECTED="${1:?usage: deploy-agent.sh <expected-sha256-of-/tmp/agent.new.mjs>}"
NEW=/tmp/agent.new.mjs
LIVE=/opt/volta-agent/agent.mjs
BACKUP="/opt/volta-agent/agent.mjs.bak-$(date +%Y%m%d-%H%M%S)"

[ -f "$NEW" ] || { echo "missing $NEW"; exit 1; }
ACTUAL="$(sha256sum "$NEW" | cut -d' ' -f1)"
[ "$ACTUAL" = "$EXPECTED" ] || { echo "HASH MISMATCH: expected $EXPECTED got $ACTUAL. Not deploying."; exit 1; }
[ -f "$LIVE" ] || { echo "missing $LIVE"; exit 1; }
node_bin="$(command -v node || true)"; [ -n "$node_bin" ] || node_bin=/opt/node/current/bin/node
"$node_bin" --check "$NEW" || { echo "new bundle does not parse"; exit 1; }

echo "Loaded model before (should stay loaded):"; curl -s --max-time 5 127.0.0.1:11434/api/ps | head -c 300; echo
cp -p "$LIVE" "$BACKUP" && echo "backup: $BACKUP"
install -o voltaagent -g voltaagent -m 644 "$NEW" "$LIVE"
systemctl restart volta-agent

ok=0
for i in 1 2 3 4 5 6 7 8 9 10; do
  sleep 2
  if systemctl is-active --quiet volta-agent && curl -s --max-time 3 -o /dev/null -w '%{http_code}' 127.0.0.1:8787/v1/health 2>/dev/null | grep -qE '^(200|401|404)$'; then ok=1; break; fi
done
if [ "$ok" != 1 ]; then
  echo "NEW AGENT NOT HEALTHY: rolling back"
  cp -p "$BACKUP" "$LIVE" && systemctl restart volta-agent
  systemctl is-active volta-agent
  exit 2
fi
echo "volta-agent is active. Recent log:"; journalctl -u volta-agent -n 5 --no-pager
echo "Done. Rollback if needed: cp -p $BACKUP $LIVE && systemctl restart volta-agent"
