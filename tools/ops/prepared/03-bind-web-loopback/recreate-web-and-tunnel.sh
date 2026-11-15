#!/usr/bin/env bash
# PREPARED, NOT RUN: needs the owner's approval. Refuses to do anything unless I_HAVE_APPROVAL=yes.
#
# Purpose:       publish the web container's port 8090 on 127.0.0.1 only (compose line 34), recreate volta-web-1 from the EXISTING image (no build), then
#                recreate the AI tunnel container, which shares volta-web-1's network namespace and therefore breaks when volta-web-1 is replaced.
# Where:         the WEBSITE server, as root, in /opt/valta.
# Preconditions: (1) disk: the website server was 91% full with 3.4 GB free; a recreate needs no new image, but the script stops below 1 GB free;
#                NEVER run `docker build` here without freeing space first (16.69 GB of old images are reclaimable: pruning needs separate approval).
#                (2) the line "${WEB_PORT:-8090}:3000" exists exactly once; (3) the current tunnel container's options still equal the ones recorded
#                during the audit (a QA agent verifies them against `docker inspect`; this script re-checks and stops on any difference);
#                (4) every nginx proxy_pass to 8090 is 127.0.0.1:8090; (5) P3: loopback-only publishing demonstrably works on THIS host: the QA audit
#                found no docker-proxy for the existing loopback-published ports and 0 DNAT hits on them, so nginx -> 127.0.0.1:PORT must be shown to work
#                (the script curls the existing loopback ports 13000 and 4010 and stops if they do not answer) BEFORE any change.
# Usage:         I_HAVE_APPROVAL=yes bash recreate-web-and-tunnel.sh apply|verify|rollback
# Downtime:      ESTIMATE ONLY, not measured: the site returns 502 from nginx while volta-web-1 is replaced (the app is ready about 1.4 s after start;
#                Docker reports "healthy" only after the first 30 s probe). The tunnel is recreated as soon as volta-web-1 is RUNNING (it needs the
#                namespace, not the healthy flag), so expect roughly 5 to 15 s of site downtime and a similar gap for the assistant. If the public site
#                does not answer 200 after the change, `apply` rolls itself back.
# Rollback:      `rollback` restores the compose backup, recreates web, then recreates the tunnel the same way.
set -euo pipefail
[ "${I_HAVE_APPROVAL:-}" = "yes" ] || { echo "PREPARED, NOT RUN: set I_HAVE_APPROVAL=yes only with the owner's approval." >&2; exit 2; }
[ "$(id -u)" = 0 ] || { echo "run as root" >&2; exit 1; }

DIR=/opt/valta
FILE="$DIR/docker-compose.yml"
STATE=/root/.volta-prepared-compose.stamp
OLD='      - "${WEB_PORT:-8090}:3000"'
NEW='      - "127.0.0.1:${WEB_PORT:-8090}:3000"'
TUNNEL=volta-ai-tunnel-new
# Recorded from `docker inspect` of the running tunnel container (names and options only; the key file is mounted from the host, never printed):
EXPECT_IMAGE='volta/ai-tunnel:latest'
EXPECT_CMD='["ssh","-N","-i","/tunnel/id_ed25519","-o","UserKnownHostsFile=/tunnel/known_hosts","-o","StrictHostKeyChecking=yes","-o","BatchMode=yes","-o","IdentitiesOnly=yes","-o","ExitOnForwardFailure=yes","-o","ServerAliveInterval=15","-o","ServerAliveCountMax=3","-L","127.0.0.1:18787:127.0.0.1:8787","voltatunnel@109.199.108.76"]'
EXPECT_MOUNT='/opt/valta/ai-tunnel-new:/tunnel:ro'

check_tunnel_matches_record() {
  local img cmd mounts
  img="$(docker inspect "$TUNNEL" --format '{{.Config.Image}}')"
  cmd="$(docker inspect "$TUNNEL" --format '{{json .Config.Cmd}}')"
  mounts="$(docker inspect "$TUNNEL" --format '{{range .HostConfig.Binds}}{{.}} {{end}}' | tr -d ' ' )"
  [ "$img" = "$EXPECT_IMAGE" ] || { echo "tunnel image differs from the audit record: stop" >&2; return 1; }
  [ "$cmd" = "$EXPECT_CMD" ] || { echo "tunnel command differs from the audit record: stop (do not guess; re-inspect)" >&2; return 1; }
  [ "$mounts" = "$EXPECT_MOUNT" ] || { echo "tunnel mounts differ from the audit record: stop" >&2; return 1; }
}

recreate_tunnel() {
  docker rm -f "$TUNNEL" >/dev/null
  docker run -d --name "$TUNNEL" --restart unless-stopped \
    --network container:volta-web-1 \
    -v /opt/valta/ai-tunnel-new:/tunnel:ro \
    "$EXPECT_IMAGE" \
    ssh -N -i /tunnel/id_ed25519 -o UserKnownHostsFile=/tunnel/known_hosts -o StrictHostKeyChecking=yes -o BatchMode=yes -o IdentitiesOnly=yes \
        -o ExitOnForwardFailure=yes -o ServerAliveInterval=15 -o ServerAliveCountMax=3 -L 127.0.0.1:18787:127.0.0.1:8787 voltatunnel@109.199.108.76 >/dev/null
}

recreate_web() {
  ( cd "$DIR" && docker compose config -q && docker compose up -d --no-build --no-deps web )   # never a bare `up -d`: it would start the stopped ai-agent/ai-tunnel services
  for i in $(seq 1 30); do
    [ "$(docker inspect volta-web-1 --format '{{.State.Running}}' 2>/dev/null || true)" = true ] && return 0
    sleep 1
  done
  echo "volta-web-1 did not start within 30 s" >&2
  return 1
}

wait_healthy() {
  for i in $(seq 1 45); do
    [ "$(docker inspect volta-web-1 --format '{{.State.Health.Status}}' 2>/dev/null || true)" = healthy ] && return 0
    sleep 2
  done
  echo "volta-web-1 did not become healthy within 90 s" >&2
  return 1
}

site_code() { curl -s -o /dev/null -m 10 -w '%{http_code}' https://valta.hexalyte.com/; }

# P3: the existing loopback-published ports must answer (any HTTP status counts; 000 means no connection).
check_loopback_publishing_works() {
  local port code
  for port in 13000 4010; do
    code="$(curl -s -o /dev/null -m 5 -w '%{http_code}' "http://127.0.0.1:$port/" || true)"
    [ "$code" != 000 ] || { echo "P3 failed: 127.0.0.1:$port does not answer, so loopback publishing is not proven on this host: stop" >&2; return 1; }
  done
}

health_report() {
  echo "listeners on 8090 (expect only 127.0.0.1:8090): $(ss -tln | awk '$4 ~ /:8090$/ {printf "%s ", $4}')"
  echo "public site: $(curl -s -o /dev/null -m 10 -w '%{http_code}' https://valta.hexalyte.com/)   (expect 200)"
  echo "tunnel to Agent (expect 401): $(docker exec volta-web-1 node -e 'fetch("http://127.0.0.1:18787/v1/health").then(r=>console.log(r.status)).catch(()=>console.log("down"))')"
}

case "${1:-}" in
  apply)
    avail_kb="$(df --output=avail / | tail -1 | tr -d ' ')"
    [ "$avail_kb" -ge 1048576 ] || { echo "less than 1 GB free on /: stop" >&2; exit 1; }
    [ "$(grep -cF -- "$OLD" "$FILE")" = 1 ] || { echo "the expected port line was not found exactly once: stop" >&2; exit 1; }
    check_tunnel_matches_record
    check_loopback_publishing_works
    echo "nginx upstream references to 8090:"; grep -rhn 'proxy_pass.*8090' /etc/nginx/sites-enabled/ /etc/nginx/conf.d/ 2>/dev/null || true
    if grep -rhE 'proxy_pass' /etc/nginx/sites-enabled/ /etc/nginx/conf.d/ 2>/dev/null | grep -E ':8090' | grep -vqE '127\.0\.0\.1:8090'; then
      echo "an nginx proxy_pass to 8090 does not use 127.0.0.1: stop" >&2; exit 1
    fi
    stamp="$(date +%Y%m%d-%H%M%S)"
    cp -a "$FILE" "$FILE.bak-$stamp"; echo "$stamp" > "$STATE"
    # Replace the one exact line (basic regex: $ and { are literal here; checked by the count above and again below).
    sed -i 's|^      - "\${WEB_PORT:-8090}:3000"$|      - "127.0.0.1:\${WEB_PORT:-8090}:3000"|' "$FILE"
    [ "$(grep -cF -- "$NEW" "$FILE")" = 1 ] && [ "$(grep -cF -- "$OLD" "$FILE")" = 0 ] || { echo "edit did not produce exactly the expected line: restoring" >&2; cp -a "$FILE.bak-$stamp" "$FILE"; exit 1; }
    recreate_web && recreate_tunnel
    wait_healthy || true
    health_report
    if [ "$(site_code)" != 200 ]; then
      echo "the public site does not answer 200 after the change: ROLLING BACK" >&2
      cp -a "$FILE.bak-$stamp" "$FILE"
      recreate_web && recreate_tunnel
      wait_healthy || true
      health_report
      echo "rolled back automatically to $FILE.bak-$stamp" >&2
      exit 3
    fi
    echo "applied; backup $FILE.bak-$stamp"
    ;;
  verify)
    health_report
    ;;
  rollback)
    stamp="$(cat "$STATE" 2>/dev/null || true)"
    [ -n "$stamp" ] && [ -f "$FILE.bak-$stamp" ] || { echo "no backup recorded" >&2; exit 1; }
    cp -a "$FILE.bak-$stamp" "$FILE"
    recreate_web && recreate_tunnel
    wait_healthy || true
    health_report
    echo "rolled back to $FILE.bak-$stamp"
    ;;
  *)
    echo "usage: I_HAVE_APPROVAL=yes bash $0 apply|verify|rollback" >&2
    exit 1
    ;;
esac
