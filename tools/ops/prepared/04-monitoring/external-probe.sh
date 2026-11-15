#!/usr/bin/env bash
# PREPARED, NOT RUN: needs the owner's approval. Refuses to do anything unless I_HAVE_APPROVAL=yes.
#
# Purpose:       an uptime probe that runs from a DIFFERENT host than the two servers (a small VPS, a monitoring service's runner, or a scheduled job),
#                so an outage of either server, nginx, the tunnel or the Agent is noticed from outside. Run it every 5 minutes from cron or a timer.
# Modes:         PROBE_MODE=basic (default): HTTPS GET of the home page, expect 200 within 10 s. No assistant traffic, no cost to the new-session allowance.
#                PROBE_MODE=chat: additionally one assistant message through the PUBLIC website route with a persistent cookie jar, so every run
#                reuses the SAME conversation (a new conversation each run would count against the per-address new-conversation allowance and trip the
#                limit it is supposed to watch: the Agent forgets a conversation idle for 30 minutes and after 8 hours, so about one run in 96 starts a
#                new one). The message is the greeting "hi", carries no customer data, and the router answers it without a model.
# Alerting:      journal/stdout line `volta-probe FAIL <check> <detail>`; exit status 1 on failure. If the file named by PROBE_WEBHOOK_FILE exists
#                it holds a webhook URL (none exists today) and a short text is POSTed. Nothing is sent otherwise.
# Preconditions: curl; for chat mode a writable PROBE_STATE_DIR (default /var/lib/volta-probe) and the shop's assistant being public (otherwise the route
#                answers 404 and the probe reports it).
# Usage:         I_HAVE_APPROVAL=yes PROBE_MODE=basic bash external-probe.sh
# Downtime:      none. Rollback: remove the cron entry or timer.
set -uo pipefail
[ "${I_HAVE_APPROVAL:-}" = "yes" ] || { echo "PREPARED, NOT RUN: set I_HAVE_APPROVAL=yes only with the owner's approval." >&2; exit 2; }

BASE="${PROBE_BASE_URL:-https://valta.hexalyte.com}"
MODE="${PROBE_MODE:-basic}"
STATE="${PROBE_STATE_DIR:-/var/lib/volta-probe}"
WEBHOOK_FILE="${PROBE_WEBHOOK_FILE:-/etc/volta-probe/webhook}"
fail=0

report_fail() { # $1 = check, $2 = detail
  fail=1
  msg="volta-probe FAIL $1 $2"
  echo "$msg"
  command -v logger >/dev/null 2>&1 && logger -t volta-probe -p daemon.crit -- "$msg" || true
  if [ -s "$WEBHOOK_FILE" ]; then
    curl -fsS -m 10 -X POST -H 'content-type: application/json' --data "{\"text\":\"$msg\"}" "$(head -n1 "$WEBHOOK_FILE")" >/dev/null 2>&1 || true
  fi
}

start="$(date +%s%3N)"
code="$(curl -s -o /dev/null -m 10 -w '%{http_code}' "$BASE/" || true)"
ms=$(( $(date +%s%3N) - start ))
[ "$code" = 200 ] || report_fail homepage "http=$code ms=$ms"

if [ "$MODE" = chat ]; then
  mkdir -p "$STATE" && chmod 700 "$STATE"
  jar="$STATE/cookies.txt"
  start="$(date +%s%3N)"
  # Same-origin header as a browser would send (the route rejects a mutating request without it).
  out="$(curl -s -m 20 -c "$jar" -b "$jar" -o /dev/null -w '%{http_code}' -X POST "$BASE/api/assistant/chat" \
        -H 'content-type: application/json' -H "origin: $BASE" --data '{"message":"hi","locale":"en"}' || true)"
  ms=$(( $(date +%s%3N) - start ))
  case "$out" in
    200) : ;;
    404) report_fail assistant_route "http=404 (assistant disabled or not public) ms=$ms" ;;
    429) report_fail assistant_rate_limited "http=429 ms=$ms" ;;
    *)   report_fail assistant_chat "http=$out ms=$ms" ;;
  esac
fi

[ "$fail" -eq 0 ] && echo "volta-probe OK mode=$MODE"
exit "$fail"
