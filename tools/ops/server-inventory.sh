#!/usr/bin/env bash
# READ-ONLY inventory of an AI server (old or new): hardware, OS, services, containers, Ollama, the Agent, listening ports, firewall and
# the NAMES of configuration variables. It changes nothing: no package, service, user, key, file or setting is written, nothing is
# restarted, no model is pulled. It never prints secret VALUES: environment files are shown as NAME=<set|empty> only, and private
# keys, password hashes and key bodies are never read. Output names accounts and addresses, so share it privately.
#   sudo bash server-inventory.sh | tee /tmp/server-inventory.txt
set -u
hr() { printf '\n==== %s ====\n' "$1"; }
mask() { sed -E 's/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/\1=<set>/; s/^([A-Za-z_][A-Za-z0-9_]*)=$/\1=<empty>/'; }

hr "Identity"; hostname; date -u +%FT%TZ; uname -srm; (. /etc/os-release 2>/dev/null && echo "$PRETTY_NAME"); uptime -p; systemd-detect-virt 2>/dev/null | sed 's/^/virtualization: /'
hr "CPU"; lscpu 2>/dev/null | grep -E "^(Model name|CPU\(s\)|Thread|Core|Socket|Architecture|Flags)" | sed -E 's/^(Flags:).*(avx2|avx512[a-z_]*).*/\1 ... \2 .../' | cut -c1-120; grep -oE "avx512[a-z_0-9]*|avx2|fma|f16c" /proc/cpuinfo | sort -u | tr '\n' ' '; echo
hr "Memory and swap"; free -m; grep -E "SwapTotal|HugePages_Total" /proc/meminfo; echo "vm.swappiness=$(cat /proc/sys/vm/swappiness 2>/dev/null)"
hr "Storage"; lsblk -o NAME,SIZE,TYPE,FSTYPE,ROTA,MOUNTPOINT 2>/dev/null; df -hT -x tmpfs -x devtmpfs -x overlay 2>/dev/null; echo "--- fs speed hint (read-only): $(cat /sys/block/*/queue/rotational 2>/dev/null | tr '\n' ' ')"
hr "Network"; ip -br a 2>/dev/null; ip route 2>/dev/null | head -3; for i in $(ls /sys/class/net | grep -v lo); do echo "$i speed: $(cat /sys/class/net/$i/speed 2>/dev/null) Mb/s"; done
hr "Time sync"; timedatectl 2>/dev/null | grep -E "Time zone|synchronized|NTP"
hr "Listening ports (who listens where)"; ss -tlnp 2>/dev/null | awk 'NR==1 || /LISTEN/' | cut -c1-150
hr "Firewall and brute-force protection (status only)"; ufw status verbose 2>/dev/null || echo "(ufw inactive or missing)"; systemctl is-active fail2ban 2>/dev/null | sed 's/^/fail2ban: /'; systemctl is-active unattended-upgrades 2>/dev/null | sed 's/^/unattended-upgrades: /'
hr "Services of interest (state)"; systemctl list-units --type=service --no-legend 2>/dev/null | awk '{print $1,$3,$4}' | grep -iE "volta|ollama|docker|ssh|nginx|caddy|fail2ban|cron|chrony|timesyncd|ufw|wireguard|redis|postgres"
hr "Containers (if Docker)"; command -v docker >/dev/null 2>&1 && { docker ps -a --format '{{.Names}}\t{{.Image}}\t{{.Status}}'; docker volume ls --format '{{.Name}}'; docker system df | head -5; } || echo "(no docker)"
hr "Ollama"; command -v ollama >/dev/null 2>&1 && ollama --version 2>/dev/null; systemctl cat ollama 2>/dev/null | grep -E "^(Environment|ExecStart|User)=" | sed -E 's/(=[^=]*KEY[^=]*=)[^ ]*/\1<hidden>/' ; ls /etc/systemd/system/ollama.service.d 2>/dev/null; for f in /etc/systemd/system/ollama.service.d/*.conf; do [ -f "$f" ] && { echo "[$f]"; grep -E "^Environment=" "$f" | sed -E 's/(KEY[A-Z_]*=)[^"]*/\1<hidden>/'; }; done
command -v ollama >/dev/null 2>&1 && { echo "--- installed models (name, id, size, modified)"; ollama list 2>/dev/null; echo "--- loaded now"; curl -s --max-time 5 127.0.0.1:11434/api/ps | head -c 500; echo; echo "--- model storage"; for d in /usr/share/ollama/.ollama/models /var/lib/ollama /root/.ollama/models; do [ -d "$d" ] && du -sh "$d" 2>/dev/null; done; }
hr "VOLTA Agent (unit and variable NAMES only)"; systemctl cat volta-agent 2>/dev/null | grep -E "^(User|Group|WorkingDirectory|ExecStart|EnvironmentFile|Restart|MemoryMax|CPUQuota|ProtectSystem|NoNewPrivileges)=" ; systemctl is-active volta-agent 2>/dev/null | sed 's/^/volta-agent: /'
for f in /etc/volta-agent/agent.env; do [ -r "$f" ] && { echo "[$f] (names only; values hidden; mode $(stat -c %a "$f") owner $(stat -c %U:%G "$f"))"; grep -vE '^\s*(#|$)' "$f" | mask; }; done
ls -la /opt/volta-agent 2>/dev/null | awk '{print $1,$3,$5,$9}' | head -12; [ -x /opt/node/current/bin/node ] && /opt/node/current/bin/node --version | sed 's/^/node: /'
hr "SSH (effective settings, key fingerprints only)"; sshd -T 2>/dev/null | grep -iE '^(port|permitrootlogin|passwordauthentication|pubkeyauthentication|allowusers|allowgroups|allowtcpforwarding|permitopen|x11forwarding)\b'; grep -rnE '^\s*Match\b' /etc/ssh/sshd_config /etc/ssh/sshd_config.d/ 2>/dev/null
getent passwd | awk -F: '($3==0 || $3>=1000) && $1!="nobody" {print $1":"$3":"$7}'; getent group sudo 2>/dev/null
for u in $(getent passwd | awk -F: '($3==0 || $3>=1000) && $7 !~ /(nologin|false)$/ {print $1":"$6}'); do n=${u%%:*}; h=${u#*:}; [ -r "$h/.ssh/authorized_keys" ] && { echo "[$n] authorized keys:"; ssh-keygen -lf "$h/.ssh/authorized_keys" 2>/dev/null | sed 's/^/   /'; }; done
hr "Scheduled jobs and backups"; crontab -l 2>/dev/null | grep -vE '^\s*#' ; ls /etc/cron.d 2>/dev/null; systemctl list-timers --no-legend 2>/dev/null | head -8; ls -la /var/backups /root/backups /opt/backups 2>/dev/null | head -15
hr "Load right now"; uptime; ps aux --sort=-%mem | head -6 | awk '{printf "%-10s %5s%% %s\n",$1,$4,$11}'
hr "Done (nothing was changed)"
