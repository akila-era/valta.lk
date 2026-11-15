#!/usr/bin/env bash
# PREPARED, NOT RUN: needs the owner's approval. Refuses to do anything unless I_HAVE_APPROVAL=yes (the prepared systemd unit sets it, so installing
# the unit is the approved act).
#
# Purpose:       every 5 minutes on the AI SERVER check the assistant's health and write a fixed-tag journal line on trouble (`journalctl -t volta-alert`),
#                and optionally POST the same short text to a webhook. NOTHING is sent anywhere unless the root-only file /etc/volta-agent/alert-webhook
#                exists and contains a URL (it does not exist today; no webhook is configured).
# Privacy:       reads only service state, counts and percentages. It never reads request bodies, message text, addresses, keys or the Agent's env file.
# Preconditions: journalctl, systemctl, curl, awk, logger; runs as root (journal access); state directory /var/lib/volta-alert (the unit creates it).
# Usage:         I_HAVE_APPROVAL=yes bash volta-health-check.sh   (one run = one check)
# Downtime:      none; read-only checks.
# Rollback:      systemctl disable --now volta-alert.timer; remove the unit files and /var/lib/volta-alert.
#
# What is measured and what is NOT (see alert-rules.md): service up, health answer, memory, disk, 5xx share and 429 count of /v1/chat from the Agent's
# own journal lines, and a heuristic for the tunnel. NOT measurable here: queue depth and the new-session ceiling (those counters live in the Agent's
# memory and are reachable only through the signed /v1/metrics call or an Agent change; reading the signing key in a shell script was rejected as
# unnecessary exposure of a secret).
set -uo pipefail
[ "${I_HAVE_APPROVAL:-}" = "yes" ] || { echo "PREPARED, NOT RUN: set I_HAVE_APPROVAL=yes only with the owner's approval." >&2; exit 2; }

STATE_DIR="${STATE_DIRECTORY:-/var/lib/volta-alert}"
WEBHOOK_FILE=/etc/volta-agent/alert-webhook
COOLDOWN_SEC=1800          # the same alert is repeated at most every 30 minutes
MEM_MIN_KB=1048576         # 1 GB
DISK_MAX_PCT=85
WINDOW=5min
mkdir -p "$STATE_DIR"
host="$(hostname -s)"
now="$(date +%s)"

notify() { # $1 = text
  logger -t volta-alert -p daemon.crit -- "$1"
  if [ -s "$WEBHOOK_FILE" ]; then
    url="$(head -n1 "$WEBHOOK_FILE")"
    # JSON text built without any external input beyond fixed names and numbers.
    curl -fsS -m 10 -X POST -H 'content-type: application/json' --data "{\"text\":\"$1\"}" "$url" >/dev/null 2>&1 || logger -t volta-alert -p daemon.err "webhook delivery failed"
  fi
}

alert() { # $1 = name, $2 = detail (numbers only)
  local f="$STATE_DIR/$1" last=0
  [ -f "$f" ] && last="$(cat "$f")"
  if [ $((now - last)) -ge "$COOLDOWN_SEC" ]; then
    notify "ALERT $host $1 $2"
    echo "$now" > "$f"
  fi
}

resolved() { # $1 = name
  local f="$STATE_DIR/$1"
  [ -f "$f" ] && { rm -f "$f"; notify "RESOLVED $host $1"; }
}

check() { # $1 = name, $2 = condition exit status (0 = healthy), $3 = detail
  if [ "$2" -eq 0 ]; then resolved "$1"; else alert "$1" "$3"; fi
}

# 1. Services and the Agent's answer (a signed API: 401 without a signature is the healthy answer).
systemctl is-active --quiet volta-agent; check agent_service_down $? "volta-agent not active"
systemctl is-active --quiet ollama;      check ollama_service_down $? "ollama not active"
code="$(curl -s -o /dev/null -m 3 -w '%{http_code}' http://127.0.0.1:8787/v1/health || true)"
[ "$code" = 401 ]; check agent_health_bad $? "health answered $code (expected 401)"

# 2. Memory and disk.
avail_kb="$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo)"
[ "${avail_kb:-0}" -ge "$MEM_MIN_KB" ]; check memory_low $? "available_kb=$avail_kb"
disk_pct="$(df --output=pcent / | tail -1 | tr -dc '0-9')"
[ "${disk_pct:-100}" -le "$DISK_MAX_PCT" ]; check disk_high $? "used_pct=$disk_pct"

# 3. Chat outcomes in the last window, from the Agent's own journal lines (JSON with route and status; no message text exists there).
chat="$(journalctl -u volta-agent --since "-$WINDOW" --no-pager -o cat 2>/dev/null | grep '"route":"/v1/chat"' | grep -oE '"status":[0-9]+' | cut -d: -f2)"
total="$(printf '%s\n' "$chat" | grep -c . || true)"
n5xx="$(printf '%s\n' "$chat" | grep -cE '^5' || true)"
n429="$(printf '%s\n' "$chat" | grep -c '^429$' || true)"
if [ "$total" -ge 5 ]; then
  [ $((n5xx * 100 / total)) -lt 20 ]; check chat_5xx_rate_high $? "5xx=$n5xx of $total in $WINDOW"
else
  resolved chat_5xx_rate_high
fi
[ "$n429" -lt 5 ]; check chat_rate_limited_often $? "429=$n429 in $WINDOW (a guest cap or abuse is refusing shoppers)"

# 4. Tunnel heuristic: the forward-only user's ssh session processes. UNVERIFIED until run: it is assumed that sshd keeps a process owned by
#    voltatunnel while the website's tunnel container is connected.
tun="$(ps -u voltatunnel -o comm= 2>/dev/null | grep -c sshd || true)"
[ "${tun:-0}" -ge 1 ]; check tunnel_session_missing $? "sshd processes for voltatunnel=$tun"

exit 0
