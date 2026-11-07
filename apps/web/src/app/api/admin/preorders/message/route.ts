import { requireAdmin } from "@/lib/admin/auth";
import { errorResponse, guard, json, readJson } from "@/lib/security/api";
import { getPreorderMessageSettings, preorderMessageInput, savePreorderMessageSettings, sendPreorderMessage } from "@/lib/whatsapp/preorder-message";
import { z } from "zod";

export const dynamic = "force-dynamic";

async function gate() {
  const access = await requireAdmin();
  if (access.kind === "signed-out") return { error: errorResponse(401, "SIGNED_OUT", "Please sign in.") } as const;
  if (access.kind === "forbidden") return { error: errorResponse(403, "FORBIDDEN", "You do not have access to this action.") } as const;
  return { email: access.admin.email } as const;
}

/** Admin only: the pre-order WhatsApp message settings (on or off, the chosen template, the three templates). */
export async function GET(req: Request) {
  const blocked = guard(req, { name: "admin-settings", limit: 60, windowMs: 60_000 });
  if (blocked) return blocked;
  const g = await gate();
  if ("error" in g) return g.error;
  return json(await getPreorderMessageSettings());
}

/** Admin only: save the settings. */
export async function PUT(req: Request) {
  const blocked = guard(req, { name: "admin-settings", limit: 30, windowMs: 60_000, mutating: true });
  if (blocked) return blocked;
  const g = await gate();
  if ("error" in g) return g.error;
  const parsed = preorderMessageInput.safeParse(await readJson(req, 8_000).catch(() => null));
  if (!parsed.success) return errorResponse(422, "INVALID", "Each template needs at least 10 characters (up to 1000).");
  if (!(await savePreorderMessageSettings(parsed.data, g.email))) return errorResponse(503, "NO_DATABASE", "Website database is not configured.");
  return json({ ok: true });
}

/** Admin only: send the message again for one pre-order (after connecting WhatsApp, for example). */
export async function POST(req: Request) {
  const blocked = guard(req, { name: "admin-settings", limit: 30, windowMs: 60_000, mutating: true });
  if (blocked) return blocked;
  const g = await gate();
  if ("error" in g) return g.error;
  const parsed = z.object({ id: z.string().min(1).max(40) }).safeParse(await readJson(req, 500).catch(() => null));
  if (!parsed.success) return errorResponse(422, "INVALID", "Unknown pre-order.");
  await sendPreorderMessage(parsed.data.id);
  return json({ ok: true });
}
