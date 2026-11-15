#!/usr/bin/env bash
# PREPARED, NOT RUN: needs the owner's approval. Refuses to do anything unless I_HAVE_APPROVAL=yes.
#
# Purpose:       volta-web-1 publishes 0.0.0.0:8090 -> 3000. Traffic to it is DNAT-ed by Docker and goes through the FORWARD chain, so UFW's INPUT rules
#                never see it, and DOCKER-USER (the chain Docker leaves for the operator) is empty: by the rule chain an internet packet to 8090 is accepted
#                (external reachability itself is UNVERIFIED: probes from two vantages timed out, including the control port 8080). Reaching 8090 directly
#                skips nginx, so a caller could choose the client address the app trusts. This rule drops NEW connections that arrive on the public
#                interface and whose ORIGINAL destination port was 8090.
# Why --ctorigdstport: by the time a packet reaches DOCKER-USER its destination port is already rewritten to 3000, so `--dport 8090` would never match.
# Why -i <public interface>: nginx talks to 127.0.0.1:8090 from the host itself (OUTPUT path, not forwarded, no input interface eth0), so it is not
#                affected. The interface is read from the default route at run time (the audit saw eth0 in the IPv6 output only).
# Where:         the WEBSITE server, as root.
# Preconditions: DOCKER-USER chain exists in iptables (and ip6tables); the `conntrack` match module is available (iptables loads it on demand).
# Usage:         I_HAVE_APPROVAL=yes bash block-direct-8090.sh apply|verify|rollback
# Downtime:      none. No container, nginx or service is touched.
# Rollback:      `rollback` deletes exactly the rules this script added (matched by their comment).
# Persistence:   NOT persistent: the rules are lost on reboot. The QA audit VERIFIED that iptables-persistent / netfilter-persistent is NOT installed, that
#                nftables.service is disabled and that ufw has no DOCKER-USER section. Do NOT install iptables-persistent (it would snapshot Docker's own
#                chains and restore them stale). Persistence, if wanted, is a small systemd oneshot that runs `apply` after docker.service (untested).
#                The permanent fix is 03 (bind the port to 127.0.0.1) once its precondition P3 passes.
set -euo pipefail
[ "${I_HAVE_APPROVAL:-}" = "yes" ] || { echo "PREPARED, NOT RUN: set I_HAVE_APPROVAL=yes only with the owner's approval." >&2; exit 2; }
[ "$(id -u)" = 0 ] || { echo "run as root" >&2; exit 1; }

COMMENT="volta-block-direct-8090"
PORT=8090

iface4="$(ip -4 route show default | awk '{for(i=1;i<=NF;i++) if($i=="dev"){print $(i+1); exit}}')"
iface6="$(ip -6 route show default 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="dev"){print $(i+1); exit}}')"
[ -n "$iface4" ] || { echo "no IPv4 default route interface found: stop" >&2; exit 1; }

rule() { # $1 = iptables command, $2 = interface
  echo "$1 DOCKER-USER -i $2 -p tcp -m conntrack --ctstate NEW --ctorigdstport $PORT -m comment --comment $COMMENT -j DROP"
}

case "${1:-}" in
  apply)
    iptables -nL DOCKER-USER >/dev/null
    if iptables -C DOCKER-USER -i "$iface4" -p tcp -m conntrack --ctstate NEW --ctorigdstport "$PORT" -m comment --comment "$COMMENT" -j DROP 2>/dev/null; then
      echo "IPv4 rule already present"
    else
      iptables -I DOCKER-USER 1 -i "$iface4" -p tcp -m conntrack --ctstate NEW --ctorigdstport "$PORT" -m comment --comment "$COMMENT" -j DROP
      echo "IPv4 rule added on $iface4"
    fi
    # IPv6: today the v6 listener is the userland docker-proxy (INPUT path, already dropped by ufw6). This twin is defence in depth if Docker ever
    # starts forwarding v6; harmless otherwise.
    if [ -n "$iface6" ] && ip6tables -nL DOCKER-USER >/dev/null 2>&1; then
      if ip6tables -C DOCKER-USER -i "$iface6" -p tcp -m conntrack --ctstate NEW --ctorigdstport "$PORT" -m comment --comment "$COMMENT" -j DROP 2>/dev/null; then
        echo "IPv6 rule already present"
      else
        ip6tables -I DOCKER-USER 1 -i "$iface6" -p tcp -m conntrack --ctstate NEW --ctorigdstport "$PORT" -m comment --comment "$COMMENT" -j DROP
        echo "IPv6 rule added on $iface6"
      fi
    else
      echo "IPv6: no default-route interface or no DOCKER-USER chain: skipped"
    fi
    echo "NOT persistent. Run 'verify' now and from another network (see README)."
    ;;
  verify)
    echo "## rules (packet counters show matches)"
    iptables -L DOCKER-USER -v -n --line-numbers | grep -E "Chain|$COMMENT|pkts" || true
    ip6tables -L DOCKER-USER -v -n --line-numbers 2>/dev/null | grep -E "$COMMENT" || true
    echo "## the site must still work through nginx (loopback and public):"
    echo "loopback 127.0.0.1:8090 -> $(curl -s -o /dev/null -m 10 -w '%{http_code}' http://127.0.0.1:8090/)   (expect 200)"
    echo "public https://valta.hexalyte.com/ -> $(curl -s -o /dev/null -m 10 -w '%{http_code}' https://valta.hexalyte.com/)   (expect 200)"
    echo "## tunnel path to the Agent (expect 401 = up, signature required):"
    docker exec volta-web-1 node -e 'fetch("http://127.0.0.1:18787/v1/health").then(r=>console.log(r.status)).catch(()=>console.log("down"))'
    echo "## from ANOTHER network (not runnable here): TCP connect to 46.62.143.151:8090 must time out or be refused; do the same to a control port that answers (443)."
    ;;
  rollback)
    iptables -D DOCKER-USER -i "$iface4" -p tcp -m conntrack --ctstate NEW --ctorigdstport "$PORT" -m comment --comment "$COMMENT" -j DROP && echo "IPv4 rule removed" || echo "IPv4 rule was not present"
    if [ -n "$iface6" ]; then
      ip6tables -D DOCKER-USER -i "$iface6" -p tcp -m conntrack --ctstate NEW --ctorigdstport "$PORT" -m comment --comment "$COMMENT" -j DROP 2>/dev/null && echo "IPv6 rule removed" || echo "IPv6 rule was not present"
    fi
    ;;
  *)
    echo "usage: I_HAVE_APPROVAL=yes bash $0 apply|verify|rollback" >&2
    exit 1
    ;;
esac
