/** Only same-site paths are allowed as post-login destinations (no open redirects). Shared by server and client. */
export function safeNext(next?: string | null): string {
  return next && /^\/(?!\/)[\w\-./?=&%#]*$/.test(next) && !next.startsWith("/api/") ? next : "/account";
}
