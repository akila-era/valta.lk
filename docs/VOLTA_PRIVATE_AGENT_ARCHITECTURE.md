# Private staging Agent: architecture

Date: 2026-11-14. Author: Agent D (Infrastructure and Security). Written for: the project owner first, then operators.

> **EXECUTION IS BLOCKED pending explicit owner approval.** Nothing described here has been run. The script `tools/ops/stage-agent-second-instance.sh` was only syntax-checked (`bash -n`). No server was contacted while writing this document. Related documents: `VOLTA_PRIVATE_AGENT_SECURITY_REVIEW.md`, `VOLTA_PRIVATE_AGENT_RESOURCE_PLAN.md`, `VOLTA_PRIVATE_AGENT_RUNBOOK.md`, `VOLTA_PRIVATE_AGENT_ROLLBACK.md`.

## 1. In plain words

The AI server already runs the **live** Agent that answers real shoppers. We want to test a newer Agent build without risking those shoppers. The plan is to start a **second copy** of the Agent on the same server, hidden from the internet and from the website, test it from the server itself, then switch it off and delete it. Shoppers never reach the second copy, because the only road into the AI server (the website's SSH tunnel) is allowed to lead to the live Agent only.

What is shared and therefore the real risk: the second copy uses the **same Ollama** (the program that runs the language model) and the same CPU and RAM. A test that is too heavy slows the live service even though the two Agents are separate. That is why the runbook keeps the test small and has stop conditions.

## 2. Measured facts, estimates, recommendations

| Label | Meaning |
|---|---|
| Measured / recorded | Taken from the repository documents or earlier runs on this server |
| Estimate | A reasoned figure, not measured; marked "(estimate)" |
| Recommendation | What this document advises; needs the owner's decision |
| Unknown | Not known from the repository; must be checked read-only first |

## 3. What runs where (after approval, during the test)

| Component | Unit / process | User | Listens on | Files | Status |
|---|---|---|---|---|---|
| SSH | `ssh` | root (sshd) | 0.0.0.0:22 and [::]:22 (restricted, key only) | `/etc/ssh/sshd_config.d/00-volta-hardening.conf`, `10-volta-tunnel.conf` | Measured: hardened |
| Live Agent | `volta-agent` | `voltaagent` | 127.0.0.1:8787 | `/opt/volta-agent/agent.mjs`, `/etc/volta-agent/agent.env` (640 root:voltaagent) | Live, **never touched** |
| Ollama | `ollama` | `ollama` | 127.0.0.1:11434 | `/usr/local/bin/ollama`, `/var/lib/ollama` (models) | Shared, never touched |
| Tunnel user | none (sshd session) | `voltatunnel` (no shell) | forward only to 127.0.0.1:8787 | `/home/voltatunnel/.ssh/authorized_keys` | Never touched |
| **Staging Agent** | `volta-agent-staging` | `voltaagent` in the script as written; **`voltastage` recommended** (security review finding 1) | **127.0.0.1:8788** | `/opt/volta-agent-staging/agent.mjs`, `/etc/volta-agent-staging/agent.env` | New, temporary, not enabled at boot |

Ports: 22 public (existing), 8787 live loopback, 8788 staging loopback, 11434 Ollama loopback. Nothing new is public. The Agent refuses to start on a non-loopback host unless `AGENT_ALLOW_NON_LOOPBACK=true` is set (`apps/agent/src/config.ts`); the script does not set it. Operating-system resolver listeners (for example `127.0.0.53:53`) may also appear in `ss`: unknown, record them in the pre-check.

## 4. How the private Agent is reached

**Only from the server itself.** An operator logged in as `voltaadmin` (key-only SSH) runs signed HTTP requests against `http://127.0.0.1:8788`. The Agent authenticates every request (`apps/agent/src/auth/hmac.ts`, `http/server.ts`):

1. Headers `x-volta-key-id`, `x-volta-timestamp`, `x-volta-nonce`, `x-volta-identity`, `x-volta-client-ip`, `x-volta-signature`.
2. The HMAC-SHA-256 covers timestamp, nonce, method, path, identity, client IP and the SHA-256 of the body. Clock skew over 60 s is refused (`MAX_SKEW_SEC`). Each nonce is accepted once for 120 s (replay cache, fails closed when full).
3. Unsigned or wrongly signed requests get 401; repeated failures from one socket address are slowed (`AGENT_AUTH_FAIL_PER_MIN`).
4. Rate limits by signed client IP, by identity plus session id, new sessions per hour. The script raises these to 300 per minute for staging; with loopback-only access this is acceptable, but a lower queue depth is recommended (resource plan).
5. Session isolation: a session id belongs to the identity that first used it; the same id from another identity is refused with `VALIDATION_FAILED` ("This session id cannot be used"). Guests are `anon`, customers `cust:<id>`.
6. Logs record route, status, latency, identity kind and error codes only; there is no field for message text (`observability/logger.ts`).

The staging signing key is generated on the server (`stg1`, 64 hex characters) and is different from the live chat key. It is stored only in `/etc/volta-agent-staging/agent.env` (mode 640, group of the service user). The runbook never prints it; the signing helper reads it from the file.

**Not reachable from the website, by design.** The website tunnel user `voltatunnel` has `PermitOpen 127.0.0.1:8787` only, `ForceCommand /bin/false`, no TTY, local forwarding only (`add-tunnel-user-new-server.sh`). Port 8788 is not permitted, so even a mistaken website setting cannot reach staging.

## 5. Future option: test through the website (SEPARATE approval, designed here, NOT executed)

Testing the full shopper path (cards, contract 1.2) needs the website to reach 8788. This changes the AI server's sshd rules and the website server, so it is a **separate owner approval** and is not part of this assignment. Recommended design, to keep live and staging separated:

1. **A second tunnel user, not an edit of the first.** On the AI server create `voltatunnel2` (same pattern as `add-tunnel-user-new-server.sh`) with its own key and `Match User voltatunnel2 ... PermitOpen 127.0.0.1:8788`. Leave the existing `Match User voltatunnel` block with `PermitOpen 127.0.0.1:8787` byte-for-byte unchanged. Add the user to `AllowUsers`. Reason: widening the live user's `PermitOpen` to two ports would let the live tunnel key reach staging, and a leaked staging path would not be separable from live.
2. **Validate before reload:** `sshd -t`, then `sshd -T -C user=voltatunnel,host=x,addr=1.1.1.1 | grep permitopen` must still show only 8787, and the same command for `voltatunnel2` only 8788. Keep a copy of the sshd drop-ins (hash recorded) for rollback.
3. **On the website server:** a second tunnel container (for example `ai-tunnel-staging`, forward `18788` to 127.0.0.1:8788, its own key, its own pinned host key) and a **preview-only** web container whose `AI_AGENT_URL` points to it, gated by the existing `AI_ASSISTANT_PREVIEW_KEY` so public visitors never see it. The production `ai-tunnel` and `web` containers are not recreated. Container names, compose profile and image tags: unknown, to be read from the website server first.
4. The staging key id and secret would have to be shared with that preview container through the existing secret store, never through chat or this repository.
5. Each of these is its own gate with its own rollback (remove `voltatunnel2` block, reload sshd, stop and remove the preview containers).

## 6. Network isolation checks (before, during, after)

Run with `voltaadmin` over SSH. Expected results are in the runbook; summary:

| Check | Command | Pass condition |
|---|---|---|
| Listening sockets | `ss -H -tlnp` | Only :22 may be on `0.0.0.0` or `[::]`; 8787, 8788, 11434 on 127.0.0.1 only |
| No public listener for 8788 | `ss -H -tln 'sport = :8788'` | Exactly one line, local address `127.0.0.1:8788` |
| Firewall unchanged | `sudo ufw status verbose` | Identical to the saved pre-check (default deny incoming, SSH limit) |
| SSH forwarding rules unchanged | `sudo sshd -T -C user=voltatunnel,host=x,addr=1.1.1.1 \| grep -E '^(allowtcpforwarding\|permitopen\|forcecommand\|permittty) '` and `sha256sum /etc/ssh/sshd_config.d/*` | `permitopen 127.0.0.1:8787`; hashes equal the pre-check |
| Staging not tunnel-reachable | the same `sshd -T` output | 8788 appears nowhere |
| Session isolation | signed chat with one session id under identity `anon`, then the same id under `cust:stgtest` | second call refused (`VALIDATION_FAILED`) |
| Replay and bad signature | resend an identical signed request; sign with a wrong key | both 401 |
| Other-process access | as the staging user (service): read of `/etc/volta-agent/agent.env` | must fail (only with the recommended separate user and `InaccessiblePaths`) |

An outside-in port scan is **not** performed in this assignment (no network calls). If the owner wants one later, it is a separate, approved action from a trusted host against the server's public address.

## 7. Boundaries (what is explicitly not changed)

Live unit, live bundle, live env file, Ollama unit and settings, models (nothing pulled, removed or switched), UFW, Fail2ban, sshd, the tunnel user, the website server, DNS. The script as written adds one unit, two directories and (recommended) one system user.
