# VOLTA AI operations runbook

Date: 2026-11-14. Written for: whoever operates the assistant. Commands are for the **live** system as deployed on 2026-11-14 (website server 46.62.143.151, AI server 109.199.108.76). Run them only with the owner's authority. Never paste passwords or keys into a chat or a ticket; this runbook names files, never values.

## 1. What runs where

| Piece | Where | How it runs |
|---|---|---|
| Website, relay and chat route | Website server, directory `/opt/valta` | Docker compose service `web` (container `volta-web-1`), image `volta/web:latest` (built from branch `feature/ai-widget`, commit `6898dff`) |
| Tunnel to the AI server | Website server | Container `volta-ai-tunnel-new`, started with `docker run`, **not** by compose (restart policy `unless-stopped`); it shares `volta-web-1`'s network, forwarding `127.0.0.1:18787` to the AI server's `127.0.0.1:8787` as the forward-only user `voltatunnel` (key and pinned host key in `/opt/valta/ai-tunnel-new/`). The older compose service `ai-tunnel` is **stopped on purpose**: do not start it or run `deploy-web.sh` as written |
| Agent | AI server | systemd unit `volta-agent` (user `voltaagent`, loopback `8787`, memory cap 600 MB), bundle `/opt/volta-agent/agent.mjs` (currently SHA-256 `a1d3f8af…`), settings in `/etc/volta-agent/agent.env` (names: `AGENT_HMAC_KEYS`, `AGENT_HOST`, `AGENT_PORT`, `OLLAMA_URL`, `AGENT_CHAT_REPLIES`, `AGENT_QWEN_MODEL`, `AGENT_CATALOGUE_URL`, `AGENT_CATALOGUE_KEY_ID`, `AGENT_CATALOGUE_SECRET`) |
| Model runtime | AI server | systemd unit `ollama`, `127.0.0.1:11434`, cloud off, one model loaded, 5-minute keep-alive; production model `qwen3:1.7b-q4_K_M` |
| Host checks | AI server | systemd timer `volta-health` every 5 minutes: one line to the journal (tag `volta-health`), WARN lines for disk, memory, load, swap |

Important: the live Agent is started from the **preview entry** (`tests/real/preview-agent.ts`) bundled with esbuild. `src/main.ts` is a disabled stub. The assistant is **public** (no preview key).

## 2. Health checks

- Agent up: on the AI server, `curl -s -o /dev/null -w '%{http_code}\n' 127.0.0.1:8787/v1/health` should print `401` (alive, signature required). `systemctl is-active volta-agent ollama`.
- Through the website: on the website server, `docker exec volta-web-1 node -e 'fetch("http://127.0.0.1:18787/v1/health").then(r=>console.log(r.status))'` prints `401` when the tunnel and the Agent are up.
- Host: `journalctl -t volta-health -n 3 --no-pager`; `free -m`; `df -h /`.
- Public site: `curl -s -o /dev/null -w '%{http_code}\n' https://valta.hexalyte.com/` should print 200. Website server disk is **tight** (about 3 to 5 GB free, 85 to 91% used): check `df -h /` before any build.
- A chat smoke test (read-only): from the web container, a signed POST to `/api/assistant/chat` (see `docs/AI_PLAYWRIGHT_E2E_REPORT.md` and the smoke script pattern used on 2026-11-13).

## 3. Logs

`journalctl -u volta-agent -n 100 --no-pager` (request id, route, status, latency, error code; **no message text**); `docker logs --tail 50 volta-ai-tunnel-new`; `docker logs --tail 50 volta-web-1`. Counting chat outcomes: `journalctl -u volta-agent --since -24h --no-pager | grep '"route":"/v1/chat"' | grep -oE '"status":[0-9]+' | sort | uniq -c`.

## 4. Common incidents

| Symptom | Likely cause | Action |
|---|---|---|
| Widget shows "Something went wrong" for everyone | Tunnel down or Agent down | Check section 2 in order: Agent, tunnel container (`docker ps`; `docker logs`), then restart the tunnel: `docker rm -f volta-ai-tunnel-new` and recreate it with the same `docker run` command used at deploy (kept in this team's deploy notes; it needs `--network container:volta-web-1`) |
| Tunnel logs show "Permission denied (publickey)" repeatedly | Key mismatch or the AI server's **Fail2ban banned the website server's address** | **Stop the container at once** (`docker stop volta-ai-tunnel-new`, `docker update --restart=no volta-ai-tunnel-new`) so failed attempts stop; fix the key; on the AI server console `fail2ban-client status sshd` and unban only that address |
| Replies take 30 to 60 s or "assistant busy" | Model path busy (a benchmark or a long inference holds the single slot) | Stop any benchmark; `ollama ps`; wait or restart `ollama`; never run benchmarks while live |
| 429 "Too many messages" for new visitors | The shop-wide cap on new conversations (**live defect F-A**) | Owner-approved fix: set `AGENT_NEW_SESSIONS_PER_HOUR=200` in `/etc/volta-agent/agent.env`, `systemctl restart volta-agent` |
| 422 on every chat after a rollback | A 1.2 website talking to an Agent that predates 1.2 | Roll the website back to the previous image (below), not the Agent |
| Memory below 1 GB or OOM kills | A large model loaded | `ollama ps`; unload (`curl 127.0.0.1:11434/api/generate -d '{"model":"<tag>","keep_alive":0}'`); production model is the 1.7B |
| Website build fails: no space | Disk | Prune the build cache only (`docker builder prune -af`); do not delete images, volumes or backups without approval |

## 5. Deploy and rollback (order matters)

**Contract rule:** the website (1.2) works only with an Agent that speaks 1.2; an old website (1.1) works with the new Agent. So: **deploy the Agent first, the website second; roll back the website first, the Agent second.**

- Agent deploy (as done today): build the bundle (`esbuild tests/real/preview-agent.ts --bundle --platform=node --format=esm --target=node24`, with the require banner), copy to `/tmp/agent.new.mjs`, `sudo cp -p /opt/volta-agent/agent.mjs /opt/volta-agent/agent.mjs.bak-<tag>`, `sudo bash /tmp/install-agent-new-server.sh <sha256>`, `sudo systemctl restart volta-agent` (the script does **not** restart a running service), then check health. Existing backups: `agent.mjs.bak-before-real-catalogue` (mock-catalogue bundle) and `agent.mjs.bak-before-m5` (the real-catalogue bundle of 2026-11-13, speaks 1.1 only).
- Agent rollback: `sudo cp -p /opt/volta-agent/agent.mjs.bak-<tag> /opt/volta-agent/agent.mjs && sudo systemctl restart volta-agent` (**only after the website is rolled back to a 1.1 build**).
- Website deploy (as done today): in `/opt/valta`, `git fetch`, fast-forward, tag the current image (`docker tag volta/web:latest volta/web:rollback-<date>-<time>`), `docker compose build web`, `docker compose up -d --no-build --no-deps web`, then **recreate the tunnel container** (it shares the web container's network), and smoke-test. Do **not** use `tools/ops/deploy-web.sh` as written (it also starts the stopped compose tunnel).
- Website rollback: `docker tag volta/web:rollback-20261113-1911 volta/web:latest` (the build before contract 1.2; `...-1619` is the one before the relay), `docker compose up -d --no-build --no-deps web`, recreate the tunnel container.
- Model rollback: `tools/ops/switch-qwen-model.sh` (checks the exact tag and rolls back automatically if the Agent does not come up). The registry and the Agent allow only the two vetted Qwen3 tags.

## 6. Monitoring and alerting: what exists and what does not

Exists: the `volta-health` timer (journal lines only), Agent `/v1/metrics` (signed), Fail2ban on SSH, the website's own logs. **Does not exist:** any alert that reaches a person, an external uptime check for the chat route, error tracking, dashboards. Needed before any widening: an uptime probe on a signed Agent health or a website chat smoke every 5 minutes, and an alert on WARN lines and on 5xx rates.

## 7. Backups and data

The Agent holds no data (sessions are in memory, lost on restart) and no database. Its bundles and unit files are the only state; keep the `.bak-*` bundles. Website data (database, uploads) is outside this runbook; **backup verification of the website database was not performed in this work** (a `backups/` folder exists on the website server; its contents and restore status are unverified).

## 8. Secrets and rotation

Passwords were pasted into chat sessions earlier (website server, AI server panel and rescue, new server root). They must be rotated (`AI_CREDENTIAL_ROTATION_CHECKLIST.md`). The catalogue relay key, the Agent signing key and the tunnel key live only in the root-owned environment files and the tunnel folder; rotating each needs a coordinated change on both servers. The temporary migration key (comment ends `REMOVE-AFTER-MIGRATION`) is installed on the website server and the AI server and **must be removed** when the migration work ends.

## 9. Escalation

Owner first for anything touching customers or data; stop the tunnel container if it is hammering the AI server; never delete data, backups or models without approval.
