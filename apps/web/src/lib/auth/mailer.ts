import "server-only";

/**
 * Password-reset email delivery. No email provider is configured for this project yet, so:
 * - in development the reset link is printed to the server console (never to the browser);
 * - in production nothing is sent and an error is logged without the link or email address.
 * Wire a provider (SMTP or an email API) here before relying on password reset in production.
 */
export async function sendPasswordResetEmail(to: string, name: string, link: string): Promise<boolean> {
  if (process.env.NODE_ENV !== "production") {
    console.info(`[dev mail] Password reset for ${name} <${to}>: ${link}`);
    return true;
  }
  console.error("[mail] Password reset requested but no email provider is configured.");
  return false;
}
