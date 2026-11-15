# Private staging Agent: rollback plan

Date: 2026-11-14. Author: Agent D (Infrastructure and Security). Written for: the project owner first, then operators.

> **EXECUTION IS BLOCKED pending explicit owner approval.** Nothing in this plan has been run. It describes how to undo a staging run that has not happened yet.

## 1. In plain words

Rolling back means: stop the second Agent, delete only what the staging script created, and prove the live Agent and Ollama never changed. Because staging keeps no data, has no public port and changes no firewall, SSH, model or website setting, there is nothing to restore. The old-server migration rollback (`AI_MIGRATION_ROLLBACK.md`) is **not involved**: no tunnel target or website setting changes in this assignment.

## 2. Triggers (any one is enough to roll back at once)

Live Agent not `active`, or a new run of 5xx, 503 `ASSISTANT_BUSY` or timeouts in its journal; available memory under the stop threshold or swap growing; a staging restart, OOM kill or crash loop; a listening socket that is not on loopback (other than SSH); a UFW or sshd change that is not yours; staging answering a request without a valid signature; an unexpected process or file; or the owner says stop.

## 3. Steps, in order (about 2 minutes)

Run as `voltaadmin` with `sudo`. Use the script's action if it is already installed on the server; otherwise the manual commands.

1. Stop and disable staging (a non-running unit gives a harmless message):
   ```
   sudo systemctl stop volta-agent-staging
   sudo systemctl disable volta-agent-staging
   ```
   Or with the script: `sudo bash /tmp/stage-agent-second-instance.sh stop`.
2. Confirm port 8788 is closed and 8787 is still open:
   ```
   ss -H -tln 'sport = :8788'          # expected: no output
   ss -H -tln 'sport = :8787'          # expected: one line, 127.0.0.1:8787
   ```
3. Remove the staging files (this also deletes the copy of the catalogue credential):
   ```
   sudo bash /tmp/stage-agent-second-instance.sh remove
   ```
   Manual equivalent, for staging paths only:
   ```
   sudo rm -f /etc/systemd/system/volta-agent-staging.service
   sudo systemctl daemon-reload
   sudo systemctl reset-failed volta-agent-staging 2>/dev/null || true
   sudo rm -rf /opt/volta-agent-staging /etc/volta-agent-staging
   id voltastage >/dev/null 2>&1 && sudo userdel voltastage || true   # only if the corrected script created it
   ```
4. Delete the temporary files you created: the uploaded bundle (`/tmp/agent.new.mjs`) and the signing helper and request bodies in `/root/volta-staging-check/` (`sudo rm -rf /root/volta-staging-check`).
5. Run the confirmation checks in section 4.
6. Write down the time, the trigger and what was seen, without secrets. Leave the server running. Do not retry before the owner decides.

## 4. Confirm the live service was untouched

| Check | Command | Expected |
|---|---|---|
| Live Agent running | `systemctl is-active volta-agent` | `active` |
| Live Agent not restarted | `systemctl show volta-agent -p ActiveEnterTimestamp -p NRestarts` | `ActiveEnterTimestamp` equals the pre-check value; `NRestarts=0` |
| Live Agent files unchanged | `sha256sum /opt/volta-agent/agent.mjs /etc/systemd/system/volta-agent.service` | equal to the pre-check hashes |
| Live env unchanged (hash only, never `cat`) | `sudo sha256sum /etc/volta-agent/agent.env` | equal to the pre-check hash |
| Live answers (unsigned probe) | `curl -s -m 5 -o /dev/null -w '%{http_code}\n' 127.0.0.1:8787/v1/health` | `401` |
| Live journal quiet | `journalctl -u volta-agent --since "<start time>" --no-pager \| grep -c '"status":5'` | `0` new 5xx lines (count against the pre-check) |
| Ollama untouched | `systemctl show ollama -p ActiveEnterTimestamp -p NRestarts`; `ollama ps`; `systemctl cat ollama \| sha256sum` | same start time, `NRestarts=0`, only the live model loaded, same hash |
| Models unchanged | `ollama list` | the same five models as the pre-check |
| Firewall unchanged | `sudo ufw status verbose` | identical to the pre-check |
| SSH rules unchanged | `sudo sha256sum /etc/ssh/sshd_config.d/*`; `sudo sshd -T -C user=voltatunnel,host=x,addr=1.1.1.1 \| grep permitopen` | same hashes; `permitopen 127.0.0.1:8787` |
| Listeners | `ss -H -tlnp` | the same set as the pre-check, no 8788 |
| Memory back to normal | `free -m`; `uptime` | near the pre-check values |

If **any** of these differs, stop, do nothing further, and report to the owner with the output (no secrets).

## 5. What to do if the live Agent was affected

Only the owner decides. Options, mildest first: wait (a slowed live Agent recovers once staging is stopped and Ollama's queue drains); `sudo systemctl restart volta-agent` (loses in-memory sessions only; shoppers lose their chat context, no data is stored); restart Ollama (`sudo systemctl restart ollama`, the model reloads on the next request, 17 to 34 s cold load recorded for larger models). The Agent keeps no database, so there is nothing to restore. These are the only actions that touch live services and each needs the owner's instruction at that moment.

## 6. What must never be touched

- The live unit `volta-agent`, `/opt/volta-agent/`, `/etc/volta-agent/agent.env` (never print it), `/etc/systemd/system/volta-agent.service`.
- Ollama: its unit, settings, `/var/lib/ollama`, and every installed model (no `ollama rm`, `pull`, `stop` of the live model).
- The tunnel user `voltatunnel`, its key, and any `sshd_config.d` file; UFW and Fail2ban rules.
- The website server, its containers and `ai-tunnel`, DNS, the old AI server (2.29.97.114).
- Any backup, and any data the owner did not name.
- Process killing by name (`pkill node`, `killall node`): it would hit the live Agent. Use `systemctl stop volta-agent-staging` only.

## 7. If a later tunnel to staging is ever approved (separate document and approval)

Rollback of that change is separate: stop and remove the preview containers on the website server, remove the `voltatunnel2` block from `/etc/ssh/sshd_config.d/10-volta-tunnel.conf` (or its own file), run `sshd -t` and `systemctl reload ssh`, delete the `voltatunnel2` user and key, and confirm `sshd -T` for `voltatunnel` still shows only `127.0.0.1:8787`. The saved hashes from the pre-check are the reference.
