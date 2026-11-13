# Credential rotation: access preparation and draft execution plan

Status: **preparation only.** Nothing was changed: no SSH setting, no user, no key, no password, nothing revoked, no server logged into. The script and commands below are for review; the execution plan in section 7 is a **draft that needs your separate approval, step by step**.

Written for: the project owner. This builds on `AI_CREDENTIAL_ROTATION_CHECKLIST.md` (what is exposed and in what order to rotate).

## 1. Approved now, and still not allowed

| Approved (preparation) | Not allowed yet |
|---|---|
| SSH key and access preparation (planning) | Changing SSH configuration |
| Admin-user inventory | Creating or removing users |
| Access verification and rollback planning | Rotating keys or changing passwords |
| Identifying exposed credentials and what depends on them | Revoking any credential |

## 2. Step 1: take the access inventory (read-only)

`tools/ops/access-inventory.sh` lists who can log in and how SSH is set up. It writes and restarts nothing; it never prints password hashes, private or public key bodies, environment files or secret values. It prints account names, shells, groups, **key fingerprints**, permission bits, effective SSH settings (`sshd -T`), recent logins, failed-attempt counts, listening ports, the firewall state and the permissions of the service secret files.

```
sudo bash tools/ops/access-inventory.sh | tee /tmp/access-inventory.txt
```
Run it on both servers (46.62.143.151 and 2.29.97.114) and send me the output privately (it names accounts and addresses). I will fill sections 3 and 4 with the facts.

## 3. Admin-user inventory (to fill from the output)

| Server | Account | Login shell | In sudo or admin group | Password state | Key fingerprints | Used by | Keep, replace or remove |
|---|---|---|---|---|---|---|---|
| Website | root | ? | n/a | ? | ? | You, deployments | Plan: stop direct root login |
| Website | (named admin) | | | | | | |
| Website | `voltatunnel`? (on the AI server only) | | | | | tunnel | Keep, new key |
| AI server | root | ? | n/a | ? | ? | You, deployments | Plan: stop direct root login |
| AI server | `voltaagent` | nologin expected | no | locked expected | none expected | `volta-agent.service` | Keep |
| AI server | `voltatunnel` | /bin/false expected | no | ? | one key | website tunnel | Keep, new key |

Target state (for later): one named administrator account per person with `sudo`, key-only SSH, no direct root login, no shared accounts, the tunnel account limited to the single forwarded port (already so), and a documented break-glass path through the hosting panel console.

## 4. Exposed credentials and what depends on them

| Credential | Services that break if it changes wrongly | Symptom | How to verify it works afterwards (no secret printed) |
|---|---|---|---|
| Server root passwords | Your own access | Locked out | A second terminal logs in with the new method before the first closes |
| Preview link key | Everyone's access to the AI on the live site | The AI button disappears for existing browsers | Open the new link once: the button appears |
| Agent signing key (website `AI_AGENT_HMAC_*`, Agent `AGENT_HMAC_KEYS`) | Every AI chat message | Chat shows a generic error; Agent `/v1/metrics` authentication-failure counter rises | A test chat through the private preview link answers; the counter stays flat |
| Tunnel key (`voltatunnel`) | Website to Agent connection | `ai-tunnel` container restarts or errors; chat errors | `docker ps` shows `ai-tunnel` Up; a chat answers |
| Admin console password | Admin area | Cannot log in | Log in once |
| `POSTGRES_PASSWORD`, `DATABASE_URL` | Customer accounts | Account pages fail | Log in as a test customer |
| `ORDER_SYNC_SECRET` | Order sync | Orders stop syncing | One test sync call |
| `SETTINGS_ENCRYPTION_KEY` | Stored settings | Settings unreadable | Admin settings page loads (only after a tested re-encryption) |
| `HX_STORE_CREDENTIAL` | ERP access | Catalogue empty | Products load |
| WhatsApp and other tokens | Support chat | Messages stop | One test message |
| Registrar, hosting, GitHub | Control of the site | n/a | Two-factor enabled; recovery codes stored offline |

## 5. SSH key and access preparation (planning, nothing created on a server)

1. **Your key pair:** on your own computer, `ssh-keygen -t ed25519 -a 100 -C "<your-name>-valta-admin"`, protected by a passphrase and stored in your password manager or an agent. A hardware security key is better if you have one. The private key never leaves your computer and is never pasted anywhere.
2. **Public key:** only the `.pub` file is ever copied to a server, later, by the approved procedure.
3. **Recovery path:** confirm you can reach each server's console through the hosting panel without SSH. This is the safety net if a key or setting is wrong. Record where it is and who can use it.
4. **Two sessions rule:** every access change is made from one terminal and tested from a second before the first is closed.
5. **Tunnel key:** a separate key pair generated on the website server for `voltatunnel`; its public key goes to the AI server's `authorized_keys` with the existing restrictions kept (`permitopen` to the single port, no shell).
6. **Backups before changes:** a dated copy of `sshd_config`, `/etc/ssh/sshd_config.d/`, `authorized_keys` files and the compose environment files, stored on the server with root-only permissions.

## 6. Access verification and rollback checklist (used in every step)

Before: second terminal open and logged in; hosting console reachable; backup copies of the files to be changed exist; `sshd -t` passes after an edit and before a reload (`sshd -t` is a syntax check that changes nothing); a revert timer is armed for any SSH setting change (for example `systemd-run --on-active=10m` running a script that restores the backed-up config and reloads sshd; it is cancelled only after the second terminal proves access).
After: log in from a **new** terminal with the new method; confirm the old method is refused (once); run the site, preview-chat and tunnel checks from section 4; record the date and fingerprint or id (never the secret).
Rollback: restore the backed-up file, reload the service, verify, and write down what happened before trying again.

## 7. DRAFT execution plan (for your review; none of it has been run)

Each step needs your explicit approval when you choose to do it. "Approval" below means a separate written yes for that step.

| # | Step | Preconditions | Verification | Rollback | Impact |
|---|---|---|---|---|---|
| 1 | Run both inventory scripts; fill sections 3 and 4 | none | Output reviewed | n/a | None (read-only) |
| 2 | Confirm hosting-console access to both servers | step 1 | You can open each console | n/a | None |
| 3 | Create your key pair on your computer | step 2 | Fingerprint noted | Delete the key | None |
| 4 | Create a named admin user with sudo on each server and add your public key (**needs approval**) | steps 1 to 3 | Log in as that user and run `sudo -n true` once from a new terminal | Remove the user | Adds an account |
| 5 | Change the root password in the hosting panel (**needs approval**) | step 4 works | New password logs in at the console | Panel reset | Existing root sessions unaffected |
| 6 | Disable SSH password login and direct root login (**needs approval**; revert timer armed) | step 4 proven from a second terminal | New terminal with key works; password attempt refused | Revert timer or restore the backup | Anyone relying on a password loses access |
| 7 | Replace the tunnel key: new pair, add the new public key, restart `ai-tunnel`, verify, remove the old key (**needs approval**) | steps 4 and 6 | Chat answers through the tunnel; `docker ps` Up | Put the old key back before removing it from the AI server | A few seconds of AI errors |
| 8 | Signing secret: add a second key, switch the website, verify, remove the old key (**needs approval**) | step 7 | Preview chat answers; auth-failure counter flat | Re-add the old key | None if done in this order |
| 9 | Preview key: set a new key, recreate the web container (**needs approval**) | step 8 | New link works; old cookie no longer shows the button | Restore the old environment value | All existing browsers must use the new link |
| 10 | Application secrets (admin password, database, order sync, encryption key with re-encryption on a copy first, ERP credential, WhatsApp) (**each needs approval**) | database backup exists and restore is tested | Section 4 checks per item | Per-item rollback in the checklist | Short restarts |
| 11 | Remove `voltatunnel` and other obsolete keys and shell history copies; record the rotation date (**needs approval**) | steps 7 to 10 | Old values refused | n/a | None |

Open questions for you: which accounts and third-party services exist (registrar, hosting panel, GitHub, DNS, WhatsApp provider), who besides you needs administrator access, and whether the hosting panel offers a console and snapshots (a snapshot before step 6 is the best rollback).
