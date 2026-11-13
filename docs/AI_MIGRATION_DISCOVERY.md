# AI server migration: discovery (phase 1)

Status: **partial, by design.** Repository and documentation inspection is done. Server inspection is **blocked on SSH key access**: your brief says SSH keys only and never reuse a password pasted in chat, and I have no authorised key on either server. Nothing was changed anywhere. Every fact below says where it came from.

Written for: the project owner.

## 0. A security note first

A password for the new server was pasted into the chat together with its address. I did not use it. **Treat it as burned and change it**, and rotate the other passwords that appeared earlier in this conversation (see `AI_CREDENTIAL_ROTATION_CHECKLIST.md`). Key-based access is prepared in section 6.

## 1. What was verified in this task

| Item | Result | How |
|---|---|---|
| Repository and M3 documents read | Done: architecture, M3 plan and reports, security model, benchmark runbook, credential and disk plans | Files in `docs/` |
| New server `109.199.108.76` reachable on SSH | Yes | A protocol handshake only; **no login attempted** |
| New server OS | Ubuntu 24.04 LTS (banner `OpenSSH_9.6p1 Ubuntu-3ubuntu13`), a supported LTS | SSH banner |
| New server login methods offered | **public key and password** (password still enabled; to be disabled only after key login is verified) | SSH handshake |
| New server SSH host key (pin this) | `ssh-ed25519 SHA256:Kn67RHg1+oUTC1bNYQk2b+l7xU5WjItiNUP/USYL1X0` | SSH handshake |
| New server CPU, RAM, disk, network, virtualisation | **Not verified.** Stated in your brief (6 vCPU, 12 GB, 200 GB SSD or 100 GB NVMe, 300 Mbit/s) but unconfirmed | Needs access |

## 2. Old AI server (2.29.97.114): recorded in earlier sessions, not re-inspected in this task

| Area | What is known |
|---|---|
| Host | Hetzner Cloud server named `volta-ai`, Ubuntu 26.04 LTS, 2 vCPU, about 3.8 GB RAM, CPU only |
| Agent | `volta-agent.service` (user `voltaagent`), bundle `/opt/volta-agent/agent.mjs`, Node 24 at `/opt/node/current`, environment file `/etc/volta-agent/agent.env` (names include `AGENT_HMAC_KEYS`, `AGENT_HOST=127.0.0.1`, `AGENT_PORT=8787`, `OLLAMA_URL`, `AGENT_CHAT_REPLIES`), listening on loopback only |
| Model runtime | Ollama on `127.0.0.1:11434`, cloud models disabled, one model loaded at a time, 5-minute keep-alive |
| Models | Live: `qwen3:1.7b-q4_K_M` (Apache-2.0). Installed as well, to the best of my knowledge: the Sinhala model (`hf.co/namindu94/SinhalaLLM-1.7B:Q4_K_M`, switched off), Qwen3-4B variants and `qwen2.5:3b-instruct` (non-commercial licence, excluded). Exact installed tags need `ollama list` |
| Website link | `voltatunnel` user, sshd `Match` block: local forwarding only, `PermitOpen 127.0.0.1:8787`, `ForceCommand /bin/false`; the website's `ai-tunnel` container forwards `127.0.0.1:18787` to it with a pinned host key |
| Data | The Agent keeps sessions **in memory only** and stores no messages. No database, no RAG, no persistent service data are known to exist |
| Backups | None documented |

## 3. Website side of the integration (verified in the repository and on the website server today)

| Item | Detail |
|---|---|
| Containers | `volta-web-1`, `volta-ai-tunnel-1` (alpine ssh client sharing the web container's network, forwards 127.0.0.1:18787 to the AI server's 127.0.0.1:8787 as `voltatunnel`), plus db, mock ERP, order sync |
| Website settings (names) | `AI_ASSISTANT_ENABLED`, `AI_AGENT_URL=http://127.0.0.1:18787`, `AI_AGENT_HMAC_KEY_ID`, `AI_AGENT_HMAC_SECRET`, `AI_ASSISTANT_PREVIEW_KEY` (now empty: the assistant is public), `AI_ASSISTANT_DEMO_DATA` |
| Tunnel files | `/opt/valta/ai-tunnel/id_ed25519` (private key) and `known_hosts` (pinned AI server host key) |
| Where a switch happens | The tunnel's target host (`voltatunnel@<ip>`) in `docker-compose.yml`, the pinned `known_hosts`, and the tunnel key. The Agent's signing keys need no change if the same `AGENT_HMAC_KEYS` are installed |

## 4. Dependency map

```
Shopper ─► valta.hexalyte.com (nginx, website server 46.62.143.151)
              └─ web container ─► POST /api/assistant/chat (guards, session, HMAC signing)
                    └─ ai-tunnel container ──ssh -L──►  AI server  voltatunnel (forward only)
                                                          └─ 127.0.0.1:8787  volta-agent (router, tools, verifier, scheduler)
                                                                └─ 127.0.0.1:11434  Ollama ─► model files
Admin QA centre (development only) ─► the same Agent path
Not yet existing: RAG index, real browser worker, speech services, vision/document services
```

## 5. Still to discover (needs key access)

Old server: exact installed model tags and sizes, Ollama environment, disk and memory use, any extra services, firewall state, the real SSH configuration, backups. New server: real CPU model and flags (AVX2 or AVX-512 matter for CPU inference), RAM, disk type and size, network speed, virtualisation, existing packages and users, firewall, time sync. The read-only script `tools/ops/server-inventory.sh` collects all of this and prints variable **names** only, never values.

## 6. How to give me access (no password involved)

Create a separate admin user on the **new** server and authorise a key made for this migration (the private half is only on this computer). Run on the new server console as root:

```
adduser --disabled-password --gecos "" voltaadmin
usermod -aG sudo voltaadmin
install -d -m 700 -o voltaadmin -g voltaadmin /home/voltaadmin/.ssh
echo 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIJTv5PWEQ+eBEixa77RamqZfimxXk1PGebHeTzWAlpcR claude-migration-2026-11-13-REMOVE-AFTER-MIGRATION' > /home/voltaadmin/.ssh/authorized_keys
chown voltaadmin:voltaadmin /home/voltaadmin/.ssh/authorized_keys && chmod 600 /home/voltaadmin/.ssh/authorized_keys
echo 'voltaadmin ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/90-voltaadmin-migration && chmod 440 /etc/sudoers.d/90-voltaadmin-migration && visudo -cf /etc/sudoers.d/90-voltaadmin-migration
```
The passwordless sudo is **temporary** for the migration and is removed in the hardening step. Do not turn off password login yet; that happens only after key login is verified from a second session. For the **old** server, discovery is read-only: either run `server-inventory.sh` there yourself and send me the output, or tell me and I will give you a key restricted to run only that script (a forced command), so the key cannot do anything else.

Fingerprint of the key I will use: `SHA256:AxJH9+QBA/u7DOMZim1aMAEWiIN8xaQBvd2mdAwB2n8`.
