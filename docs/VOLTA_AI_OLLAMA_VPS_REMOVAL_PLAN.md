# Ollama, Qwen and AI VPS removal plan (PLAN ONLY: nothing here has been run)

Date: 2026-11-14. Written for: the project owner. Evidence: the read-only inventory and dependency map (13 dependencies, 37 components) gathered from existing audit evidence; labels: **VERIFIED** (read on a live system or in code), **UNKNOWN** (no evidence), **DECISION** (owner), **NOT RUN**. **Every step below needs the owner's separate explicit approval. No server, container, model, backup, DNS record, tunnel, key or account is touched by this document.** The old AI server (2.29.97.114) is never contacted by this plan: its steps are owner-side (hosting panel).

## 1. What "remove" means (and what must stay)

| Goes away (after cutover and a rollback window) | Must be PRESERVED (not AI-related; do not touch) |
|---|---|
| Ollama service and port 11434; models `qwen3:1.7b-q4_K_M` (production), `qwen3.5:4b`, `gemma4:e4b`, `qwen3.5:9b` (experimental, installed per docs, `ollama list` never captured: UNKNOWN); local inference; the 12 GB / 6-vCPU host; model storage (~18 GB if all four are present, unproven) | Website host 46.62.143.151: `volta-web-1` and its image tags, `volta-db-1` and volume `db-data` (accounts, orders, content), `volta-order-sync-1`, nginx vhost `valta.hexalyte.com` (incl. `/demo-erp/uploads` while mock-erp is referenced), TLS certs and renewal, `/opt/valta/.env` and compose, the `hexalyte.com`/`partner.hexalyte.com` tenant, host Postgres, UFW 80/443/8080, backups folder |
| `volta-agent` unit on that host, bundles, `agent.env`, `/opt/node` | The website's signed read-only relay (`/api/internal/ai/erp/*`): it is the pattern for the new gateway's reads |
| Tunnel container `volta-ai-tunnel-new`, `/opt/valta/ai-tunnel-new/{id_ed25519,known_hosts}`, sshd users `voltatunnel`/`voltaadmin` there, UFW/Fail2ban rules there | HEXALYTE ERP, Let's Encrypt, GitHub, WhatsApp integration |

**Still needs hosting (cannot "disappear"):** the AI Gateway/Agent process (small: 44 MB resident; placement is a DECISION: container on the website host after disk is freed (recommended in the architecture document), or a small separate host) and the Browser Controller (Chromium 0.2-0.5 GB plus about 150 MB disk: does not fit the website host; isolated host required, per the brief "separate from the website host unless testing proves it safe"). So the end state is "no inference VPS", not "no server".

## 2. Preconditions to START (all must be true; each has a read-only check)

| # | Precondition | Check (read-only; NOT RUN) |
|---|---|---|
| P1 | Gemini path serves 100% of customer traffic and has passed its go/no-go criteria for the agreed soak period | gateway metrics, budget report |
| P2 | Rollback drill passed: traffic can return to the old path (website first, then Agent) | drill report |
| P3 | Zero production requests reach the AI VPS for N consecutive days (N = DECISION, proposed 14) | AI server journal: count `/v1/chat` lines per day = 0 (the tunnel container logs); website `AI_AGENT_URL` points to the gateway |
| P4 | No component still reads `OLLAMA_URL`, `AGENT_QWEN_MODEL`, the tunnel, or the AI host IP (website env, compose, scripts, QA centre) | `grep` of website env names/compose; repo scan for `18787`, `109.199.108.76`, `2.29.97.114` |
| P5 | Owner confirmed what the old server is (powered? billed? referenced by backup tunnel config or DNS) | hosting panel view (owner); `dig +short` of any related names |
| P6 | Database backup + restore verified on the website server (UNKNOWN today) | backup folder, schedule, restore test |
| P7 | Everything worth keeping archived off the VPS: benchmark results (already quoted in docs), the exact `ollama list` output, configs and unit files, `.bak-*` bundles if wanted | owner copy |
| P8 | Security prerequisites from the remediation plan are closed (port 8090, client IP trust, preview key, credentials rotation plan) | remediation plan checklist |

## 3. Stages (each: action, go/no-go, verification, rollback). NOT RUN; each needs approval.

| Stage | Action | Go/no-go | Verify | Rollback |
|---|---|---|---|---|
| R0 | Freeze: no more deploys to the AI VPS; announce the window | P1-P8 true | n/a | n/a |
| R1 | **Soft-disable** inference on the AI VPS: stop (do not delete) `ollama` and `volta-agent` services | P3 held; website no longer calls the tunnel | site and gateway healthy for 48 h; zero errors mentioning the tunnel; no alert | `systemctl start ollama volta-agent` (+ website path not needed) |
| R2 | Website-side cleanup, ONE change at a time: remove the `volta-ai-tunnel-new` container and its restart policy; remove the stopped compose services `ai-tunnel`/`ai-agent` (these start accidentally with a bare `docker compose up -d`); remove the AI env variable names no longer used (`AI_AGENT_URL` old value etc., after the gateway variables are set) | R1 stable 7 days | `docker ps`, site 200, gateway health, assistant works; compose config validates | restore compose/.env backups (`cp -a` before editing), recreate containers with the documented commands; the tunnel `docker run` text is in the remediation plan |
| R3 | Credentials and keys: remove the temporary SSH keys (`…REMOVE-AFTER-MIGRATION`, `…REMOVE-AFTER-USE`) from every server where installed; rotate the exposed credentials (website root, AI server panel/rescue, old server root, hosting accounts); revoke the Gemini key that was pasted in chat and any old HMAC keys | R2 done | fingerprint listing of `authorized_keys`; test the NEW access first | keep the owner's own access path open until the last step |
| R4 | Archive then remove model files and the Agent runtime from the AI VPS (only if the VPS will be kept for something else; otherwise skip: deletion of the whole server covers it) | owner confirms archive complete | `ollama list` captured before deletion | n/a (restore from archive) |
| R5 | Cancel billing and delete the AI VPS (new server 109.199.108.76) in the hosting panel; confirm data-retention terms and that disks are wiped by the provider | R1-R3 stable for the agreed window; owner approval in writing | provider invoice shows termination | provider-dependent (some providers allow reinstate for a short period: UNKNOWN) |
| R6 | OLD server 2.29.97.114: owner checks the panel; if still billed and unused, cancel; **no SSH, no probe**; remove its entries (compose `ai-tunnel` target, pinned `known_hosts`, the saved `backup-ai-tunnel-20261113-155746/` directory only after the owner no longer needs the old rollback path) | owner decision | panel | n/a |
| R7 | Documentation: archive the Ollama-era scripts (`deploy-agent.sh`, `install-agent-new-server.sh`, `switch-qwen-model.sh`, harden/add-tunnel/install-ollama scripts, `stage-agent-second-instance.sh`) and replace the runbook with the gateway runbook | R5 done | docs reviewed | git history |

## 4. Order rules (learned the hard way; do not violate)

1. **Remove nothing before the replacement is verified at 100% and the rollback window has ended.** Rollback while the VPS exists is a config change; after deletion it is a rebuild.
2. Stop before delete; archive before delete; one change at a time; back up every file you edit (`cp -a`); never delete a backup, image or model without the owner's explicit approval in that step.
3. Website first, then the AI side (contract/version lesson from contract 1.2); never run `deploy-web.sh` as written or a bare `docker compose up -d` (starts stopped services and clashes on port 18787).
4. Never run several SSH sessions in parallel (UFW rate-limits port 22 on both servers; timeouts are not bans).
5. Do not remove DNS records, tunnels or credentials without checking every dependency in section 2 first; DNS provider and records are UNKNOWN today.
6. No benchmark or heavy work on a host that still serves shoppers.

## 5. Decisions needed from the owner

Gateway host (website container vs small VPS) and Browser Controller host; soak length N (proposed 14 days) and rollback window (proposed 30 days after 100%); whether to keep the new AI VPS for the Browser Controller instead of deleting it (it has the RAM; it would then need hardening, Chromium installation and an isolated user: separate approval); what to do with the old server; who owns the hosting accounts and billing; what to archive; whether a backup/restore test is acceptable before any removal.

## 6. Status

PLAN ONLY. Nothing removed, stopped, deleted or changed. The AI VPS, Ollama and the models remain in production use today.
