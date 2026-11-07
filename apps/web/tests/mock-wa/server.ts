/**
 * A tiny stand-in for the WhatsApp Cloud API (Graph API) for tests: POST /{phone-number-id}/messages records the
 * message and answers with a message id, like Meta does. GET /__sent lists what was sent; POST /__reset clears it.
 */
import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_WA_PORT ?? 4031);
let sent: { id: string; phoneNumberId: string; to: string; body: string; auth: string }[] = [];
let n = 0;

createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };
    const url = new URL(req.url ?? "/", "http://localhost");
    if (req.method === "GET" && url.pathname === "/__sent") return send(200, sent);
    if (req.method === "POST" && url.pathname === "/__reset") {
      sent = [];
      return send(200, { ok: true });
    }
    const m = /^\/([^/]+)\/messages$/.exec(url.pathname);
    if (req.method === "POST" && m) {
      const auth = req.headers.authorization ?? "";
      if (!auth.startsWith("Bearer ")) return send(401, { error: { message: "Missing token" } });
      const body = JSON.parse(raw || "{}") as { to?: string; text?: { body?: string } };
      const id = `wamid.TEST${++n}`;
      sent.push({ id, phoneNumberId: m[1], to: body.to ?? "", body: body.text?.body ?? "", auth });
      return send(200, { messaging_product: "whatsapp", contacts: [{ input: body.to, wa_id: body.to }], messages: [{ id }] });
    }
    send(404, { error: { message: "Not found" } });
  });
}).listen(PORT, () => console.log(`mock WhatsApp Cloud API on ${PORT}`));
