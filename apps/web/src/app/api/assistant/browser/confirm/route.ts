import { decideProposal } from "@/lib/assistant/browser-decision";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** The shopper approves ONE browser proposal. See lib/assistant/browser-decision.ts for every rule (off by default, same identity and conversation as chat). */
export async function POST(req: Request) {
  return decideProposal(req, "confirm");
}
