#!/usr/bin/env bash
# READ-ONLY access inventory for the VOLTA servers. It lists who can log in and how SSH is configured. It changes NOTHING: no user,
# key, password, sshd or firewall setting is written, and no service is restarted. It never prints password hashes, private keys,
# public key bodies, environment files or secret values: only user names, shells, groups, key FINGERPRINTS, permission bits and
# effective SSH settings. The output still names accounts and addresses, so share it privately.
# Run as root (or with sudo) so sshd's effective configuration can be read:  sudo bash access-inventory.sh | tee /tmp/access-inventory.txt
set -u
hr() { printf '\n==== %s ====\n' "$1"; }

hr "Host"
hostname; date -u +%FT%TZ; uname -sr; (. /etc/os-release 2>/dev/null && echo "$PRETTY_NAME")

hr "Accounts that can log in or have elevated rights (name, uid, shell, home)"
getent passwd | awk -F: '($3==0 || $3>=1000) && $1!="nobody" {printf "%-20s uid=%-6s shell=%-22s home=%s\n",$1,$3,$7,$6}'
echo "--- accounts with a login shell (any uid)"
getent passwd | awk -F: '$7 !~ /(nologin|false|sync|shutdown|halt)$/ {printf "%-20s uid=%-6s shell=%s\n",$1,$3,$7}'

hr "Administrator groups (members)"
for g in sudo wheel admin docker adm; do getent group "$g" 2>/dev/null; done

hr "Password state per account (status only: P=has password, L=locked, NP=none). Hashes are NOT shown."
passwd -S -a 2>/dev/null | awk '$2 ~ /^(P|L|NP)$/ {printf "%-20s %s\n",$1,$2}' | head -40

hr "SSH authorized keys per account (fingerprint, comment, type). Key bodies are NOT shown."
getent passwd | awk -F: '($3==0 || $3>=1000) && $7 !~ /(nologin|false)$/ {print $1":"$6}' | while IFS=: read -r u h; do
  for f in "$h/.ssh/authorized_keys" "$h/.ssh/authorized_keys2"; do
    [ -r "$f" ] || continue
    echo "[$u] $f  (mode $(stat -c %a "$f"), owner $(stat -c %U "$f"), $(grep -cvE '^\s*(#|$)' "$f") keys)"
    ssh-keygen -lf "$f" 2>/dev/null | sed 's/^/    /'
  done
done
echo "--- non-standard AuthorizedKeysFile locations (if any)"; grep -rhiE '^\s*AuthorizedKeysFile' /etc/ssh/sshd_config /etc/ssh/sshd_config.d/ 2>/dev/null || echo "(default)"

hr "Effective sshd settings (sshd -T, selected keys)"
sshd -T 2>/dev/null | grep -iE '^(port|permitrootlogin|passwordauthentication|kbdinteractiveauthentication|pubkeyauthentication|permitemptypasswords|allowusers|allowgroups|denyusers|maxauthtries|logingracetime|allowtcpforwarding|permitopen|x11forwarding|usepam|authenticationmethods|clientaliveinterval)\b' || echo "(could not run sshd -T: run as root)"
echo "--- effective for the tunnel user, if it exists"
id voltatunnel >/dev/null 2>&1 && sshd -T -C user=voltatunnel,host=localhost,addr=127.0.0.1 2>/dev/null | grep -iE '^(allowtcpforwarding|permitopen|forcecommand|permittty|x11forwarding|passwordauthentication|permitrootlogin)\b' || echo "(no voltatunnel user here)"
echo "--- Match blocks and files that contribute configuration"
ls -l /etc/ssh/sshd_config /etc/ssh/sshd_config.d/ 2>/dev/null
grep -nE '^\s*Match\b' /etc/ssh/sshd_config /etc/ssh/sshd_config.d/*.conf 2>/dev/null || echo "(no Match blocks)"

hr "Recent logins and failed attempts (counts only for failures)"
last -n 15 -w 2>/dev/null | head -20
echo "failed SSH password attempts, last 7 days: $(journalctl -u ssh -u sshd --since '7 days ago' --no-pager 2>/dev/null | grep -c 'Failed password')"
echo "invalid-user attempts, last 7 days:        $(journalctl -u ssh -u sshd --since '7 days ago' --no-pager 2>/dev/null | grep -c 'Invalid user')"

hr "Network exposure"
ss -tlnp 2>/dev/null | awk 'NR==1 || /LISTEN/'
echo "--- firewall (status only)"; ufw status verbose 2>/dev/null || echo "(ufw not active or not installed)"
systemctl is-active fail2ban 2>/dev/null | sed 's/^/fail2ban: /'

hr "Where service secrets live: permissions and owners only (contents are NEVER read)"
for f in /etc/volta-agent/agent.env /opt/valta/.env /opt/valta/ai-tunnel/id_ed25519 /opt/valta/ai-tunnel/known_hosts /etc/letsencrypt/live; do
  [ -e "$f" ] && stat -c '%U:%G %a %n' "$f"
done
ls -ld /etc/volta-agent /opt/valta /opt/valta/ai-tunnel /opt/volta-agent 2>/dev/null

hr "Services that carry credentials (unit names and state only)"
systemctl list-units --type=service --no-legend 2>/dev/null | awk '{print $1, $3, $4}' | grep -iE 'volta|ollama|docker|ssh|nginx|fail2ban|cron' || true
command -v docker >/dev/null 2>&1 && docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}' 2>/dev/null

hr "Done (nothing was changed)"
