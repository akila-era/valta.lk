# Alert rules (definitions; nothing is installed or sent)

Status words: **Prepared** = implemented in the prepared script (never run); **Needs Agent change** = not measurable from outside today; **External** = needs a different host.

| Alert (journal tag `volta-alert`) | Condition | Check window | Source | Status |
|---|---|---|---|---|
| `agent_service_down` | `systemctl is-active volta-agent` is not active | each run (5 min) | systemd | Prepared |
| `ollama_service_down` | `ollama` not active | 5 min | systemd | Prepared |
| `agent_health_bad` | `127.0.0.1:8787/v1/health` does not answer 401 (alive, signature required) within 3 s | 5 min | local HTTP | Prepared |
| `chat_5xx_rate_high` | 5xx share of `/v1/chat` at least 20% with at least 5 requests in 5 min | 5 min | Agent journal (JSON lines, no message text) | Prepared |
| `chat_rate_limited_often` | 5 or more 429 answers in 5 min (a cap or abuse is refusing shoppers) | 5 min | Agent journal | Prepared. This is the **only available proxy** for the new-session ceiling |
| `memory_low` | `MemAvailable` below 1 GB | 5 min | /proc/meminfo | Prepared |
| `disk_high` | `/` above 85% used | 5 min | df | Prepared (AI server has plenty today; the **website server** is at 91%: the same rule must run there, not prepared in this set) |
| `tunnel_session_missing` | no `sshd` process owned by `voltatunnel` | 5 min | ps | Prepared, **unverified heuristic** (assumes an sshd process owned by that user exists while the tunnel is connected) |
| `homepage` / `assistant_route` / `assistant_chat` / `assistant_rate_limited` | home page not 200; chat route not 200 | 5 min | `external-probe.sh` from another host | External; Prepared |
| Queue depth above the Agent's configured maximum | `queue.depth` from the signed health/metrics answer | 5 min | Agent (signed) | **Needs Agent change or a signed call**: not implemented here on purpose (reading the signing key in a shell script was rejected) |
| New-session ceiling at 50% (1,000 of 2,000 per hour, after Step B) | shop-wide new-conversation count | 5 min | in-memory counter in the Agent | **Needs Agent change** (expose a counter in `/v1/metrics`); until then `chat_rate_limited_often` is the proxy |
| Repeated `0.0.0.0` client address | website cannot read the proxy header | continuous | website log (`[client-ip]` warning, once a minute) | Prepared in the website code (log line only); no alert rule is installed |

Alert behaviour: a given alert repeats at most every 30 minutes; a `RESOLVED` line is written when it clears; the webhook (if ever configured) receives the same short text (host, alert name, numbers). No message text, address, key or customer data is ever included.
