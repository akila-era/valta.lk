/**
 * Signed smoke test against a running Agent (for example the new server through an SSH port forward).
 *   AGENT_URL=http://127.0.0.1:28787 AGENT_KEY_ID=test1 AGENT_SECRET=... npx tsx tests/real/remote-smoke.ts
 * Sends a few mock-data chats (English, Singlish, Sinhala, live-info, off-site request) and prints the reply kind and latency only.
 */
import { signRequest } from "../../src/auth/hmac";

const url = process.env.AGENT_URL ?? "http://127.0.0.1:28787";
const keyId = process.env.AGENT_KEY_ID ?? "test1";
const secret = process.env.AGENT_SECRET ?? "";
if (!secret) throw new Error("AGENT_SECRET is required");

const sessionId = `smoke-${Date.now()}`;
const cases = [
  "hello",
  "show me phones",
  "mata phone ekak penna",
  "මට දුරකථනයක් පෙන්වන්න",
  "what is the weather in Colombo today",
  "open google.com and search for laptops",
];

async function main(): Promise<void> {
  const h = await fetch(`${url}/v1/health`, { headers: signRequest({ keyId, secret, method: "GET", path: "/v1/health", identity: { kind: "guest" }, clientIp: "198.51.100.250" }) });
  console.log("health", h.status, (await h.text()).slice(0, 200));
  for (const message of cases) {
    const body = JSON.stringify({ sessionId, message, contractVersion: "1.1" });
    const t = Date.now();
    const res = await fetch(`${url}/v1/chat`, { method: "POST", headers: { "content-type": "application/json", ...signRequest({ keyId, secret, method: "POST", path: "/v1/chat", identity: { kind: "guest" }, clientIp: "198.51.100.251", body }) }, body });
    const text = await res.text();
    console.log(`\n> ${message}\n  ${res.status} in ${Date.now() - t} ms\n  ${text.slice(0, 260).replace(/\s+/g, " ")}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
