// Read-only: asks a running Agent for its signed /v1/metrics and prints the compact `summary` (and, with --alerts, which alert thresholds it crosses).
//
//   node scripts/metrics-probe.mjs --url http://127.0.0.1:8787 --env /etc/volta-agent/agent.env [--alerts]
//
// The signing key is read from the environment FILE (AGENT_HMAC_KEYS=keyId:secret, first key) by this process only. It is never printed, logged or
// sent anywhere except as the request signature to the URL you gave. Needs read access to that file (root or the service group): run it as the
// same user that can read it. Exit code 0 = ok, 1 = could not read the metrics, 2 = at least one alert threshold crossed (with --alerts).
import { createHash, createHmac, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

export function readFirstKey(envText) {
  const line = envText.split(/\r?\n/).find((l) => l.startsWith("AGENT_HMAC_KEYS="));
  if (!line) throw new Error("AGENT_HMAC_KEYS is not set in the file");
  const first = line.slice("AGENT_HMAC_KEYS=".length).split(",")[0] ?? "";
  const i = first.indexOf(":");
  if (i < 1 || first.length - i - 1 < 32) throw new Error("AGENT_HMAC_KEYS has no usable key");
  return { keyId: first.slice(0, i).trim(), secret: first.slice(i + 1).trim() };
}

/** Signs and sends GET `path` exactly as the website does (canonical string: timestamp, nonce, method, path, identity, client address, body hash). */
export async function signedGet(baseUrl, path, { keyId, secret }, fetchImpl = fetch) {
  const ts = String(Math.floor(Date.now() / 1000));
  const nonce = randomBytes(16).toString("hex");
  const identity = "anon";
  const clientIp = "127.0.0.1";
  const bodySha = createHash("sha256").update("").digest("hex");
  const canonical = [ts, nonce, "GET", path, identity, clientIp, bodySha].join("\n");
  const signature = createHmac("sha256", secret).update(canonical).digest("hex");
  return fetchImpl(new URL(path, baseUrl), {
    headers: { "x-volta-key-id": keyId, "x-volta-timestamp": ts, "x-volta-nonce": nonce, "x-volta-identity": identity, "x-volta-client-ip": clientIp, "x-volta-signature": signature },
    signal: AbortSignal.timeout(5_000),
  });
}

/** The alert thresholds of tools/ops/prepared/04-monitoring/alert-rules.md that the summary can feed. Returns the names that are crossed. */
export function crossedAlerts(summary, opts = {}) {
  const out = [];
  const maxQueue = opts.maxQueueDepth ?? 6;
  if (summary.requests.chat >= 5 && summary.ratios.serverErrors >= 0.2) out.push("chat_5xx_rate_high");
  if (summary.requests.rateLimited429 >= 5) out.push("chat_rate_limited_often");
  if (summary.queue.depth >= maxQueue) out.push("queue_depth_at_maximum");
  if (summary.newSessions.shopCeiling > 0 && summary.newSessions.ceilingUsedPct >= 50) out.push("new_session_ceiling_50pct");
  if ((summary.rateLimitRefusals.shop_ceiling ?? 0) > 0) out.push("new_session_ceiling_reached");
  if (summary.browser.enabled && summary.browser.calls >= 10 && summary.browser.failures / summary.browser.calls >= 0.5) out.push("browser_failures_high");
  return out;
}

async function main(argv) {
  const arg = (name) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const url = arg("--url") ?? "http://127.0.0.1:8787";
  const envFile = arg("--env");
  if (!envFile) {
    console.error("usage: node scripts/metrics-probe.mjs --url http://127.0.0.1:8787 --env /etc/volta-agent/agent.env [--alerts]");
    return 1;
  }
  let key;
  try {
    key = readFirstKey(readFileSync(envFile, "utf8"));
  } catch (e) {
    console.error(`cannot read the signing key: ${e.message}`); // names the problem, never a value
    return 1;
  }
  let res;
  try {
    res = await signedGet(url, "/v1/metrics", key);
  } catch {
    console.error("the Agent did not answer");
    return 1;
  }
  if (!res.ok) {
    console.error(`the Agent answered ${res.status}`);
    return 1;
  }
  const snap = await res.json();
  const alerts = argv.includes("--alerts") ? crossedAlerts(snap.summary) : [];
  console.log(JSON.stringify(argv.includes("--alerts") ? { summary: snap.summary, alerts } : snap.summary, null, 2));
  return alerts.length ? 2 : 0;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, "/")}`).href) {
  process.exitCode = await main(process.argv.slice(2));
}
