# Credential rotation checklist (preparation only: nothing has been rotated)

Status: **a plan.** No credential has been changed, deleted or revoked, no server was logged into, and no secret value appears in this document. Each step below needs your explicit approval when you decide to do it.

Written for: the project owner, who will perform or approve each step.

## 1. What is exposed, and what is only possibly exposed

"Confirmed" means it was pasted into the chat or a screenshot. "Possible" means it was created or handled during this project and may appear in session transcripts or tool output; I cannot verify that, so it is listed for safety. **Claude Code stores session transcripts on your computer (`C:\Users\Akila\.claude\projects\...`); treat them as sensitive and do not share them.**

| # | Credential | Where it lives | Exposure | Used by |
|---|---|---|---|---|
| 1 | Root/admin password, **website server** (46.62.143.151) | Hosting account / server | **Confirmed** (pasted in chat, several times) | Everything on that server |
| 2 | Root/admin password, **AI server** (2.29.97.114) | Hosting account / server | **Confirmed** (pasted in chat) | Agent, Ollama, sshd |
| 3 | Assistant **preview link key** (`AI_ASSISTANT_PREVIEW_KEY`) | Website container environment | **Confirmed** (the full link was shared in chat) | Gates who can see the AI on the live site |
| 4 | Agent request-signing secret: `AI_AGENT_HMAC_SECRET` (website) and `AGENT_HMAC_KEYS` (AI server `/etc/volta-agent/agent.env`) with key id `AI_AGENT_HMAC_KEY_ID` | Both servers | Possible (generated and installed during deployment) | Signs every website to Agent request |
| 5 | **SSH tunnel key** for user `voltatunnel` (private key in `/opt/valta/ai-tunnel/id_ed25519`, public key in the AI server's `authorized_keys`) | Website server and AI server | Possible | Carries the website to Agent connection |
| 6 | Website admin console password(s) and `ADMIN_EMAILS` accounts | Website database | Possible (an admin password was used during testing) | Admin area |
| 7 | `POSTGRES_PASSWORD` / `DATABASE_URL` | `/opt/valta` environment | Possible | Customer-accounts database |
| 8 | `ORDER_SYNC_SECRET` | Website environment | Possible | The internal order-sync call |
| 9 | `SETTINGS_ENCRYPTION_KEY` | Website environment | Possible | Encrypts stored settings (**rotating needs a re-encryption step**) |
| 10 | `HX_STORE_CREDENTIAL` (ERP store credential, form `hxs_<id>.<secret>`) | Website environment | Possible; today the site points at the mock ERP | ERP access. Rotate in the ERP, not here |
| 11 | WhatsApp and other third-party tokens configured in the admin area | Website database / environment | Unknown | WhatsApp support chat |
| 12 | Registrar, hosting-panel, GitHub, Let's Encrypt/DNS accounts | External | Unknown | Control of the site and its certificates |

Also review: shell history and `.bash_history` on both servers, `/root` copies of backups, and the Ceylora backup at `E:\ceylora-backup-20261112` and `/root/ceylora-final-backup` (may contain that project's credentials).

## 2. Order of work (recommended)

Order is chosen so that nothing locks you out and the live preview keeps working. Do one item at a time and verify before the next.

1. **Prepare access first.** Create an SSH key pair on your computer (protected by a passphrase) and add its public key to both servers **before** changing any password, so you can log in afterwards. Keep the hosting panel's console/recovery login open in another window.
2. **Items 1 and 2 (server passwords).** Change the root password in the hosting panel or with `passwd` (a new random value from a password manager, at least 20 characters). Then **disable password login for SSH and disable direct root login** (`PasswordAuthentication no`, `PermitRootLogin prohibit-password` or a named admin user with sudo). *This is an SSH configuration change: it needs separate approval, and must be tested from a second terminal before the first is closed.*
3. **Item 5 (tunnel key).** Generate a new key pair for `voltatunnel`, add its public key to the AI server, put the private key in `/opt/valta/ai-tunnel/` (mode 600), restart `ai-tunnel`, verify the tunnel, then **remove the old public key** from `authorized_keys`.
4. **Item 4 (signing secret), zero downtime.** The Agent accepts several keys (`AGENT_HMAC_KEYS=id:secret,id2:secret2`, at most the configured maximum). Add a new key (new id) on the AI server and reload the Agent; set the website to the new id and secret and recreate the web container; verify; then remove the old key from the Agent.
5. **Item 3 (preview key).** Set a new random `AI_ASSISTANT_PREVIEW_KEY` (at least 16 characters; 32 or more recommended) in the website environment and recreate the web container. The cookie value is derived from the key, so **every browser that holds the old cookie loses access at once**: that is the intended revocation. Share the new link only privately, and never paste it in chat or a ticket.
6. **Items 6 to 9.** Admin password reset through the admin area; `POSTGRES_PASSWORD` changed inside Postgres first and then in the environment, with the app restarted; `ORDER_SYNC_SECRET` changed on both the website and the sync caller together; `SETTINGS_ENCRYPTION_KEY` **only with a re-encryption procedure** (rotating the key without re-encrypting makes stored settings unreadable: take a database backup and test on a copy first).
7. **Items 10 to 12.** Rotate the ERP store credential in the ERP admin (it is shown once), update the website secret store, verify; rotate WhatsApp tokens at their provider; review and rotate account passwords, enable two-factor sign-in on the registrar, hosting panel and GitHub.

## 3. For each rotation: procedure and verification

| Step | How to do it safely | How to verify (without printing the secret) | Rollback |
|---|---|---|---|
| Generate | Use a password manager or `openssl rand -base64 32`; never type a secret into a command line that is logged; use files with mode 600 | n/a | Keep the old value until the new one is proven, then destroy the old |
| Store | Only in the host's secret store or the `.env` file with mode 600, owned by the service user; never in git, chat, tickets or screenshots | `ls -l` shows 600; `git status` shows no env file | Restore the previous file from the dated backup you made first |
| Apply | Change on one side, then the other, in the order above; restart only the affected service | The site loads; `/api/assistant/chat` through the private preview link answers; the Agent log shows `status 200` without auth errors | Put the previous value back and restart the service |
| Verify | Check the tunnel is up, the preview cookie works, the Agent's authentication-failure counter in `/v1/metrics` does not rise | Counters and HTTP codes only; **never print environment variables or key files** | As above |
| Revoke | Remove the old key, password or token **after** the new one is proven | An attempt with the old value must fail (test it once) | Not applicable: revocation is the goal |

Log hygiene while doing this: run commands so that secrets are read from files or prompts, not passed as arguments; do not run `env`, `printenv`, `cat` on key or environment files, or `docker inspect` with output shared anywhere.

## 4. Impact and downtime

| Item | Expected impact |
|---|---|
| Passwords (1, 2) | None if SSH keys are in place first |
| Tunnel key (5) | A few seconds of AI errors while `ai-tunnel` restarts; the site is unaffected |
| Signing secret (4) | None when done with two keys; otherwise brief AI errors |
| Preview key (3) | Everyone with the old link, including you on each device, must use the new link once |
| Database and encryption (7, 9) | A short restart of the web container; `SETTINGS_ENCRYPTION_KEY` has the highest risk and needs a tested procedure |

## 5. After rotation

Record the date and who did it (no values). Search the repository, the worktree and `docs/` for any pasted secret and remove it (this plan names variables only). Remind everyone that the chat pastes must be treated as burned. Schedule the next review (at least yearly, and on every staff change).

## 6. What I need from you

Approval per step (this plan changes nothing), the hosting-panel access to reset root passwords, a decision on moving to named admin users with sudo and key-only SSH, and confirmation of which third-party accounts exist (item 11 and 12).
