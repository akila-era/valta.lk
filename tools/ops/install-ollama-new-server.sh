#!/usr/bin/env bash
# Installs Ollama on the NEW AI server from the official release tarball (digest-verified), bound to loopback only, cloud models off,
# one model loaded at a time. It downloads no model. Run as root:
#   sudo bash install-ollama-new-server.sh <version-tag> <sha256-of-ollama-linux-amd64.tar.zst>
set -euo pipefail
VER="${1:?version tag, e.g. v0.40.16}"; SHA="${2:?sha256 of the tarball}"
apt-get -y -qq install zstd >/dev/null
cd /tmp
curl -sSfL -o ollama.tar.zst "https://github.com/ollama/ollama/releases/download/${VER}/ollama-linux-amd64.tar.zst"
echo "${SHA}  ollama.tar.zst" | sha256sum -c -
tar -I zstd -xf ollama.tar.zst -C /usr/local
id ollama >/dev/null 2>&1 || useradd -r -s /usr/sbin/nologin -m -d /var/lib/ollama ollama
cat > /etc/systemd/system/ollama.service <<'EOF'
[Unit]
Description=Ollama (loopback only)
After=network-online.target
[Service]
User=ollama
Group=ollama
ExecStart=/usr/local/bin/ollama serve
Restart=always
RestartSec=3
Environment=OLLAMA_HOST=127.0.0.1:11434
Environment=OLLAMA_NO_CLOUD=1
Environment=OLLAMA_MAX_LOADED_MODELS=1
Environment=OLLAMA_NUM_PARALLEL=1
Environment=OLLAMA_KEEP_ALIVE=5m
NoNewPrivileges=true
ProtectSystem=full
PrivateTmp=true
[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload; systemctl enable --now ollama
sleep 3
/usr/local/bin/ollama --version
ss -tlnp | grep 11434
rm -f /tmp/ollama.tar.zst
