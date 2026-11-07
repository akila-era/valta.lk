/**
 * Runs once when the server starts. With QR linking on and a saved session, the WhatsApp connection is opened again,
 * so a restart does not need a new QR scan.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { ensureLinkedDevice } = await import("./lib/whatsapp/relay");
    await ensureLinkedDevice();
  } catch {
    /* no database or no session yet: the admin connects from the dashboard */
  }
}
