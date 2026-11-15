/**
 * The QA control center is a DEVELOPMENT tool. It is available only when AI_QA_ENABLED is exactly "true" AND the build is not a
 * production build, so a production deployment never serves it even if the variable is set by mistake. (No "server-only" import here
 * so the rule can be unit tested; the pages and routes that use it are server-only.)
 */
export function qaEnabled(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return env.NODE_ENV !== "production" && env.AI_QA_ENABLED?.trim() === "true";
}
