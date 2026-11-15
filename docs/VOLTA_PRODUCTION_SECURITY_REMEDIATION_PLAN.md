# VOLTA production security remediation plan

Date: 2026-11-14. Written for the project owner. **Every command in this document is NOT RUN.** It is based on a read-only inspection of the website server (one SSH session, 2026-11-14 03:54 UTC) plus earlier audit evidence and source review. No secret, key value or visitor address appears here. Servers: website server 46.62.143.151 (Docker, nginx, UFW), AI server 109.199.108.76.

Reading guide: "proven" = observed on the server or in source. "Inference" = logical conclusion, not observed. "Unverified" = not checked.

## 0. Order at a glance

| Step | What | Downtime | Needs approval |
|---|---|---|---|
| P0 | Decisive outside test of port 8090 (owner, phone hotspot) | none | no (a single HEAD request to your own server) |
| R1 | DOCKER-USER rule for 8090 (+ persistence unit) | none | yes |
| R3 | nginx log redaction | none (graceful reload) | yes |
| R4 | Preview key: nothing to rotate; optional hygiene | none | no change needed |
| R2 | Compose binding 127.0.0.1:8090 + tunnel recreate | site about 2-12 s, assistant about 35-45 s (script as written) | yes, only after precondition P3 passes |
| R5 | Hardened client-address patch: build needs disk space | build outside the server, or prune first | yes (pruning) |
| R6 | Agent Step B (min5 bundle) and allowance 30 | about 3-8 s of failed chat | yes |

Recommended calendar: P0 and R1 and R3 now (no downtime). R6 in a quiet window. R2 and R5 in a maintenance window, in that order, after the preconditions.

## 1. Port 8090: verified status

**Proven**
- volta-web-1 publishes `0.0.0.0:8090->3000` and `[::]:8090->3000` (docker-proxy listens on both).
- IPv4: Docker DNATs 8090 to the container (nat DOCKER rule `! -i br-5a564d6ba027 -p tcp --dport 8090 -j DNAT 172.20.0.3:3000`) and the packet travels the FORWARD chain, so UFW's INPUT rules never apply. DOCKER-USER (the operator chain) is empty, DOCKER-FORWARD accepts traffic for 172.20.0.3:3000 from non-bridge interfaces. **By the host's rules an IPv4 packet that reaches this machine on 8090 is accepted.**
- IPv6: the v6 side is only the userland proxy on INPUT; INPUT policy is DROP and UFW has no 8090 rule, so it is dropped.
- Counters read at 2026-11-14 03:54 UTC: the 8090 DNAT rule and the forward-accept rule have **0 packets** since the container was created (about 8.6 h). The Network agent's probes to 8090 from the AI server were made about 50 minutes before this reading: none arrived. The UFW-allowed control port 8080 (nothing listening) shows **0 packets over about 2 months** of uptime, while ports 22/80/443 show hundreds of thousands.

**Inference (not proof):** packets for ports other than 22/80/443 do not reach this VM, probably because of a provider-level firewall in front of it. That would make 8090 unreachable from the internet today, but nobody has proven it from an independent network.

**Unverified:** reachability from other sources (the provider filter might be per-source); whether a provider firewall exists at all (check the hosting console, Firewalls section).

**The one decisive test (owner, from a different network, for example a phone hotspot, NOT RUN):**
```
curl -m 8 -sI http://46.62.143.151:8090/        # timeout or "connection refused" = filtered; any HTTP status line = EXPOSED
curl -m 8 -sI https://46.62.143.151/ -k         # control: must answer (443 works)
```
Result "HTTP/1.1 ..." on the first command means the client-address trust is open to anyone (see section 2): do R1 immediately.

## 2. Proxy trust assessment

- Both VOLTA vhosts (`valta.hexalyte.com`, `valta.46-62-143-151.sslip.io`) **overwrite** `X-Forwarded-For` and `X-Real-IP` with `$remote_addr`. No other vhost reaches the volta-web container (hexalyte.com and partner.* append the header but point elsewhere). nginx has no `real_ip` directives. The website takes the first `X-Forwarded-For` entry (live code) and signs it to the Agent; the Agent never reads the header.
- Verdict: **trust holds only while nothing can reach port 8090 except nginx.** A direct caller on 8090 chooses any "client address" and bypasses the website's 20/min, the Agent's 40/min per address, 2 concurrent and 10-per-hour new-conversation limits; only the 2000/hour shop-wide ceiling remains.
- Separate, not a spoofing issue: an IPv6 visitor owns a /64 and rotates addresses freely, so per-/128 keys are no limit; the hardened patch (R5) collapses IPv6 to a /64 key.
- Callers inside the Docker network (order-sync, mock-erp, healthcheck) send no header and share the "unknown" bucket (maps to 0.0.0.0 at the Agent). Not an attack path from outside.
- Playwright check: all e2e specs in the website worktree send exactly one IPv4 value in `x-forwarded-for` (10.x.y.z) and never `x-real-ip`, a list or IPv6; the hardened `clientIp()` keeps them working **when they hit the app directly**. Through nginx the header is overwritten, so such specs only get distinct addresses on a direct/staging target.

## 3. Preview key exposure assessment

- Source (website worktree `lib/assistant/config.ts`, `preview.ts`, `app/api/assistant/preview/route.ts`): an empty or whitespace `AI_ASSISTANT_PREVIEW_KEY` gives `previewKey = null`. With null the preview route answers **404**, `previewKeyMatches` returns false (no key, or an empty `?key=`), and `hasAssistantAccess` is true for everyone: **the assistant is public by design**. A key under 16 characters switches the whole assistant off, not on.
- Server: the variable exists in `.env` and in the running container, with an empty value (container and `.env` agree).
- Logs: 21 old log lines on the preview path hold 3 distinct key values; none equals the current (empty) key. `error.log*`: 0 lines with `key=`. No off-host copy, no shipper, logs are not served over HTTP; readable by root, www-data, syslog.
- Verdict: **exposed but harmless now** (low). The key only ever unlocked the assistant UI (demo data), never admin or the Agent secret. Open question for the owner: is the empty value intended (assistant public), or a half-edited `.env`?

## 4. Remediation steps

Common: run on the website server as root unless stated. Take no step before its preconditions are met. All commands NOT RUN.

### R1. Firewall: drop new external connections to 8090 (no restart)

Preconditions: P0 done or skipped; baseline output saved.
Baseline (read-only):
```
iptables -S DOCKER-USER ; iptables -L DOCKER-USER -v -n
ip -4 route show default          # expect "dev eth0"
```
Apply (NOT RUN). The interface name is eth0 (proven: default route and link list), taken from the route at run time:
```
EXT=$(ip -4 route show default | awk '{for(i=1;i<=NF;i++) if($i=="dev"){print $(i+1); exit}}')
iptables -I DOCKER-USER 1 -i "$EXT" -p tcp -m conntrack --ctstate NEW --ctorigdstport 8090 -m comment --comment volta-block-direct-8090 -j DROP
```
Why this matches: by the time a packet reaches DOCKER-USER its port is already DNAT-ed to 3000, but conntrack remembers the original destination port 8090, so `--ctorigdstport 8090` matches and `--dport 8090` would not. `-i eth0` excludes nginx's loopback hop (host-originated, not forwarded) and traffic from containers. `--ctstate NEW` leaves established flows alone. It also survives a container IP change.
Expected effect: external new connections to 8090 are dropped; the site is untouched.
Verify:
```
iptables -L DOCKER-USER -v -n --line-numbers            # rule present
curl -s -o /dev/null -w '%{http_code}\n' https://valta.hexalyte.com/   # 200
docker exec volta-web-1 node -e 'fetch("http://127.0.0.1:18787/v1/health").then(r=>console.log(r.status))'   # 401
```
After some real traffic the rule counter must stay at 0 pkts unless someone actually probes 8090 from outside (a non-zero count is useful evidence of exposure that existed).
Rollback:
```
iptables -D DOCKER-USER -i "$EXT" -p tcp -m conntrack --ctstate NEW --ctorigdstport 8090 -m comment --comment volta-block-direct-8090 -j DROP
```
Downtime: none.

**Persistence (the rule is lost on reboot).** Verified: iptables-persistent / netfilter-persistent are **not installed**, `nftables.service` is disabled, `/etc/ufw/*.rules` have no DOCKER section. Do **not** install iptables-persistent: it would save Docker's dynamic chains and restore stale copies at boot. Use a systemd oneshot that re-applies the rule after Docker (text only, NOT RUN):
```
# /etc/systemd/system/volta-block-8090.service
[Unit]
Description=Drop external connections to published port 8090
After=docker.service network-online.target
Requires=docker.service
[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/bin/sh -c 'EXT=$(ip -4 route show default | awk "{for(i=1;i<=NF;i++) if(\$i==\"dev\"){print \$(i+1); exit}}"); iptables -C DOCKER-USER -i "$EXT" -p tcp -m conntrack --ctstate NEW --ctorigdstport 8090 -m comment --comment volta-block-direct-8090 -j DROP 2>/dev/null || iptables -I DOCKER-USER 1 -i "$EXT" -p tcp -m conntrack --ctstate NEW --ctorigdstport 8090 -m comment --comment volta-block-direct-8090 -j DROP'
[Install]
WantedBy=multi-user.target
```
Enable (NOT RUN): `systemctl daemon-reload && systemctl enable volta-block-8090.service`. Do not test with a Docker or host restart. R2 makes the rule redundant; keep it as defence in depth. Whether Docker keeps DOCKER-USER contents on a daemon restart is documented but untested here.

### R3. nginx log redaction (no downtime)

Facts: `/etc/nginx/nginx.conf:41` is exactly TAB + `access_log /var/log/nginx/access.log;` (proven with `cat -A`); no `log_format` exists; no vhost defines its own `access_log`; `conf.d` exists and is empty and is included at line 60. `nginx.conf` is a package conffile (unmodified since March): a future nginx-common upgrade will ask about the change.
Use the prepared, guarded script `tools/ops/prepared/01-nginx-log-redaction/` (its pattern uses `[[:space:]]`, so it matches the TAB; it runs `nginx -t` before and after and restores on failure). Manual equivalent:
```
D=$(date +%Y%m%d-%H%M)
cp -a /etc/nginx/nginx.conf /etc/nginx/nginx.conf.bak-$D
install -m 644 /e/path/to/00-log-redact.conf /etc/nginx/conf.d/00-log-redact.conf    # from the prepared directory
sed -i 's|^\taccess_log /var/log/nginx/access.log;|\taccess_log /var/log/nginx/access.log redacted;|' /etc/nginx/nginx.conf
nginx -t && systemctl reload nginx
```
Verify: `grep -n access_log /etc/nginx/nginx.conf` shows `redacted;`; after some traffic `tail -c 2000 /var/log/nginx/access.log | grep -c '?'` is 0 for new lines (counts only; do not print lines). Site check: `curl -s -o /dev/null -w '%{http_code}' https://valta.hexalyte.com/` = 200.
Rollback: `cp -a /etc/nginx/nginx.conf.bak-$D /etc/nginx/nginx.conf; rm /etc/nginx/conf.d/00-log-redact.conf; nginx -t && systemctl reload nginx`.
Downtime: none (graceful reload). Old log lines keep the old format; the 21 old key lines (access.log.1 and access.log.2.gz) expire with log rotation; leave them (no scrubbing needed: none matches a current key).

### R4. Preview key
- While the value is empty there is **nothing to rotate**: the preview route is 404 and no key unlocks anything. The 3 old logged values match nothing.
- Decide intentionally: public assistant (current) or private preview. If private preview is wanted again, generate a NEW 16+ character key at the console (never paste it in chat), apply R3 first so it is not logged, put it in `/opt/valta/.env`, and recreate web (`docker compose up -d --no-build --no-deps web`, then recreate the tunnel as in R2). Old cookies stop working because the cookie MAC includes the key.
- Optional hygiene (no behaviour change, takes effect at the next recreate): remove the empty `AI_ASSISTANT_PREVIEW_KEY=` line after `cp -a /opt/valta/.env /opt/valta/.env.bak-$D` (the backup holds secrets: keep its mode, delete later). Tell people who received old preview links to clear history/messages.

### R2. Compose binding 127.0.0.1:8090 and tunnel recreation (permanent fix)

Preconditions (all must pass; read-only):
- **P1 disk:** `df -h /` shows at least 1 GB free (3.4 GB now). Recreation needs **no image pull and no build**, only a writable layer (about 1 MB) and log growth.
- **P2 stale services:** never run a bare `docker compose up -d`: the compose file defines `ai-agent` and `ai-tunnel` with `network_mode: service:web`, and stopped containers `volta-ai-agent-1` and `volta-ai-tunnel-1` exist; they would start and fight the manual tunnel on port 18787. Always `up -d --no-build --no-deps web`. Optionally preview the plan: `cd /opt/valta && docker compose up -d --no-build --no-deps --dry-run web`.
- **P3 CRITICAL, loopback publishing must work on this host (unproven):** today nginx reaches the app through the userland proxy on 0.0.0.0:8090. After the change Docker publishes 127.0.0.1:8090 using the loopback mechanism, and on this Docker 29.9.1 host no docker-proxy listener exists for the already loopback-published ports 4010, 13000, 14100 (their DNAT counters are 0 and nat OUTPUT excludes 127.0.0.0/8). Test first, read-only, local traffic only:
  ```
  curl -m 5 -sI http://127.0.0.1:13000/ | head -1      # reseller web, expected an HTTP status line
  curl -m 5 -sI http://127.0.0.1:4010/  | head -1      # mock ERP
  ```
  If both answer, R2 is safe. **If either is refused or times out, STOP: R2 would make nginx return 502.** Alternative then: keep R1 plus its persistence unit, or bind to the bridge gateway address and change the nginx upstream (separate approval).
- **P4 mapping and env:** `grep -n '8090' /opt/valta/docker-compose.yml` shows exactly line 34; `.env` has `WEB_PORT=8090` (proven). Container env equals `.env` for every variable (proven, names only), so the recreate changes no application setting.
- **P5 tunnel record:** the tunnel command, image, restart policy, read-only mount `/opt/valta/ai-tunnel-new:/tunnel` and the files `id_ed25519`, `known_hosts` equal the proposed `docker run` (proven; Labels, hostname and log config unverified). The prepared script re-checks command, image and binds and stops on any difference.
- Backups: `cp -a /opt/valta/docker-compose.yml /opt/valta/docker-compose.yml.bak-$D` (the file is already locally modified in git).

Apply (NOT RUN): prepared script `tools/ops/prepared/03-bind-web-loopback/recreate-web-and-tunnel.sh apply` (guarded by `I_HAVE_APPROVAL=yes`), or manually:
```
sed -i 's|^      - "\${WEB_PORT:-8090}:3000"$|      - "127.0.0.1:\${WEB_PORT:-8090}:3000"|' /opt/valta/docker-compose.yml
cd /opt/valta && docker compose config -q && docker compose up -d --no-build --no-deps web
docker rm -f volta-ai-tunnel-new
docker run -d --name volta-ai-tunnel-new --restart unless-stopped --network container:volta-web-1 -v /opt/valta/ai-tunnel-new:/tunnel:ro volta/ai-tunnel:latest ssh -N -i /tunnel/id_ed25519 -o UserKnownHostsFile=/tunnel/known_hosts -o StrictHostKeyChecking=yes -o BatchMode=yes -o IdentitiesOnly=yes -o ExitOnForwardFailure=yes -o ServerAliveInterval=15 -o ServerAliveCountMax=3 -L 127.0.0.1:18787:127.0.0.1:8787 voltatunnel@109.199.108.76
```
What happens on recreate: volta-web-1 gets a new id and namespace; the old tunnel keeps a dead namespace (assistant unavailable) until it is recreated with `container:volta-web-1`. The healthcheck (curl 127.0.0.1:3000 inside the container) is unaffected by the binding. nginx's upstream 127.0.0.1:8090 stays the same.
Expected downtime (measured facts): the app printed "Ready in 169ms" 1.4 s after container start; the stop of the old container adds at most Docker's 10 s grace. **Site: about 2-12 s of 502.** The prepared script waits for Docker "healthy" (first probe comes only after the 30 s interval) before recreating the tunnel, so **the assistant is down about 35-45 s**. Better (needs a script edit and approval): recreate the tunnel as soon as `docker inspect -f '{{.State.Running}}' volta-web-1` is true. Past outages could not be measured (`docker events` retained nothing; 13 Nov nginx error logs are tiny, indicating seconds).
Verify:
```
ss -tln | grep ':8090'                                  # only 127.0.0.1:8090 (no 0.0.0.0, no [::])
curl -s -o /dev/null -w '%{http_code}\n' https://valta.hexalyte.com/    # 200
docker exec volta-web-1 node -e 'fetch("http://127.0.0.1:18787/v1/health").then(r=>console.log(r.status))'   # 401
docker ps --format '{{.Names}} {{.Status}}' | grep -E 'web-1|tunnel-new'
```
Rollback triggers: public site not 200 within 60 s, or tunnel check not 401 within 2 minutes. Rollback: `cp -a /opt/valta/docker-compose.yml.bak-$D /opt/valta/docker-compose.yml; cd /opt/valta && docker compose up -d --no-build --no-deps web`, then recreate the tunnel with the same `docker run` above (or the script's `rollback`). The prepared script does not auto-rollback if nginx returns 502 after the change: watch the verify output.

### R5. Deploying the hardened client-address patch (website image)

State: the patch is applied locally in the website worktree (444 website tests pass per Security wave 1). It is not deployed. A website **image build is NOT possible safely on this server**: `/` is 91% full with 3.4 GB free; a Next build adds about 1.6-1.8 GB of unique layers plus build cache while the cache already holds 1.9 GB.
Options:
1. **Build elsewhere** (preferred): build `volta/web` on a machine with space, `docker save | gzip`, copy, `docker load` here. Loading still adds about 1.6 GB of unique layers: keep at least 3 GB free first.
2. **Prune first (needs your explicit approval).** Exactly which images (all unused by any container, proven by `docker system df -v`; unique sizes in brackets): `volta/web:rollback-2f545c4` (1.774 GB), `volta/web:rollback-893ba6d` (1.776 GB), `volta/web:rollback-ai-widget-2` (1.566 GB), plus the older `rollback-20261113-0848` (1.579 GB). That frees about 6.7 GB. **Do not remove** `volta/web:latest` (running), `rollback-20261112` (used by volta-mock-erp-1), `rollback-ai-widget-3` (used by the stopped volta-ai-agent-1), or the newest rollbacks you may need. Command (NOT RUN): `docker image rm volta/web:rollback-2f545c4 volta/web:rollback-893ba6d volta/web:rollback-ai-widget-2 volta/web:rollback-20261113-0848`. Never use `docker system prune -a` (it would also remove other project images). Old unused `hexalyte/*` tags (about 5-6 GB unique) belong to another project: only with that project owner's approval.
Preflight before deploying: tag the current image as a rollback (`docker tag volta/web:latest volta/web:rollback-$(date +%Y%m%d-%H%M)`, costs no space), then the same R2 recreate with `up -d --no-build --no-deps web` and tunnel recreation. Same downtime as R2.
Behaviour change to accept: `x-real-ip` is read first, then the LAST `x-forwarded-for` entry; only a single plain IP is accepted; IPv6 becomes a /64 key; anything else maps to the shared "unknown" bucket (0.0.0.0 at the Agent) with a rate-limited warning in the log. It cannot fix direct access to 8090 (R1/R2 do). nginx sets both headers to a single `$remote_addr`, so production keys are unchanged for IPv4.
Rollback: re-tag the saved rollback image as `volta/web:latest` and recreate as in R2.

### R6. Agent Step B (AI server): min5 bundle and allowance 30

Bundle `agent.min5.mjs`, SHA-256 `e3b40e6f4aa2cdf68f6387871a31dfd8b6fca136877b28ee5361d0d82dd3a21e`, via `tools/ops/deploy-agent.sh`. Facts (existing evidence): the AI server has 166 GB free; `voltaadmin` has sudo; the service uses `/opt/node/current/bin/node` (the script falls back to that path); `agent.mjs` is `voltaagent:voltaagent 644`; a read-only `/tmp` mount (noexec) would not matter because the script only reads files. The script's header still shows an old IP: ignore it, use `voltaadmin@109.199.108.76`. Recommended single-restart sequence is in section 5.
Effect: about 3-8 s of failed chat requests and all in-memory conversations forgotten; Ollama and the model stay loaded. The allowance `AGENT_NEW_SESSIONS_PER_HOUR=30` is read by both old and new code; as a judgment (no traffic evidence) 30 per address per hour plus the 2000/hour shop ceiling; revisit when real session counts exist.

## 5. Final Step B deployment checklist

**Who must be present:** the owner (approver, holds the AI-server key) and one operator on the keyboard; optionally a second person ready to test the website from another phone/network. **Window:** a low-traffic time, about 30 minutes, not during a campaign or a demo; avoid the first hour after any website deployment.

Pre-checks (read-only; AI server as voltaadmin unless noted):
```
sudo sha256sum /opt/volta-agent/agent.mjs        # expect a1d3f8aff347910285f8d8c0767b50a4c8ddf154d9885d7a79689fef6bed3e25 (live bundle)
sudo grep -E '^AGENT_NEW_SESSIONS_PER_HOUR=' /etc/volta-agent/agent.env || echo "not set"
systemctl is-active volta-agent ollama ; df -h / | tail -1
curl -s -o /dev/null -w '%{http_code}\n' 127.0.0.1:8787/v1/health     # 401
curl -s 127.0.0.1:11434/api/ps | head -c 200                           # model loaded
sha256sum agent.min5.mjs                         # on the build machine: e3b40e6f...a21e
```
Stop if the live hash differs, the variable is already set to an unexpected value, or the services are not active. Website side: `curl -s -o /dev/null -w '%{http_code}' https://valta.hexalyte.com/` = 200 and the tunnel check = 401.

Deployment (NOT RUN; connect one SSH session at a time: port 22 is rate limited, repeated failed logins are banned for an hour):
```
scp -i <owner key> agent.min5.mjs voltaadmin@109.199.108.76:/tmp/agent.new.mjs
scp -i <owner key> tools/ops/deploy-agent.sh voltaadmin@109.199.108.76:/tmp/deploy-agent.sh
# on the AI server:
sudo sha256sum /tmp/agent.new.mjs                # must print e3b40e6f4aa2cdf68f6387871a31dfd8b6fca136877b28ee5361d0d82dd3a21e
TS=$(date +%Y%m%d-%H%M%S)
sudo cp -p /etc/volta-agent/agent.env /etc/volta-agent/agent.env.bak-$TS        # secrets inside: never print/upload
if sudo grep -q '^AGENT_NEW_SESSIONS_PER_HOUR=' /etc/volta-agent/agent.env; then sudo sed -i 's/^AGENT_NEW_SESSIONS_PER_HOUR=.*/AGENT_NEW_SESSIONS_PER_HOUR=30/' /etc/volta-agent/agent.env; else echo 'AGENT_NEW_SESSIONS_PER_HOUR=30' | sudo tee -a /etc/volta-agent/agent.env >/dev/null; fi
sudo ls -l /etc/volta-agent/agent.env            # unchanged owner/mode root voltaagent 640
sudo bash /tmp/deploy-agent.sh e3b40e6f4aa2cdf68f6387871a31dfd8b6fca136877b28ee5361d0d82dd3a21e
```
The script restarts once (the env change and the bundle both take effect), self-checks health for up to 20 s and restores the old bundle by itself (exit 2) if unhealthy; the value 30 is valid for the old code too, so an automatic bundle rollback leaves a working service.

Post-checks:
```
systemctl is-active volta-agent ollama                       # active active
curl -s -o /dev/null -w '%{http_code}\n' 127.0.0.1:8787/v1/health      # 401
sudo sha256sum /opt/volta-agent/agent.mjs                    # e3b40e6f...a21e
journalctl -u volta-agent -n 20 --no-pager                   # no error lines
curl -s 127.0.0.1:11434/api/ps | head -c 200                 # model still loaded
```
Website server (path through the tunnel):
```
docker exec volta-web-1 node -e 'fetch("http://127.0.0.1:18787/v1/health").then(r=>console.log(r.status))'    # 401
```
Signed chat smoke test through the website with **two different client addresses** (the proof that guests no longer share one counter): from two different networks (for example the office network and a phone on mobile data) open the public shop, start a conversation, ask "hi" and then "laptop for office work". Each must get a greeting and then product cards with prices and no "Something went wrong". One allowance slot per address is used. Do not hammer production to test the cap (the local test table in `docs/VOLTA_AI_RATE_LIMIT_REMEDIATION.md` is the proof). Note: sending an `x-forwarded-for` header from a script through nginx does not change the address (nginx overwrites it), so use two real networks.

Rollback triggers: script exits 2 (automatic); `volta-agent` not active; health not 401; chat returns the plain error twice in a row; model unloaded; Ollama not active.
Rollback commands (AI server):
```
sudo cp -p /opt/volta-agent/agent.mjs.bak-<timestamp printed by the script> /opt/volta-agent/agent.mjs && sudo systemctl restart volta-agent
sudo cp -p /etc/volta-agent/agent.env.bak-$TS /etc/volta-agent/agent.env && sudo systemctl restart volta-agent     # only if the env change must be undone
```
If nothing works: stop and report; do not touch the tunnel, firewall or model (the website degrades to its plain "assistant unavailable" message). Failed health check on the old code restarts every 3 s without a start limit: roll back at once.

## 6. Disk space assessment before any container recreation

`/` is 38 GB, 33 GB used, **3.4 GB free (91%)**. docker reports images 23.84 GB (16.69 GB reclaimable), build cache 1.93 GB (0 reclaimable), volumes 185 MB.
- **Recreating web or the tunnel (R2, R4, R5 rollout, rollback) needs no pull and no build:** only a new container layer (about 1 MB) and log growth. Safe at 3.4 GB.
- **Building the website image here (R5) is not safe at 3.4 GB** (see R5). Do not run `docker build` on this server before 8+ GB is free, or build elsewhere.
- Free 1 GB minimum is checked by the prepared script; keep an eye on it: each web deployment adds a 1.6-1.8 GB rollback image (11 of them exist), which is how the disk filled up. Policy suggestion: keep the latest and 3 rollbacks.

## 7. Review of tools/ops/prepared/** against live state

| Script | Finding |
|---|---|
| 01 nginx redaction | Matches line 41 (TAB, `[[:space:]]` pattern), conf.d exists and is empty, no vhost access_log. Safe. Uses `nginx -s reload` (fine). Note the nginx-common conffile prompt on a future upgrade. Cosmetic: an empty Referer logs `""` instead of `-`. |
| 02 block 8090 | Rule text is correct (ctorigdstport, `-i` from the default route = eth0, `-I ... 1`, comment based `-C`/`-D`). Mismatch: header says persistence and iptables-persistent are unverified: now **verified absent**; do not install iptables-persistent; use the systemd unit in R1. IPv6 twin is harmless (v6 never reaches FORWARD). verify prints loopback and public codes: good. |
| 03 bind loopback | Cmd, image, restart policy and the read-only mount equal the live tunnel (proven except Labels/Hostname/LogConfig). `--no-deps web` is correct and needed (stale ai-agent/ai-tunnel services). **Missing: precondition P3** (loopback publishing unproven on Docker 29.9.1 here): add the two `curl 127.0.0.1:13000/4010` checks and an automatic rollback if nginx answers 502 after apply. **Downtime text is wrong in one place:** the tunnel is recreated only after "healthy" (about 30 s later), so the assistant is down 35-45 s; recreate it when the container is running. WEB_PORT=8090 in .env (proven). |
| 04 monitoring | Not reviewed against live state (outside this check). |

## 8. Approvals the owner must give

| # | Approval |
|---|---|
| 1 | P0: run the single outside `curl -I` test to 8090 from a phone network |
| 2 | R1: add the DOCKER-USER rule (no restart) |
| 3 | R1b: install and enable the `volta-block-8090.service` persistence unit (no iptables-persistent) |
| 4 | R3: edit `nginx.conf` line 41, add `conf.d/00-log-redact.conf`, graceful nginx reload |
| 5 | R4: confirm the empty preview key is intended (public assistant); optional removal of the empty `.env` line |
| 6 | R2: edit compose line 34 and recreate volta-web-1 and the tunnel (about 2-12 s site, 35-45 s assistant), only after P3 passes |
| 7 | R2: edit the prepared script to recreate the tunnel as soon as the container runs |
| 8 | R5: choose build elsewhere, or approve removing the named four rollback images |
| 9 | R5: deploy the hardened client-address image (recreate, same downtime as R2) |
| 10 | R6: copy the bundle and script, edit `agent.env` (value 30), run `deploy-agent.sh` (one restart) |
| 11 | Commit/merge of the uncommitted work so the live bundle is reproducible from a commit |

## 9. Unverified (not hidden)

External reachability of 8090 from independent networks; existence/rules of a provider firewall; whether host-to-127.0.0.1 publishing works on this Docker 29.9.1 host (P3); tunnel Labels/Hostname/LogConfig; past per-deployment outage length; AI server `/tmp` mount options and `/opt/volta-agent` directory mode; whether the host-side process on 127.0.0.1:3000 is VOLTA code; real CGNAT share and real hourly conversation volume; whether the empty preview key is intended.
