#!/usr/bin/env bash
# Hardens a FRESH Ubuntu 24.04 AI server. Run as root (sudo) from an admin session that already has key login; keep that session open
# and verify from a SECOND session before closing it. Safe to re-run. It does NOT touch Docker, Ollama or any model, and it opens no
# public port except SSH. Lockout protections: it refuses to disable password login unless the named admin user has an authorised key,
# it validates sshd's configuration before reloading it, and the firewall allows SSH before it is enabled.
#   sudo ADMIN_USER=voltaadmin bash harden-new-ai-server.sh
set -euo pipefail
ADMIN_USER="${ADMIN_USER:-voltaadmin}"
export DEBIAN_FRONTEND=noninteractive
say() { printf '\n== %s ==\n' "$1"; }

say "Guard: the admin user must have an authorised key before password login is turned off"
KEYFILE="/home/$ADMIN_USER/.ssh/authorized_keys"
[ -s "$KEYFILE" ] || { echo "REFUSED: $KEYFILE is missing or empty"; exit 1; }
ssh-keygen -lf "$KEYFILE" | sed 's/^/   /'

say "Security updates"
apt-get update -qq
apt-get -y -qq -o Dpkg::Options::=--force-confold upgrade
apt-get -y -qq install fail2ban ufw unattended-upgrades sysstat age curl ca-certificates >/dev/null
[ -f /var/run/reboot-required ] && echo "reboot required (kernel or libc update): schedule it after verification" || echo "no reboot required"

say "Unattended security upgrades"
printf 'APT::Periodic::Update-Package-Lists "1";\nAPT::Periodic::Unattended-Upgrade "1";\nAPT::Periodic::AutocleanInterval "7";\n' > /etc/apt/apt.conf.d/20auto-upgrades
systemctl enable --now unattended-upgrades >/dev/null 2>&1 || true

say "SSH hardening (drop-in named 00- so it wins over cloud-init's 50- file)"
cat > /etc/ssh/sshd_config.d/00-volta-hardening.conf <<EOF
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
PubkeyAuthentication yes
X11Forwarding no
MaxAuthTries 3
LoginGraceTime 30
ClientAliveInterval 60
ClientAliveCountMax 3
AllowUsers $ADMIN_USER
EOF
sshd -t && echo "sshd configuration is valid"
systemctl reload ssh
sshd -T | grep -E '^(passwordauthentication|permitrootlogin|pubkeyauthentication|allowusers|maxauthtries)\b'

say "Lock the default 'ubuntu' account's password (no keys, not needed)"
id ubuntu >/dev/null 2>&1 && passwd -l ubuntu || true

say "Firewall: deny inbound by default, allow SSH only (Ollama and the Agent stay on loopback)"
ufw --force reset >/dev/null
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw limit 22/tcp comment 'SSH (rate limited)' >/dev/null
ufw --force enable >/dev/null
ufw status verbose | sed 's/^/   /'

say "Fail2ban for SSH"
printf '[sshd]\nenabled = true\nmaxretry = 4\nfindtime = 10m\nbantime = 1h\nbackend = systemd\n' > /etc/fail2ban/jail.d/volta-sshd.local
systemctl enable --now fail2ban >/dev/null 2>&1
systemctl restart fail2ban; sleep 2; fail2ban-client status sshd 2>/dev/null | sed 's/^/   /' || true

say "Swap: 4 GB swap file as an out-of-memory buffer (low swappiness: it is a safety net, not working memory)"
if ! swapon --show | grep -q swapfile; then fallocate -l 4G /swapfile; chmod 600 /swapfile; mkswap /swapfile >/dev/null; swapon /swapfile; grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab; fi
printf 'vm.swappiness=10\n' > /etc/sysctl.d/99-volta-swap.conf; sysctl -q -p /etc/sysctl.d/99-volta-swap.conf
swapon --show | sed 's/^/   /'

say "Resource monitoring: a health check every 5 minutes that logs a WARNING when disk, memory or load cross a limit"
cat > /usr/local/bin/volta-health-check <<'EOF'
#!/usr/bin/env bash
# Logs one line per run to the journal (tag volta-health). WARN lines are what an alert should be wired to.
disk=$(df --output=pcent / | tail -1 | tr -dc 0-9); avail=$(awk '/MemAvailable/ {printf "%d",$2/1024}' /proc/meminfo)
load=$(cut -d' ' -f1 /proc/loadavg); cpus=$(nproc); swap=$(awk '/SwapTotal/ {t=$2} /SwapFree/ {f=$2} END {printf "%d",(t-f)/1024}' /proc/meminfo)
oom=$(awk '/^oom_kill/ {print $2}' /proc/vmstat); lvl=info; msg="ok"
[ "$disk" -ge 85 ] && lvl=warning && msg="disk ${disk}% full"
[ "$avail" -le 800 ] && lvl=warning && msg="${msg}; memory available ${avail} MB"
awk -v l="$load" -v c="$cpus" 'BEGIN{exit !(l > c*1.5)}' && lvl=warning && msg="${msg}; load ${load} on ${cpus} CPUs"
[ "$swap" -ge 1500 ] && lvl=warning && msg="${msg}; swap used ${swap} MB"
logger -t volta-health -p "user.${lvl}" "${lvl^^} ${msg} | disk=${disk}% mem_avail=${avail}MB load=${load} swap_used=${swap}MB oom_kills=${oom}"
EOF
chmod 755 /usr/local/bin/volta-health-check
printf '[Unit]\nDescription=VOLTA AI host health check\n[Service]\nType=oneshot\nExecStart=/usr/local/bin/volta-health-check\n' > /etc/systemd/system/volta-health.service
printf '[Unit]\nDescription=Run the VOLTA health check every 5 minutes\n[Timer]\nOnBootSec=2min\nOnUnitActiveSec=5min\n[Install]\nWantedBy=timers.target\n' > /etc/systemd/system/volta-health.timer
systemctl daemon-reload; systemctl enable --now volta-health.timer >/dev/null 2>&1; systemctl start volta-health.service; journalctl -t volta-health -n 1 --no-pager | sed 's/^/   /'

say "Encrypted backup area (age is installed; the PRIVATE key never lives on this server)"
install -d -m 700 /var/backups/volta
say "Done"
