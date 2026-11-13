#!/usr/bin/env bash
# Deploys the website (branch feature/ai-widget) on the WEBSITE SERVER. Run on the website server as root in the compose directory
# (normally /opt/valta). ASSUMPTIONS to check first: the directory is a git clone of the repository with the compose file at its
# root, and the services are named `web` and `ai-tunnel` (profile ai-tunnel), as in the earlier deployments.
#   cd /opt/valta && sudo bash deploy-web.sh fe318e3
# It tags the CURRENT web image as a rollback image, builds the new image in the background (the server is short of disk, so it
# checks free space and prunes build cache afterwards), recreates web and ai-tunnel, and verifies the site. It never touches the
# database volume, the uploads volume, the .env file or the tunnel key.
set -euo pipefail
WANT="${1:?usage: deploy-web.sh <expected-commit-prefix>}"
BRANCH=feature/ai-widget
ROLL="volta/web:rollback-$(date +%Y%m%d-%H%M)"
LOG=/tmp/deploy-web.log

[ -f docker-compose.yml ] || { echo "run this in the compose directory (docker-compose.yml not found)"; exit 1; }
AVAIL_KB="$(df --output=avail -k . | tail -1)"
[ "$AVAIL_KB" -gt 1500000 ] || { echo "less than 1.5 GB free: free space first (docker builder prune -f), then retry"; df -h .; exit 1; }

git fetch origin "$BRANCH"
git checkout "$BRANCH"
git merge --ff-only "origin/$BRANCH"
HEAD="$(git rev-parse --short HEAD)"
case "$HEAD" in "$WANT"*) ;; *) echo "HEAD is $HEAD but expected $WANT. Not deploying."; exit 1;; esac

docker tag volta/web:latest "$ROLL" 2>/dev/null && echo "rollback image: $ROLL" || echo "(no existing volta/web:latest to tag)"
echo "building in the background: tail -f $LOG"
nohup docker compose build web > "$LOG" 2>&1 &
BP=$!
while kill -0 "$BP" 2>/dev/null; do sleep 10; printf '.'; done; echo
wait "$BP" || { echo "BUILD FAILED, nothing was restarted. See $LOG"; tail -20 "$LOG"; exit 2; }

docker compose --profile ai-tunnel up -d --no-build web ai-tunnel
sleep 8
CODE="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/ || true)"
echo "site on :3000 -> HTTP $CODE"
docker compose ps
docker builder prune -f >/dev/null && echo "build cache pruned"; df -h . | tail -1
if [ "$CODE" != 200 ]; then
  echo "SITE NOT HEALTHY. Roll back: docker tag $ROLL volta/web:latest && docker compose --profile ai-tunnel up -d --no-build web ai-tunnel"
  exit 3
fi
echo "Done. Rollback if needed: docker tag $ROLL volta/web:latest && docker compose --profile ai-tunnel up -d --no-build web ai-tunnel"
