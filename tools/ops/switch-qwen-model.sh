#!/usr/bin/env bash
# Switches the Agent's Qwen model on the AI SERVER between the two vetted tags, with safety checks and automatic rollback.
# Run on the AI server as root, AFTER the new Agent bundle (with AGENT_QWEN_MODEL support) is installed:
#   sudo bash switch-qwen-model.sh qwen3:4b-instruct-2507        # to the larger model
#   sudo bash switch-qwen-model.sh qwen3:1.7b-q4_K_M             # back to the default (also the rollback)
# It NEVER downloads a model (the tag must already be installed), never changes Ollama's own settings, and only edits one line of
# /etc/volta-agent/agent.env (after backing the file up). If the new model leaves too little memory, causes an out-of-memory kill, or
# the Agent is not healthy, it restores the previous setting and restarts the Agent.
set -euo pipefail
TAG="${1:?usage: switch-qwen-model.sh <qwen3:4b-instruct-2507 | qwen3:1.7b-q4_K_M>}"
case "$TAG" in qwen3:4b-instruct-2507|qwen3:1.7b-q4_K_M) ;; *) echo "refused: $TAG is not one of the two vetted tags"; exit 1;; esac
ENVF=/etc/volta-agent/agent.env
MINFREE_MB=400
[ -f "$ENVF" ] || { echo "missing $ENVF"; exit 1; }

echo "Installed models (read-only):"; curl -s --max-time 8 127.0.0.1:11434/api/tags | grep -o '"name":"[^"]*"' | head -10
curl -s --max-time 8 127.0.0.1:11434/api/tags | grep -q "\"name\":\"$TAG\"" || { echo "REFUSED: $TAG is not installed on this Ollama. This script never downloads models."; exit 1; }
grep -q 'AGENT_QWEN_MODEL' /opt/volta-agent/agent.mjs || { echo "REFUSED: the installed Agent bundle does not support AGENT_QWEN_MODEL yet. Deploy the new bundle first."; exit 1; }

OOM0="$(grep -E '^oom_kill ' /proc/vmstat | cut -d' ' -f2)"
BACKUP="$ENVF.bak-$(date +%Y%m%d-%H%M%S)"; cp -p "$ENVF" "$BACKUP"; echo "backup: $BACKUP"
PREV="$(grep -E '^AGENT_QWEN_MODEL=' "$ENVF" | cut -d= -f2- || true)"; echo "previous setting: ${PREV:-<unset, the default 1.7B>}"

revert() {
  echo "REVERTING to the previous setting"
  cp -p "$BACKUP" "$ENVF"; systemctl restart volta-agent; sleep 3; systemctl is-active volta-agent || true
  exit 2
}

if grep -qE '^AGENT_QWEN_MODEL=' "$ENVF"; then sed -i "s|^AGENT_QWEN_MODEL=.*|AGENT_QWEN_MODEL=$TAG|" "$ENVF"; else echo "AGENT_QWEN_MODEL=$TAG" >> "$ENVF"; fi
systemctl restart volta-agent
sleep 4
systemctl is-active --quiet volta-agent || { echo "Agent not active after restart"; revert; }

echo "Loading $TAG now (the first load can take about a minute; the live site shows a slow first reply)"
START=$(date +%s)
curl -s --max-time 240 127.0.0.1:11434/api/chat -d "{\"model\":\"$TAG\",\"stream\":false,\"think\":false,\"messages\":[{\"role\":\"user\",\"content\":\"Say hello in five words.\"}],\"options\":{\"num_ctx\":2048,\"num_predict\":24}}" -o /tmp/switch-smoke.json || { echo "model did not answer"; revert; }
echo "answered in $(( $(date +%s) - START )) s"
grep -q '"done":true' /tmp/switch-smoke.json || { echo "model reply incomplete"; revert; }

FREE="$(awk '/MemAvailable/ {printf "%d", $2/1024}' /proc/meminfo)"; OOM1="$(grep -E '^oom_kill ' /proc/vmstat | cut -d' ' -f2)"
echo "free memory with $TAG loaded: ${FREE} MB (floor ${MINFREE_MB} MB); OOM kills during switch: $((OOM1 - OOM0))"
[ "$FREE" -ge "$MINFREE_MB" ] || { echo "TOO LITTLE FREE MEMORY"; revert; }
[ "$OOM1" = "$OOM0" ] || { echo "OUT-OF-MEMORY KILL OCCURRED"; revert; }
systemctl is-active --quiet volta-agent || { echo "Agent stopped"; revert; }
curl -s --max-time 8 127.0.0.1:11434/api/ps | head -c 200; echo
rm -f /tmp/switch-smoke.json
echo "OK: Agent now uses $TAG. Roll back any time: sudo bash switch-qwen-model.sh qwen3:1.7b-q4_K_M"
