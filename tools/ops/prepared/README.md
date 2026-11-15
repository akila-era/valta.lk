# Prepared operations (NOT RUN)

**Nothing in this directory has been executed on any server.** Every script refuses to do anything unless the environment variable `I_HAVE_APPROVAL` is exactly `yes`, and each starts with a comment block saying so. They are prepared for the project owner's review; running one is a production change that needs the owner's explicit approval. Each file states its purpose, preconditions, command, verification and rollback.

| # | What | Needs | Downtime | Reversible |
|---|---|---|---|---|
| 01 | nginx access log: stop logging query strings and Referer queries (`?key=` leak) | nginx reload on the website server | none (graceful reload) | yes, automatic on a failed `nginx -t`, plus `rollback` |
| 02 | firewall: drop internet connections to the web container's published port 8090 | one iptables rule in `DOCKER-USER` (and the IPv6 twin) | none | yes, `rollback` deletes the rule; **not persistent across reboot (untested)** |
| 03 | compose: publish 8090 on 127.0.0.1 only; recreate web, then the tunnel container | container recreation on the website server | about 10 to 30 s estimated (not measured) | yes, `rollback` |
| 04 | monitoring: external probe, AI-server health timer, alert rules | new files and a timer on the AI server; an external host | none | yes, remove the units |

Order recommended by the audit: 02 now (no downtime), 01 now (no downtime), 03 in a maintenance window as the permanent fix for 8090, 04 any time. Each script was syntax-checked with `bash -n` only: **none was tested against a real server**; the sed expressions in 01 and 03 were tested against copies of the observed lines (see `docs/VOLTA_SECURITY_AUDIT_REPORT.md`). Facts used (nginx.conf line 41, the compose line 34, the tunnel's `docker run` options, the firewall chain) come from the read-only audit of 2026-11-14; a QA step must re-verify the tunnel options against `docker inspect` before 03 is used (the script also refuses if they differ).

Secrets: no script prints, stores or sends a secret. The webhook URL (04) is read from a root-only file that does not exist yet.
