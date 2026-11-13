# AI server migration: rollback plan

Status: plan. Nothing has been executed. The design makes rollback cheap: the old server is never modified and the Agent keeps no data, so there is nothing to restore from the new server back to the old.

Written for: the project owner, and whoever performs the cutover.

## 1. Why rollback is simple

- **Old server untouched.** It keeps serving until cutover and for at least 14 days afterwards. It is never changed, upgraded or retired as part of the migration.
- **No data to move back.** The Agent holds sessions in memory only and stores no messages; there is no database or RAG on the old server. Model files can be pulled again at any time.
- **One switch.** The website reaches the AI service only through the `ai-tunnel` container. Cutover changes that container's target, and rollback changes it back.

## 2. Before cutover: record the exact way back

Take these from the website server and keep them in the backup report: the current `docker-compose.yml` section of `ai-tunnel` (target host `voltatunnel@2.29.97.114`), the pinned `known_hosts`, the tunnel key's fingerprint, the website `.env` AI variable **names** and values' presence (not their values), and the current image tags (`volta/web:latest` and its rollback tag). Make the new target a separate, clearly named change so the old one can be restored from the saved copy.

## 3. Rollback triggers (any one is enough)

New AI service unhealthy or unreachable for more than 3 minutes; error rate above what the old server showed in the same period; reply latency clearly worse than the agreed limit; out-of-memory kill, swap thrash or CPU saturation on the new host; a security finding (for example an unexpected open port); wrong or unsafe answers in the post-cutover smoke tests; or your instruction.

## 4. Rollback steps (about 2 to 3 minutes)

1. On the website server, restore the saved `ai-tunnel` target and pinned host key (the old server's).
2. `docker compose --profile ai-tunnel up -d --no-build --force-recreate ai-tunnel` (and `web` only if its environment changed).
3. Check: the tunnel container is Up; the Agent answers through the tunnel (a 401 from `/v1/health` means the Agent is up); a private test chat answers; the public site is unaffected.
4. Confirm in the logs that traffic reaches the old server, and write down what triggered the rollback.
5. Leave the new server running for diagnosis. Do not delete it.

If the website's own deployment is part of the cutover, its rollback tag is recorded beforehand and restored with `docker tag <rollback> volta/web:latest` followed by `up -d --no-build web ai-tunnel`.

## 5. After a successful cutover

Keep the old server **running and unchanged** for at least 14 days of stable operation, with its backups. Retire it only on your explicit written instruction, and first take a final read-only inventory. Do not delete old backups. Do not reuse its credentials on the new server; the tunnel key and host pin are new.

## 6. What could still go wrong, and the answer

| Risk | Answer |
|---|---|
| The new host is slower than expected for the chosen model | Choose the smaller model; the registry lets one setting switch it; the old server is the fallback |
| Locked out of the new server after hardening | Key login is verified from a second session before password login is disabled; the provider's console is the break-glass path |
| The website tunnel breaks at cutover | The saved old target is restored in one step (section 4) |
| Sinhala or Singlish answers regress | Same Agent bundle and router are used; the post-cutover smoke tests include them; rollback if they differ |
| A secret leaks during the move | Keys and passwords never go into archives; new tunnel key and host pin are generated fresh; the earlier chat passwords are rotated |
