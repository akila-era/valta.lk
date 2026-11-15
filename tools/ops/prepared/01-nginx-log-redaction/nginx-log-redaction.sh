#!/usr/bin/env bash
# PREPARED, NOT RUN: needs the owner's approval. Refuses to do anything unless I_HAVE_APPROVAL=yes.
#
# Purpose:       stop nginx writing query strings (and Referer queries) to /var/log/nginx/access.log, so URLs like /api/assistant/preview?key=... leave
#                no secret in the log. Old log lines are NOT touched (they age out with logrotate: 14 daily copies).
# Where:         the WEBSITE server (46.62.143.151), as root.
# Preconditions: nginx 1.28.x; exactly ONE `access_log /var/log/nginx/access.log;` line in /etc/nginx/nginx.conf (seen at line 41, http context, inherited by
#                all vhosts, default combined format); /etc/nginx/conf.d exists and nginx.conf includes conf.d/*.conf; nothing parses the old format (the audit
#                found no fail2ban nginx filters or jails and no log shipper).
# Usage:         I_HAVE_APPROVAL=yes bash nginx-log-redaction.sh apply|verify|rollback   (apply expects 00-log-redact.conf next to this script)
# Downtime:      none (graceful `nginx -s reload`; established connections are not dropped).
# Rollback:      `rollback` (restores the backup and removes the conf.d file, `nginx -t`, reload). `apply` also rolls back by itself if `nginx -t` fails.
set -euo pipefail
[ "${I_HAVE_APPROVAL:-}" = "yes" ] || { echo "PREPARED, NOT RUN: set I_HAVE_APPROVAL=yes only with the owner's approval." >&2; exit 2; }

CONF=/etc/nginx/nginx.conf
DROPIN=/etc/nginx/conf.d/00-log-redact.conf
STATE=/root/.volta-prepared-nginx-redaction.stamp
HERE="$(cd "$(dirname "$0")" && pwd)"
# Tab/space tolerant; keeps the original indentation; matches only the exact default access_log line.
PATTERN='^([[:space:]]*)access_log[[:space:]]+/var/log/nginx/access\.log[[:space:]]*;'
REPLACEMENT='\1access_log /var/log/nginx/access.log redacted;'

restore() {
  local stamp; stamp="$(cat "$STATE" 2>/dev/null || true)"
  [ -n "$stamp" ] && [ -f "$CONF.bak-$stamp" ] || { echo "no backup recorded: nothing to restore" >&2; return 1; }
  cp -a "$CONF.bak-$stamp" "$CONF"
  rm -f "$DROPIN"
}

case "${1:-}" in
  apply)
    [ "$(id -u)" = 0 ] || { echo "run as root" >&2; exit 1; }
    [ -f "$HERE/00-log-redact.conf" ] || { echo "missing $HERE/00-log-redact.conf" >&2; exit 1; }
    [ ! -e "$DROPIN" ] || { echo "$DROPIN already exists: stop (already applied?)" >&2; exit 1; }
    n="$(grep -Ec "$PATTERN" "$CONF" || true)"
    [ "$n" = 1 ] || { echo "expected exactly 1 default access_log line, found $n: stop" >&2; exit 1; }
    nginx -t
    stamp="$(date +%Y%m%d-%H%M%S)"
    cp -a "$CONF" "$CONF.bak-$stamp"
    echo "$stamp" > "$STATE"
    install -m 644 "$HERE/00-log-redact.conf" "$DROPIN"
    sed -E -i "s|$PATTERN|$REPLACEMENT|" "$CONF"
    if ! nginx -t; then
      echo "nginx -t FAILED: restoring the previous configuration (no reload was done)" >&2
      restore
      nginx -t
      exit 1
    fi
    size_before="$(stat -c %s /var/log/nginx/access.log)"
    echo "$size_before" > "$STATE.size"
    nginx -s reload
    echo "applied; backup: $CONF.bak-$stamp. Run 'verify' after some traffic."
    ;;
  verify)
    # Counts only: never prints a log line (they hold visitor addresses).
    grep -Ec 'access_log /var/log/nginx/access\.log redacted;' "$CONF" | sed 's/^/redacted access_log lines in nginx.conf (expect 1): /'
    size_before="$(cat "$STATE.size" 2>/dev/null || echo 0)"
    new_lines="$(tail -c +"$((size_before + 1))" /var/log/nginx/access.log | wc -l)"
    with_query="$(tail -c +"$((size_before + 1))" /var/log/nginx/access.log | grep -c '?' || true)"
    echo "log lines written since apply: $new_lines; of those containing a question mark (expect 0; a user-agent text could contain one): $with_query"
    echo "error log lines containing 'key=' (the error log can still carry request lines; expect 0): $(grep -c 'key=' /var/log/nginx/error.log 2>/dev/null || true)"
    ;;
  rollback)
    [ "$(id -u)" = 0 ] || { echo "run as root" >&2; exit 1; }
    restore
    nginx -t
    nginx -s reload
    echo "rolled back"
    ;;
  *)
    echo "usage: I_HAVE_APPROVAL=yes bash $0 apply|verify|rollback" >&2
    exit 1
    ;;
esac
