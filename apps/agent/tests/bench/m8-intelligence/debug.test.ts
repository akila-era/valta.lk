import { it } from "vitest";
import { createMockStack } from "../../../src/mock/stack";
import { sessionKey } from "../../../src/session/store";
import { RichTransport, richSite } from "../../fixtures/rich-catalogue";
import { run, SESSION } from "../../fixtures/pipeline-helpers";

/** Manual debugging aid for the M8 work (skipped in the normal run): M8_SAY is a "|"-separated list of messages sent in one conversation. */
it.runIf(process.env.M8_SAY)("prints what the Agent does for a conversation", async () => {
  const decisions: unknown[] = [];
  const tools: string[] = [];
  const s = createMockStack({ transport: new RichTransport(), site: richSite(), catalogueTtlMs: 0, metrics: { tool: (n) => void tools.push(n), toolBatchMs: () => undefined }, onDecision: (d) => void decisions.push({ intent: d.intent, router: d.routerIntent, reason: d.reason, template: d.template }) });
  const key = sessionKey({ kind: "guest" }, SESSION);
  const out: string[] = [];
  for (const say of (process.env.M8_SAY ?? "").split("|")) {
    decisions.length = 0;
    tools.length = 0;
    const { result } = await run(s.pipeline, say);
    const st = s.sessions.get(key)?.reasoning;
    out.push(`> ${say}`, `  decision: ${JSON.stringify(decisions[0])} tools=${JSON.stringify(tools)}`, `  reply: ${result.reply.text.replace(/\n\n/g, " // ")}`, `  cards: ${result.cards.map((c) => (c.type === "product" ? `${c.id}@${c.price.amount}` : c.type)).join(", ")}`, `  profile: ${JSON.stringify(st?.profile)} pending=${st?.pending} lastResult=${JSON.stringify(st?.lastResultIds)} discussed=${JSON.stringify(st?.discussed)}`);
  }
  process.stdout.write(`\n${out.join("\n")}\n`);
});
