#!/usr/bin/env bash
# On the NEW AI server: creates the forward-only tunnel user the website's ai-tunnel container will connect as.
# It can only open a forward to 127.0.0.1:8787 (the Agent); no shell, no other port, no agent/X11 forwarding. Key is added later.
# Run as root:  sudo bash add-tunnel-user-new-server.sh
set -euo pipefail
id voltatunnel >/dev/null 2>&1 || useradd -m -s /usr/sbin/nologin voltatunnel
passwd -l voltatunnel >/dev/null
install -d -m 700 -o voltatunnel -g voltatunnel /home/voltatunnel/.ssh
touch /home/voltatunnel/.ssh/authorized_keys; chown voltatunnel:voltatunnel /home/voltatunnel/.ssh/authorized_keys; chmod 600 /home/voltatunnel/.ssh/authorized_keys
# Hardening drop-in listed only voltaadmin; allow the tunnel user too, restricted by a Match block.
sed -i 's/^AllowUsers .*/AllowUsers voltaadmin voltatunnel/' /etc/ssh/sshd_config.d/00-volta-hardening.conf
cat > /etc/ssh/sshd_config.d/10-volta-tunnel.conf <<'EOF'
Match User voltatunnel
    PasswordAuthentication no
    AllowTcpForwarding local
    PermitOpen 127.0.0.1:8787
    AllowAgentForwarding no
    X11Forwarding no
    PermitTTY no
    PermitTunnel no
    GatewayPorts no
    ForceCommand /bin/false
EOF
sshd -t && systemctl reload ssh && echo "sshd ok"
sshd -T -C user=voltatunnel,host=x,addr=1.1.1.1 | grep -E '^(allowtcpforwarding|permitopen|forcecommand|permittty|passwordauthentication) '
