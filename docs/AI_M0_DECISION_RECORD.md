# VOLTA.LK AI assistant: M0 decision record

Date: 2026-11-12
Status: **M0 is OPEN (planning only). M1 has NOT been approved or started.** Owner decisions are recorded below, with a second update the same day (Q3, Q4, Q6 approved; Q1, Q2, Q5 explicitly not confirmed). M0 closes only when the website host and its egress IP are confirmed (blocker B1) and the other blockers in section 8 are resolved or consciously waived. **Network integration stays blocked until then.**

This record **supersedes** the matching parts of [AI_AGENT_ARCHITECTURE.md](AI_AGENT_ARCHITECTURE.md). Section 5 lists exactly which parts changed; where the two documents differ, this one wins.

Q7 (read-only inspection of Ollama's outbound traffic, section 10) changed nothing. Afterwards Q8 was approved and the single `OLLAMA_NO_CLOUD=1` drop-in was applied (section 10.6); the owner **accepted the implementation and its verification** on 2026-11-12. A **proposed** mock-ERP-only M1 plan now exists in [AI_M1_PLAN.md](AI_M1_PLAN.md); it is **not approved** and no M1 work has started.

Server activity so far for M0: a `/tmp`-only Node 24 compatibility check (section 3.2), and then, after the owner's approval of Q6, the **verified installation of Node 24 under `/opt/node`** (section 3.3). Nothing else was installed, reconfigured or exposed: no dependencies, no Agent API, no SSH/`AllowUsers` change, no tunnel user, no WireGuard, no firewall change, no new port, no connection to any ERP.

Evidence labels: **[verified]** checked in this step; **[repo]** read from this repository; **[proposed]** my proposal, not yet agreed; **[unknown]** not known and deliberately not guessed.

---

## 1. Decision log

| # | Decision (owner, 2026-11-12) | Status |
|---|---|---|
| 1 | Network: SSH tunnel for staging; WireGuard for production; Ollama never public | Accepted. **Integration is blocked** (B1). The owner explicitly did **not** approve changing `AllowUsers`, creating tunnel users, configuring WireGuard, opening ports or deploying a public API. |
| 2 | Runtime: Node.js 24 LTS, compatibility verified before installation | Accepted. Compatibility verified (3.2). **Installed** under `/opt/node` after Q6 approval (3.3). |
| 3 | Privacy: no message storage for AI training by default; explicit opt-in for redacted retention; documented retention and deletion; never log passwords, payment data, tokens or sensitive personal information | Accepted. Policy drafted below as **[proposed]** detail; needs legal review (B6). |
| 4 | Guests: product discovery incl. details, specs, prices, promotions, stock, accessories, comparisons and a verifiable delivery charge; abuse protection; guest cart actions stay browser-side proposals; authentication required for account- and order-specific information | Accepted (Q3 approved, Q4 decided). Changes the earlier design (guest order lookup removed). |
| 5 | Sinhala: native-speaker review required before production approval; build a Sinhala/Singlish/mixed test dataset; no readiness claims until evaluation passes | Accepted. **Reviewers not confirmed (Q5): production blocker (B5).** |

Answers to the open questions from the previous version of this record:

| Q | Topic | Answer |
|---|---|---|
| Q1 | Website host and egress IP | **NOT CONFIRMED.** No provider, hostname or IP is assumed. Network integration stays blocked. |
| Q2 | Staging ERP | **NOT CONFIRMED.** No connection to any ERP, and **never to the production ERP or production data** without separate written approval. M2 tests use the local mock ERP only. |
| Q3 | Guest product discovery | **APPROVED** (details in section 5). |
| Q4 | Abuse protection | Built-in limits first; design CAPTCHA-ready; **no external CAPTCHA service is to be purchased yet** (section 5.3). |
| Q5 | Native Sinhala reviewers | **NOT CONFIRMED.** Native-speaker validation remains a production blocker. |
| Q6 | Node install | **APPROVED and done:** official tarball, GPG + SHA-256 verified, under `/opt`, system Node untouched (section 3.3). |

---

## 2. Decision 1: network

**Accepted.** Staging uses an SSH tunnel; production uses WireGuard; Ollama stays on `127.0.0.1:11434` in every environment.

### 2.1 Staging: SSH tunnel

- The **website host initiates** an `ssh -N -L 127.0.0.1:8787:127.0.0.1:8787` tunnel (kept alive by a systemd unit, `autossh` or equivalent) to the AI server. The Agent API listens on `127.0.0.1:8787` of the AI server only.
- A **dedicated tunnel account** on the AI server (no shell, no sudo), with the website host's public key restricted in `authorized_keys`: `restrict,port-forwarding,permitopen="127.0.0.1:8787",no-pty`. The private key exists only on the website host.
- **Changes this will need on the AI server (approval required at M1, none made now):** a new user; adding that user to `AllowUsers` in `/etc/ssh/sshd_config.d/10-volta-hardening.conf` (today it says `AllowUsers volta`, so the tunnel user would be refused); validate with `sshd -t` and a second session, exactly as in Phase 2. UFW needs **no change** (port 22 is already allowed and rate-limited); fail2ban already watches sshd.
- The HMAC layer from the architecture document still applies on top of the tunnel.
- Optional hardening that needs the egress IP: restrict the tunnel account to the website's source address (`from="<egress-ip>"` in `authorized_keys`).

### 2.2 Production: WireGuard

- One new UDP port on the AI server, allowed **only from the website host's egress IP** in UFW, plus the `wireguard-tools` package (the Ubuntu kernel supports WireGuard natively). The Agent binds the WireGuard address, not `0.0.0.0`.
- **Needs the egress IP (B1)** for the UFW source rule, and needs the website host to be able to run a WireGuard peer.
- Production configuration differs from staging only in the Agent's bind address and the transport; the application contract is unchanged.

### 2.3 Risk that depends on the unknown host type

A tunnel or WireGuard peer requires a host where we control a long-running process and a stable outbound address. If the website runs on a serverless/edge platform, **neither is possible** and a different pattern would be needed (for example a small relay or an outbound-pull design). This cannot be judged until B1 is answered. **[unknown]**

### 2.4 Never public

No rule opens 11434. The architecture's external probe test (X3) stays an acceptance criterion.

---

## 3. Decision 2: Node.js 24 LTS

**Accepted.** Alignment with the website runtime is the stated reason: the repository's `Dockerfile` uses `node:24-bookworm-slim` and the docs say "developed on Node 24" [repo]. Note that `apps/web/package.json` has **no `engines` field** [repo], so alignment is by convention only (adding one is a separate, optional change to the website repo; not made).

### 3.1 Release status [verified 2026-11-12, from nodejs/Release `schedule.json` and nodejs.org `dist/index.json`]

| Line | Phase today | Security support until |
|---|---|---|
| Node 22 "Jod" | Maintenance LTS | 2027-04-30 |
| **Node 24 "Krypton"** | **Maintenance LTS** (since 2026-10-20) | **2028-04-30** |
| Node 26 "Lithium" | Active LTS (since 2026-10-28) | 2029-04-30 |

Latest Node 24 release: **v24.22.3** (2026-11-10, OpenSSL 3.5.9). So "24 LTS" is valid and supported, but it is now in *maintenance* (critical and security fixes only), and a newer Active LTS (26) exists. This does not change the decision. It does mean the website and the Agent should be reviewed for a **joint move to 26 well before 2028-04-30**. No action now.

### 3.2 Compatibility check on the AI server [verified]

Performed from `/tmp` in a throwaway directory, as an unprivileged user, **without installing anything system-wide**, then deleted:

| Check | Result |
|---|---|
| Host | Ubuntu 26.04, glibc 2.43, x86_64, AVX2 |
| Artifact | `node-v24.22.3-linux-x64.tar.xz` (32,064,292 bytes) |
| SHA-256 against `SHASUMS256.txt` | **OK** |
| `node --version` runs | `v24.22.3` (V8 13.6, OpenSSL 3.5.9) |
| APIs the Agent needs | `crypto.createHmac`, `crypto.timingSafeEqual`, `fetch`, `AbortSignal.timeout`, `structuredClone`: all present |
| Memory, bare runtime | 47 MB idle RSS; **88 MB RSS** (13 MB heap) after 200 loopback HTTP requests |
| System state afterwards | `node` not installed, `/tmp` cleaned, listening ports unchanged (22 and loopback only), 3.3 GB available, swap unused |

Limits of this check: the SHA-256 came from the same origin as the file, so it detects corruption, not a compromised origin. The detached GPG signatures (`SHASUMS256.txt.asc` and `.sig`, both published) must be verified at install time. The 88 MB figure is a bare `http` server; the real Agent with a framework, Zod and undici will be larger. The earlier planning figure of 100 to 200 MB remains an estimate until M1.

### 3.3 Install method: decided (Q6) and installed

Option A below was approved by the owner and carried out. The comparison is kept as the rationale.

| Option | Pros | Cons |
|---|---|---|
| **A. Official tarball under `/opt`, pinned version, GPG + SHA-256 verified** (recommended) | no third-party apt repository trusted as root; exact version control; matches the verified artifact | no automatic patching, so a documented upgrade runbook and a weekly "newer v24 exists" check (extend `volta-health`) are required |
| B. NodeSource apt repository | patches through `apt`/unattended-upgrades | adds a third-party repository with root-level trust |
| C. Ubuntu `nodejs` package (22.22.1) | distro-patched | contradicts the Node 24 decision |

The Agent will run as a dedicated unprivileged user; only a pinned lockfile install (`npm ci`) will be used, later.

**Installation record [verified, 2026-11-12 05:47 UTC]**

| Item | Result |
|---|---|
| Version / artifact | Node.js **v24.22.3**, `node-v24.22.3-linux-x64.tar.xz` (32,064,292 bytes) |
| GPG signature | `SHASUMS256.txt.asc` has a **good signature**, key `20B1A390B168D356`, primary fingerprint `5BE8A3F6C8A5C01D106C0AD820B1A390B168D356` (a Node.js release signer; uid on key: Antoine du Hamel), signature date 2026-11-11, no expiry/revocation reported |
| Trust anchor | Signing fingerprints present in **both** the `nodejs/node` README and the `nodejs/release-keys` `keys.list` (29 and 29, identical). The key file was fetched by that fingerprint and its imported fingerprint was compared to it. GnuPG's "not certified with a trusted signature" warning is expected: trust comes from the fingerprint set, not a web of trust. **Limit:** both lists live in the same GitHub organisation, so they are not fully independent sources. |
| SHA-256 | Tarball hash matched its line in the **GPG-signed text**: `OK` |
| Side observation | The GPG-decrypted signed text differs from the downloaded `SHASUMS256.txt` by one extra blank line (1 byte); investigated, harmless |
| Location | `/opt/node/node-v24.22.3-linux-x64`, symlink `/opt/node/current` -> that directory; all files `root:root`, no group/other write (0 files not owned by root) |
| Run it as | `/opt/node/current/bin/node` (absolute path) |
| System Node | **Untouched.** None existed; `node` is not on `PATH`, nothing in `/usr/local/bin`, `/etc/profile`, `/etc/profile.d` or `/etc/environment` |
| Verification record | `/opt/node/verification/v24.22.3/` (checksums, signature, GPG status, trusted fingerprints, `VERIFIED.txt`) |
| Not done | No `npm install`, no dependencies, no Agent code, no service, no user created |
| System state afterwards | Listening ports unchanged (22 and loopback), UFW unchanged (`22/tcp` limit), `AllowUsers volta` unchanged, 27 GB disk free, 3.2 GB RAM available, swap unused, temp files removed |

Process note: the first two install attempts aborted by themselves before changing anything (a shell `pipefail` quirk, then a signer-key lookup bug in my script that failed safely at signature verification). The third run succeeded. No partial install was left behind.

Upgrade duty (no automatic patching with this method): when a newer v24 release is published, repeat the same verified procedure into a new versioned directory and switch the `current` link. A weekly "newer v24.x exists" check belongs in M1's monitoring.

---

## 4. Decision 3: privacy

**Accepted principles.** The detail below is **[proposed]** and must go through legal review (B6) before any code stores a customer message.

### 4.1 Data classes

| Class | What | Stored? | Where / how long |
|---|---|---|---|
| A. Operational session state | slots (brand, category, budget), last-shown product ids, language | in Agent memory only | 30 min TTL, lost on restart; never written to disk |
| B. Audit metadata | request id, keyed-hash of identity, language, intent, tool, status, model, latencies, verifier result | yes (JSONL) | 30 days, rotated |
| C. Consented redacted transcript | message text after masking, intent decision | **only with explicit opt-in** | 30 days maximum, then deleted automatically |
| D. Never stored or logged | passwords, payment card data, tokens, cookies, session ids, HMAC secrets, `Authorization` headers, full phone numbers, emails, delivery addresses, national ID numbers, raw message text (unless class C consent) | no | n/a |

Default is class A and B only. **No message text is stored and nothing is used for AI training by default.**

### 4.2 Consent design

- A separate, unticked control in the chat widget, not bundled with using the assistant and not required to use it: "Allow VOLTA.LK to keep my chat messages (with personal details removed) for 30 days to improve the assistant."
- Versioned consent text; consent can be withdrawn at any time in the widget. Withdrawal deletes that person's retained records.
- The browser sets consent through a same-origin route; the website backend records it (signed-in customer: against the account; guest: a random consent id kept in the browser) and forwards it to the Agent as a **signed claim**. The Agent writes class C only when the claim says so **for that request**; the browser cannot assert consent directly to the Agent.
- Consent covers retention for evaluation and improvement of our own routing rules and test data. It does **not** cover training any external model or sharing with a third party; neither is planned.

### 4.3 Redaction, with honest limits

- Mask before writing: phone numbers, emails, URLs, order references, card-like and long digit sequences, national ID formats, and any text matching the address/name patterns the router already recognises.
- **Limit:** reliably detecting free-text personal names and addresses in Sinhala, Singlish and mixed text is not something I can promise. So retained text is treated as "best-effort redacted", is visible only to named reviewers, is never exported off the AI server, and is reviewed by a person before any use in a dataset.

### 4.4 Sensitive-input guard (before retention and before any model)

If a message contains a card-number pattern (Luhn-valid), something that looks like a password/OTP/CVV, or a national ID, the Agent refuses to process it, tells the shopper not to share such details in chat, and **never retains it even with consent** (it is dropped, not redacted).

### 4.5 Retention and deletion **[proposed]**

- Class B and C: maximum 30 days, automatic purge by a scheduled job; logs excluded from backups.
- Deletion on request or consent withdrawal: records are keyed by consent id or keyed identity hash, so they can be found and deleted; target completion within 7 days, and a deletion log entry (without content) is kept.
- Account deletion removes class C for that customer.
- Access limited to named reviewers; access is logged.

### 4.6 Legal and policy items (B6)

- The current privacy policy page is plain starter text needing legal review [repo: DEPLOYMENT.md]. It must be updated to describe the assistant, retention, consent and deletion before launch.
- I believe Sri Lanka's Personal Data Protection Act No. 9 of 2022 may apply (consent, retention, deletion, cross-border transfer). **I am not a lawyer and have not verified its current obligations or commencement status; counsel must confirm.** The AI server is in Helsinki, Finland, so cross-border transfer of any retained text is a question to ask.

---

## 5. Decision 4: guest access, and what it changes in the architecture

### 5.1 Capability matrix

| Capability | Guest | Signed-in customer | Note |
|---|---|---|---|
| Product search, recommendations | yes | yes | |
| Product details and specifications | yes | yes | Only fields the backend actually provides; none are generated. |
| Current prices and promotions | yes | yes | Prices are the ERP's. A promotion is mentioned only if the backend quote returns it for that identity (a guest sees no customer-limited offer unless the backend returns it). |
| Stock availability | yes | yes | Same disclosure level as the storefront (available / out of stock, and whether a requested quantity can be met). |
| Compatible accessories | yes | yes | Explicit staff-made links only; never inferred. |
| Product comparison | yes | yes | Differences computed in code. |
| Delivery charge | yes, **when verifiable** | yes, when verifiable | See 5.4. |
| View cart summary (quote of the browser cart) | yes | yes | Not account data; prices revalidated server-side. |
| Cart add/update/remove | **proposal only**, applied by the browser | proposal only | Same for both; no server cart exists. |
| Checkout | hand-off to `/checkout` | hand-off to `/checkout` | The assistant never places orders. |
| **Order status** | **no** (assistant points to the existing `/track-order` page) | **yes, only orders linked to their account** | Authentication required. |
| Any account-specific data (profile, saved details) | no | not exposed in v1 | |

### 5.2 Consequences for the earlier design

1. **Guest order lookup by reference is removed from the assistant.** The earlier design let a guest ask about an order if they knew its reference. Under this decision the assistant answers "please use Track order" with a link; the existing page keeps working as it does today.
2. `get_order_status` is **customer-only** and returns only orders in `CustomerOrder` for that customer. A signed-in customer asking about a reference not linked to their account gets a generic "not found". Orders they placed as a guest before logging in are not visible to the assistant (they use `/track-order`). Recorded as a known limitation.
3. The order-lookup rate limit moves from per-IP to **per-customer**; the "reference enumeration" threat disappears from the assistant (the references are no longer accepted from guests).
4. Guests get **stricter built-in abuse protection** (section 5.3). An external CAPTCHA is not bought now; the design only leaves room for one.
5. Guest cart actions are unchanged from the design: browser-side proposals, never server mutations. Checkout and payment remain explicit customer actions on the existing `/checkout` page.
6. No direct database access exists for the assistant in any mode (it only calls HMAC-authenticated website tool endpoints).

### 5.3 Abuse protection (Q4): built-in first, CAPTCHA-ready

**In scope now, no third-party service, nothing purchased:**

| Control | Proposed value (tunable) |
|---|---|
| Message size | message <= 800 characters; request body <= 20 KB (the website's `readJson` default [repo]); cart snapshot <= 20 lines |
| Rate limits | guests: 6 messages/min per IP+session, 40/hour per IP; signed-in customers: 12/min, tracked per customer. Per-instance memory, as the existing limiter [repo]. |
| Concurrency | one running inference; a guest may have **one** in-flight request per session; signed-in traffic gets queue priority when contended |
| Queue | depth 6, deadline 45 s (60 s English two-step), `503 QUEUE_FULL` + `Retry-After` beyond that |
| Automatic cooldown | repeated rejected inputs (safety pre-filter hits, validation failures, sensitive-input hits) cause a temporary block with growing back-off |
| Kill switch | `AI_ASSISTANT_ENABLED=false` on the website disables the BFF and hides the widget |

**CAPTCHA-ready, not implemented, no provider chosen:**

- The chat request gets an **optional** `challengeToken`; the BFF owns verification through a small provider-neutral interface (`verifyChallenge(token, ip) -> ok|fail`). The Agent never sees tokens or provider details.
- Mode switch `AI_CHALLENGE_MODE=off|on_abuse|always` (default `off`). In `on_abuse`, a guest who hits the cooldown receives `429 CHALLENGE_REQUIRED` and the widget can render whatever challenge is later plugged in.
- Adding a provider later is then a BFF-only change plus a front-end widget; no Agent or tool contract changes. A privacy review is needed first, since a CAPTCHA is an external third party.

### 5.4 Delivery charge: when it may be stated

From the repository, the ERP exposes **one flat delivery charge** in its store settings, and checkout adds it to the order total [repo: `erpSettingsSchema.deliveryCharge`]. No per-district, weight or free-delivery rule is present in the data. Therefore:

- The assistant states the delivery charge **only** from a live ERP settings response, with the wording "confirmed at checkout". It is carried on the product-details and cart results, not generated.
- If ERP settings cannot be read, or orders are disabled, the assistant says it cannot confirm the charge. It **never estimates**, never infers regional or promotional delivery terms, and never says "free delivery" unless a verified field says so (none exists today).

---

## 6. Decision 5: Sinhala quality gate

**Accepted.** No production claim of Sinhala readiness is made, in the product, marketing or documents, until the evaluation below passes **and** a native Sinhala speaker signs it off. Until then the Sinhala mode ships, if at all, only to staff/staging and is labelled beta.

### 6.1 Status of what exists

- The 25-utterance experiment in the architecture document is **exploratory and contaminated**: I wrote both the cases and the rules. It must **not** be reused in the test set and proves nothing about production accuracy.
- Qwen3 Sinhala output was unusable and SinhalaLLM output was fluent but unreliable on facts [measured, phase 4.1]. Hence the design never lets either model be a source of facts.

### 6.2 Test dataset specification **[proposed]**

JSONL, one utterance per line:

```json
{"id":"t-0001","text":"...","script":"si|si-latin|mixed|en","source":"native-authored|consented-log|template",
 "gold_intent":"search_products|get_product_details|compare_products|check_stock|get_accessories|cart_action|order_status|store_info|smalltalk|unknown",
 "gold_entities":{"brand":null,"model":null,"category":null,"budget_lkr":null,"quantity":null,"colour":null,"storage":null},
 "expect_clarification":false,"should_refuse":false,
 "tags":["colloquial","spelling-variant","negation","number-words","referent","typo","injection","out-of-scope","price-manipulation","sensitive-input"],
 "annotations":[{"by":"a1","intent":"..."},{"by":"a2","intent":"..."}],"adjudicated":true,"split":"dev|test"}
```

| Rule | Proposed value |
|---|---|
| Size | **dev ≥ 300** (used to build and tune rules), **test ≥ 300** (frozen, never used for tuning); plus a **generation review set of 100 replies** |
| Script mix in test | Sinhala script ~35 %, Singlish ~30 %, mixed ~25 %, English ~10 % |
| Intent coverage | at least 20 per intent in the test split |
| Adversarial share | ≥ 15 %: prompt injection (Sinhala/Singlish/English), price manipulation, out-of-scope, sensitive-input attempts |
| Authors | native speakers, from at least 3 people, **not only the router's developer**; consented real logs only after consent exists |
| Annotation | two independent annotators per item plus adjudication; report inter-annotator agreement (Cohen's kappa), target ≥ 0.8, otherwise fix the guidelines first |
| Contamination control | test split hashed and stored read-only; a rule or lexicon change is never made by looking at test failures; each release uses a fresh test slice |
| Generation review rubric | 1 to 5 for fluency, appropriateness/register, faithfulness to the cards; any fabricated fact, offensive or unsafe reply is a critical fail regardless of score |

### 6.3 Pass criteria

The numeric gates **S1 to S6** in the architecture document (section 12) are the evaluation. They are proposals and the native reviewer may tighten them. **Production approval requires all of:** gates S1 to S6 pass on the frozen test split; zero critical fails in the generation review; and a written sign-off from the native reviewer(s). The reviewer's identity, scope and date go into the release record.

---

## 7. What changed in the architecture document

`AI_AGENT_ARCHITECTURE.md` has been edited to match (the edits are listed so they can be reviewed):

| Section | Change |
|---|---|
| Header | pointer to this record; record wins on conflict |
| 1, decisions table | D1 to D6 replaced by the resolved decisions and the remaining blockers |
| 2.3 | decided transport per environment |
| 7.3 rate limits | order-status limit is per customer |
| 7.6 logging | consent claim, redaction, never-log list |
| 8.2 `get_order_status` | customer-only, own orders only |
| 9.1 / 9.2 | ownership row and enumeration threat updated |
| 11 roadmap, M0 and M1 | M0 stays open until the blockers close; M1 uses the verified Node 24 install method and the tunnel account |
| Second update (Q3, Q4, Q6) | |
| 1, decisions table | D2 shows Node 24 installed; D5 lists the approved guest scope; Q1, Q2, Q5 recorded as not confirmed |
| 7.2 chat request and 7.4 errors | optional `challengeToken`; `CHALLENGE_REQUIRED` (not enforced; CAPTCHA-ready hook only) |
| 8.2 | delivery charge is a field on product-details and cart results (no separate tool), shown only from a live ERP settings response |
| 11 roadmap, M1 and M2 | Node 24 is already installed at `/opt/node/current`; M2 uses the mock ERP only, never the production ERP |

---

## 8. Remaining blockers

Status as of this update. "Resolved" means no further owner action is needed for it.

| ID | Blocker | Status | Blocks |
|---|---|---|---|
| **B1** | **Website host and egress IP.** Q1 answered: **NOT CONFIRMED.** No provider, hostname or IP is assumed. Reference only, **not confirmed infrastructure**: the repo holds a `Dockerfile` (Node 24), a `docker-compose.yml` (web on host port 8090, PostgreSQL 16, optional `order-sync`) and `DEPLOYMENT.md` saying nothing has been deployed and that the staging host, access and TLS setup are not documented. No IP, hostname or provider appears anywhere in the repo. To confirm: provider/host type, whether it can run a persistent process, and its **outbound** address (from that host `curl -s https://api.ipify.org`, or the provider panel; check it is not a CDN/proxy address). | **OPEN, NOT CONFIRMED** | **All network integration** (tunnel and WireGuard), the WireGuard UFW rule, the optional source restriction on the tunnel key, M5, and the choice of transport if the host is serverless |
| **B2** | **Staging ERP / staging website.** Q2: **NOT CONFIRMED.** Rule recorded: no connection to the production ERP or any production data in any milestone without separate written approval. The ERP integration has never run against a live ERP [repo]. | **OPEN, NOT CONFIRMED** | M2 end-to-end against a real ERP, M5, M7. (M2 unit/integration tests with the local mock ERP are unaffected.) |
| **B3** | **Approvals for server-side network changes.** Explicitly **not given**: changing `AllowUsers`, creating a tunnel user, configuring WireGuard, opening ports, deploying any public API. Also open: where the website host's tunnel key and the two HMAC secrets are generated and stored. | **OPEN, NOT APPROVED** | M1 tunnel work, M5 |
| B4 | Node 24 install and method | **RESOLVED**: installed and verified (3.3) | |
| **B5** | **Native Sinhala reviewer(s) and dataset authors** (names, availability, compensation, who freezes the test set). Q5: **NOT CONFIRMED.** | **OPEN, NOT CONFIRMED: production blocker** | M4 exit and any Sinhala production claim. Staging/staff beta only, labelled beta. |
| **B6** | **Legal/privacy review**: consent wording, retention and deletion, applicability of Sri Lanka PDPA 2022 and cross-border transfer, privacy-policy rewrite (the current page is starter text [repo]). | OPEN | Any storage of customer text (class C); public launch |
| B7 | Abuse protection for guests | **RESOLVED**: built-in limits first, CAPTCHA-ready design, nothing purchased (5.3). The only follow-up is the privacy review before a CAPTCHA provider is ever added. | |
| **B8** | **Ollama outbound traffic to `ollama.com`.** Q7 read-only inspection is **done** (section 10): two automatic, non-prompt calls at startup (model-recommendations refresh every 4 h, cloud model-metadata cache), both gated by the documented `OLLAMA_NO_CLOUD`. **Q8 then approved and applied** `OLLAMA_NO_CLOUD=1` via a separate root-owned drop-in; all verification passed (section 10.6). | **RESOLVED** (one optional empirical capture still open, see Q8 note) | |
| **B9** | Hygiene from earlier phases: reset the AI server's root password (it was shared in chat; root SSH login is already disabled); kernel `7.0.0-43` / `apt full-upgrade` plus reboot deferred to an approved maintenance window. | OPEN | Not blocking planning; do before real traffic |
| **B10** | **M1 is not approved.** The owner will approve it explicitly. Node 24 being installed does not start M1. A proposed mock-ERP-only plan with its own approval list is in [AI_M1_PLAN.md](AI_M1_PLAN.md); it also lists which tasks each of B1, B2, B3, B5 and B6 blocks. | **WAITING** | M1 |

### Still-open questions

- **Q1** (B1): where does the website run, can it run a persistent process, and what is its outbound IP?
- **Q2** (B2): is a staging ERP available, who issues a test credential, and who confirms it is not production?
- **Q5** (B5): who are the native Sinhala reviewers?
- **Q8:** answered and done (section 10.6). Only an **optional** passive network-metadata capture remains available if you want empirical proof that the 4-hourly call is gone; after the restart its timer is next due about **09:21 UTC** (the earlier 09:03 estimate is obsolete).

## 9. M0 exit checklist

M0 stays open until all are ticked.

- [ ] B1 answered and the egress IP confirmed (not assumed)
- [ ] B2 staging ERP/website environment identified
- [ ] B3 network-change approvals given (tunnel user, `AllowUsers`, and later WireGuard/UFW), secret storage decided
- [x] B4 Node 24 installed and verified
- [ ] B5 native reviewers named
- [ ] B6 legal review scheduled, consent text drafted
- [x] B7 abuse-protection approach decided
- [x] B8: `OLLAMA_NO_CLOUD=1` applied and verified (10.6)
- [ ] B9 scheduled
- [ ] Owner reviews and accepts this record

M1 (Agent skeleton) does not start until M0 is closed **and** you explicitly approve M1.

---

## 10. Q7 findings: Ollama 0.40.16 outbound traffic (read-only inspection)

Date of inspection: 2026-11-12. **Nothing was changed**: no environment variable, drop-in, `server.json`, restart, firewall rule or package. Ollama is still running with the Phase 4 configuration, and its listening ports are unchanged (`127.0.0.1:11434` only).

### 10.1 What was inspected, and its limits

| Source | Used for |
|---|---|
| Installed unit and drop-in, `ollama serve --help`, startup "server config" log, journal since service start | Current configuration and what the service itself logged |
| Strings compiled into `/usr/local/bin/ollama` (44,289,232 bytes) | Which URLs, environment variables and settings the installed build contains |
| 75-second sample of the Ollama process's open sockets, once per second | Live outbound connections |
| Ollama **source at tag `v0.40.16`** (tarball, read with `grep`, never built or run) | What each outbound call does, when it fires, what it sends, and what `OLLAMA_NO_CLOUD` gates |
| Official FAQ (docs.ollama.com) | The documented way to disable cloud features |

Limits, stated plainly:

1. The live sample saw **no open outbound connection**, but it was a quiet 75 s and the periodic timer fires every ~4 h (next about **09:03 UTC today**), so it proves nothing about what is sent. The evidence for *what* is sent is the **source code and the on-disk results**, not a packet capture.
2. The source tag matches the installed version string; I did not rebuild it or compare binaries. The binary does contain the same URLs and the same `OLLAMA_NO_CLOUD` / `disable_ollama_cloud` names, which is consistent.
3. "No telemetry" below means *none found in Ollama's own non-test Go source* (searched for telemetry, analytics, Sentry, PostHog, Segment, OpenTelemetry). Third-party dependencies and llama.cpp were not audited. The binary contains the word "Telemetry" twice; in the source the only matches are a Claude Desktop integration setting and a local MLX memory counter, but I did not map those two binary strings to those source lines.

### 10.2 Current state on the AI server

- `Ollama cloud disabled: false` in the startup log; neither `OLLAMA_NO_CLOUD` nor a `server.json` is set (the file is absent).
- The service user's home is `/usr/share/ollama`. At first start (05:20 UTC) Ollama created an **identity key pair** there (`.ollama/id_ed25519`, mode 600, and `.pub`). I listed names only and did not read the private key. No account sign-in was ever performed from this server, so the key is not linked to any ollama.com account.
- `/usr/share/ollama/.ollama/cache/model-recommendations.json` (2,067 bytes, written 05:20): a list of **cloud** model recommendations downloaded from ollama.com at startup. This is direct evidence that the call really happened and succeeded.

### 10.3 Outbound connections found, and what they are

| # | Function | Endpoint | When | Class | Needed for local inference? | `OLLAMA_NO_CLOUD` stops it? |
|---|---|---|---|---|---|---|
| 1 | **Model recommendations refresh** | `GET https://ollama.com/api/experimental/model-recommendations` | at startup, then every 4 h (3 s timeout; back-off 5 m / 15 m / 1 h / 4 h on failure); also when the recommendations API is read | model discovery (a catalogue of *cloud* models for UIs) | no | **yes** (`refresh()` returns before any request) |
| 2 | **Cloud model metadata cache** | `GET https://ollama.com:443/api/tags`, then `POST /api/show` per cloud model | in a goroutine at startup, and on read of a cloud model | cloud feature | no | **yes** (checked at the top of both `hydrateCloud` and `refreshCloud`) |
| 3 | **Cloud inference proxy** | `https://ollama.com:443/...` | only when a client asks for a `:cloud`/remote model | cloud inference (the prompt **would** leave the server) | no | **yes** (HTTP 403 "ollama cloud is disabled") |
| 4 | **Web search / fetch** | `https://ollama.com/api/web_search` (`web_fetch` in the desktop app) | only on demand via a compatible client | cloud feature | no | **yes** |
| 5 | **Model downloads** | `registry.ollama.ai` (HTTPS), and `hf.co` for Hugging Face models | only when someone runs `ollama pull`/`create` (my two pulls in phases 4 and 4.1) | model distribution | only to obtain a model | **no, unaffected** |
| 6 | **Update check** | `https://ollama.com/api/update` | **desktop app only** (macOS/Windows); the Linux service does not run it (FAQ: on Linux you re-run the installer) | updates | no | not applicable; not present in this deployment |
| 7 | **Sign-in** | `https://ollama.com/connect?...` | only when a person runs the sign-in flow | account linking | no | not applicable |
| 8 | **Telemetry / analytics** | none found in Ollama's own source (see limit 3) | n/a | n/a | n/a | n/a |

What was actually observed on this server: #1 (startup, snapshot written) and #2 (a `WARN failed to hydrate cloud model show cache ... POST https://ollama.com:443/api/show ... context canceled` at 05:20:27). That warning came from the **first** service instance, which my own Phase 4 service restart cancelled mid-call. The second instance logged no such warning, so its hydration presumably completed, but that is an inference, not something I confirmed. #5 happened twice, as requested by us. #3, #4, #6 and #7 were never triggered.

**What these calls carry (from the source, not from a capture).** Calls #1 and #2 send an `Accept` header, a client-version header, a timestamp query parameter, and an `Authorization` header produced by signing `METHOD,URI` with this instance's identity key. The signing routine extracts the public key and signs with the private key; I did not read its final return statement, so "the header includes the public key" is likely, not confirmed. The only body is a **cloud model name** (call #2). No prompts, messages, customer data or hostname appear in these requests. In practice ollama.com can see this server's IP address, the Ollama version, and, via the key, that repeated calls come from the same install. The FAQ states that local runs do not send prompts or data to ollama.com, and the code agrees: the generate/chat path only consults the cloud policy for remote models.

### 10.4 Why it still matters for VOLTA.LK

- None of #1 and #2 involve customer data, but they are unneeded outbound traffic from a server that will later process shoppers' messages, and they identify the install to a third party.
- #3 is the real risk: if anything ever requested a `:cloud` model, **the prompt would leave the server** to a plan-gated third-party service. That would break the privacy decision (no third-party sharing; no paid AI APIs). With cloud disabled, such a request returns HTTP 403 instead, which makes the restriction technical rather than a convention.
- Local inference does not depend on any of #1 to #4, #6, #7.

### 10.5 Official, version-compatible way to disable it

Both mechanisms exist in 0.40.16 (listed by `ollama serve --help`, present in the binary, and implemented in `envconfig.NoCloud()`, which returns true if **either** is set). The FAQ documents both, and says to restart and look for `Ollama cloud disabled: true` in the log.

| Option | How | Notes |
|---|---|---|
| **A. Environment variable (recommended)** | `OLLAMA_NO_CLOUD=1` in the systemd unit environment, preferably as a **new, separate drop-in** (for example `/etc/systemd/system/ollama.service.d/20-no-cloud.conf`) so rollback is "delete one file", then `systemctl daemon-reload` and `systemctl restart ollama` | Owned by root, so the `ollama` service user cannot undo it. Visible in the unit for audits. Consistent with how the other six variables were set. |
| B. `server.json` | `{"disable_ollama_cloud": true}` in `~/.ollama/server.json`, which for this service is `/usr/share/ollama/.ollama/server.json` | Needs a restart as well. The directory is owned by the `ollama` user, so the service could alter it; less tamper-resistant. |

**Proposed change set (not applied):** one new file with the single line `Environment="OLLAMA_NO_CLOUD=1"`, plus `daemon-reload` and a restart. No other setting, package or firewall change.

**Expected consequences:**

| Aspect | Effect |
|---|---|
| Local inference (Qwen3, SinhalaLLM) | **Expected to keep working**: the local generate/chat path does not call the cloud policy unless the model is remote. This is derived from the source and **has not been tested**; the verification plan below includes the test. |
| Lost | `:cloud` models, cloud inference, web search/fetch, the cloud recommendations list and cloud model metadata. None is used by this project, and cloud models are plan-gated and paid, which our constraints exclude. |
| Not lost | Local models, `/api/tags` of local models, `ollama pull` from `registry.ollama.ai` and `hf.co` (unaffected, so any future model install still needs internet). |
| Restart effect | The loaded model is unloaded; the next request pays the usual ~4 to 6 s cold load. Ollama is briefly unavailable (`RestartSec=3`). No Agent API exists yet, so nothing else is affected. |
| Residual | `model-recommendations.json` stays on disk, stale and harmless. The identity key pair stays; neither grants account access without a sign-in. |
| Rollback | Delete the drop-in, `daemon-reload`, restart. |

**Not a network guarantee.** `OLLAMA_NO_CLOUD` is a software setting inside Ollama, not an egress control. UFW currently allows all outbound traffic. A domain-based egress allow-list is not practical with UFW (IP-based, CDN-backed registries) and is **not recommended** for now.

**Verification plan after approval** (read-only apart from one test inference): the log line `Ollama cloud disabled: true`; no `ollama.com` lines in the journal after restart; no `model-recommendations` refresh scheduled; a socket sample and, if approved, a passive capture around 09:03 UTC showing no connection to ollama.com; one English tool-call request, one Sinhala request and the standard health check succeeding; a request for a `:cloud` model name returning 403; listening ports and UFW unchanged.

**Optional empirical check (needs approval, read-only):** a passive capture of connection metadata only (addresses, ports, SNI; TLS hides content) for about 5 minutes around **09:03 UTC today**, when the next scheduled refresh falls due (the running instance logged a 3 h 42 m 26 s wait at 05:20:28), to confirm the 4-hourly call now and its absence after the change.

### 10.6 Applied (Q8 approved, implementation and verification accepted by the owner): `OLLAMA_NO_CLOUD=1`, 2026-11-12 05:59 UTC

| Step | Result |
|---|---|
| Backup | `/root/backup-q8-20261112T055945Z/` holds the original `ollama.service`, the `ollama.service.d` directory (with `10-volta.conf`) and the `systemctl show` output from before |
| New drop-in | `/etc/systemd/system/ollama.service.d/20-no-cloud.conf`, `root:root`, mode 0644, containing only `[Service]` and `Environment="OLLAMA_NO_CLOUD=1"` |
| `daemon-reload` and restart | done; API answered after about 2 s; service `active` and `enabled` |
| Effective environment | `systemctl show` and `/proc/<pid>/environ` (service user `ollama`) both list `OLLAMA_NO_CLOUD=1` plus the six existing variables, unchanged |
| Log proof | `Ollama cloud disabled: true` (it was `false` before) |
| Local API health | `/api/version` = 0.40.16, `GET /` = 200, `/api/tags` lists both local models |
| Qwen3 English | PASS (47 tokens, 11.5 s including the cold load after the restart) |
| Qwen3 tool call | PASS: `search_products {"query":"smartphone","max_price_lkr":150000}` |
| SinhalaLLM | PASS: fluent Sinhala (63 Sinhala characters), 10.2 s including the model switch (5.3 s load) |
| Cloud inference disabled | `POST /api/chat` with a `:cloud` model returns **HTTP 403** "ollama cloud is disabled: remote model is unavailable"; `POST /api/show` for it returns **403** "...remote model details are unavailable". Run only after the log had confirmed `disabled: true`. |
| Outbound sockets | A ~120 s sample spanning all test inference (processes named `ollama` or `llama-server`) saw **0** non-loopback connections |
| Ports and firewall | Listening ports unchanged (22, and loopback only, including a loopback-only internal port); UFW unchanged (`22/tcp` limit, default allow outgoing); no `11434` rule; probe to the public IP on 11434 refused |
| RAM, swap, OOM | After the tests with SinhalaLLM loaded: 1.88 GB used, 1.93 GB available, swap 80 KiB; **0 OOM events** |
| Models | Both present (`qwen3:1.7b-q4_K_M`, `SinhalaLLM-1.7B:Q4_K_M`), 2.3 GB on disk; nothing deleted |
| Other services | ssh.socket, ufw, fail2ban, ollama, `volta-health.timer` active; 0 failed units; `volta-health` reports OK |
| Rollback | not needed; the backup remains |

Notes, so nothing is overstated:

- The journal since the restart still has **one** line matching `ollama.com`. It is the startup "server config" dump (the excerpt was truncated, so I did not read the exact substring), not a connection; the same dump line appeared in earlier instances. There is no `hydrate` warning and no request log.
- Ollama still logs `model recommendations cache sleep scheduled wait=3h21m17s`. Per the source, with cloud disabled the timer still ticks but `refresh()` returns before making any request. That is the code's behaviour, **not yet observed on the wire**. The next tick is about 09:21 UTC; an optional passive capture then would confirm it empirically.
- `model-recommendations.json` and the identity key pair remain on disk (harmless; deleting them was not requested).
- This is an in-process setting, not an egress control: UFW still allows all outbound traffic, and `ollama pull` still reaches `registry.ollama.ai` and `hf.co` by design.
