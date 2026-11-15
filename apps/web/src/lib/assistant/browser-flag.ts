/**
 * The browser-task feature of the assistant (contract 1.3: progress of a page task and approval prompts) is OFF unless AI_ASSISTANT_BROWSER is exactly "1".
 * Off means: the approve and cancel routes answer 404, the panel renders none of the browser UI even if an answer carried a `browser` panel, and the widget
 * sends no page path. The Agent has its own switch (AGENT_BROWSER_ENABLED) and its driver stays disabled by default; this flag does not enable it.
 */
export const browserEnabled = (env: Readonly<Record<string, string | undefined>> = process.env): boolean => env.AI_ASSISTANT_BROWSER?.trim() === "1";
