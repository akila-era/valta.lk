#!/usr/bin/env bash
# READ-ONLY disk inventory for the VOLTA servers. It only lists and measures; it deletes, prunes, stops and writes NOTHING
# (output goes to the terminal; redirect it yourself if you want a file). Safe to run on the website server or the AI server.
# Run as root or with sudo so Docker and /var/lib can be measured. Do not paste the output anywhere public: it lists paths and image
# names but no secrets. Usage:  sudo bash disk-inventory.sh | tee /tmp/disk-inventory.txt
set -u
hr() { printf '\n==== %s ====\n' "$1"; }

hr "Host"
hostname; date -u +%FT%TZ; uptime

hr "Filesystems (df -h, real filesystems only)"
df -h -x tmpfs -x devtmpfs -x overlay 2>/dev/null

hr "Largest top-level directories (one filesystem, depth 1)"
du -xh --max-depth=1 / 2>/dev/null | sort -rh | head -15

if command -v docker >/dev/null 2>&1; then
  hr "Docker disk usage summary"
  docker system df 2>/dev/null
  hr "Docker images (repository, tag, size, created) newest first"
  docker images --format '{{.Repository}}:{{.Tag}}\t{{.Size}}\t{{.CreatedSince}}\t{{.ID}}' 2>/dev/null
  hr "Images currently used by containers (these are PROTECTED)"
  docker ps -a --format '{{.Names}}\t{{.Image}}\t{{.Status}}' 2>/dev/null
  hr "Rollback images (names containing 'rollback')"
  docker images --format '{{.Repository}}:{{.Tag}}\t{{.Size}}\t{{.CreatedSince}}' 2>/dev/null | grep -i rollback || echo "(none)"
  hr "Dangling images and build cache (candidates, NOT removed)"
  docker images -f dangling=true --format '{{.ID}}\t{{.Size}}\t{{.CreatedSince}}' 2>/dev/null || true
  docker builder du 2>/dev/null | tail -5 || true
  hr "Docker volumes (these hold data: PROTECTED)"
  docker volume ls 2>/dev/null
  docker system df -v 2>/dev/null | sed -n '/Local Volumes/,/Build cache/p' | head -30
fi

if command -v ollama >/dev/null 2>&1; then
  hr "Ollama models (name, size, last modified) and what is loaded now"
  ollama list 2>/dev/null
  curl -s --max-time 5 127.0.0.1:11434/api/ps 2>/dev/null | head -c 600; echo
  hr "Ollama model directory size"
  for d in /usr/share/ollama/.ollama/models /var/lib/ollama /root/.ollama/models "$HOME/.ollama/models"; do [ -d "$d" ] && du -sh "$d" 2>/dev/null; done
fi

hr "Logs and package caches"
journalctl --disk-usage 2>/dev/null || true
du -sh /var/log 2>/dev/null
du -sh /var/cache/apt 2>/dev/null
du -sh /var/lib/docker 2>/dev/null
du -sh /tmp /var/tmp 2>/dev/null

hr "Backups and project folders (PROTECTED: look, do not touch)"
for d in /opt/valta /opt/volta-agent /root/ceylora-final-backup /root /home /var/backups; do [ -e "$d" ] && du -sh "$d" 2>/dev/null; done
ls -la /root 2>/dev/null | head -30
ls -la /var/backups 2>/dev/null | head -20

hr "Old large files (over 200 MB, not under /proc, /sys, /var/lib/docker)"
find / -xdev -type f -size +200M -not -path '/proc/*' -not -path '/sys/*' -not -path '/var/lib/docker/*' -printf '%s\t%p\n' 2>/dev/null | sort -rn | head -20 | awk -F'\t' '{printf "%.0f MB\t%s\n", $1/1048576, $2}'

hr "Done (nothing was changed)"
