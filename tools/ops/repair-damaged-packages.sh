#!/usr/bin/env bash
# Repairs packages whose installed files no longer match their checksums (for example after an interrupted first-boot update left
# empty files). It finds the affected packages with `dpkg --verify`, reinstalls ONLY those packages from the official Ubuntu mirrors,
# and verifies again. Run as root on the server that has the problem. Nothing else is changed.
set -u
export DEBIAN_FRONTEND=noninteractive
dpkg --verify 2>/dev/null > /tmp/dpkg-verify-before.txt
echo "files failing verification before: $(wc -l < /tmp/dpkg-verify-before.txt)"
awk '{print $NF}' /tmp/dpkg-verify-before.txt | xargs -r dpkg -S 2>/dev/null | cut -d: -f1 | sort -u > /tmp/damaged-packages.txt
echo "affected packages:"; sed 's/^/   /' /tmp/damaged-packages.txt
apt-get update -qq
if [ -s /tmp/damaged-packages.txt ]; then
  # shellcheck disable=SC2046
  apt-get -y --reinstall -o Dpkg::Options::=--force-confold install $(cat /tmp/damaged-packages.txt) 2>&1 | tail -5
fi
ldconfig 2>&1 | head -3
dpkg --verify 2>/dev/null > /tmp/dpkg-verify-after.txt
echo "files failing verification after: $(wc -l < /tmp/dpkg-verify-after.txt)"
head -10 /tmp/dpkg-verify-after.txt
