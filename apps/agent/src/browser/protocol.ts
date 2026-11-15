import { z } from "zod";
import { ACTION_CLASSES } from "../tools/action-classes";

/**
 * Contract between the Agent and the (future) browser worker. M3-A defines and tests the shape only; no worker exists yet.
 *
 * What the contract makes impossible, on purpose:
 *  - there is no field for cookies, headers, storage, tokens, credentials or a user-data directory, so none can be sent or returned;
 *  - there is no "evaluate script" and no free CSS or XPath selector: elements are addressed only by a `ref` the worker itself returned
 *    in the latest snapshot, so a model cannot target something it was not shown;
 *  - the only way to name a page is a URL that the worker re-checks against the URL policy (exact host, no redirects off-site);
 *  - every request is `.strict()`: unknown fields are rejected, not ignored.
 * Page text always comes back flagged `untrusted: true`: it is data, never instructions.
 */
const Ref = z.string().regex(/^e[0-9]{1,6}(?:-[0-9]{1,5})?$/);
const TaskId = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);
const TypedText = z
  .string()
  .max(500)
  // eslint-disable-next-line no-control-regex
  .regex(/^[^\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]*$/);

/** One isolated, anonymous browser context per task. Destroyed when the task ends or times out. */
export const BrowserRequest = z.discriminatedUnion("op", [
  z.object({ op: z.literal("open"), taskId: TaskId, url: z.string().max(2048) }).strict(),
  z.object({ op: z.literal("snapshot"), taskId: TaskId }).strict(),
  z.object({ op: z.literal("read_text"), taskId: TaskId }).strict(),
  z.object({ op: z.literal("click"), taskId: TaskId, ref: Ref }).strict(),
  z.object({ op: z.literal("type"), taskId: TaskId, ref: Ref, text: TypedText }).strict(),
  z.object({ op: z.literal("select"), taskId: TaskId, ref: Ref, value: z.string().max(200) }).strict(),
  z.object({ op: z.literal("scroll"), taskId: TaskId, direction: z.enum(["up", "down"]) }).strict(),
  z.object({ op: z.literal("screenshot"), taskId: TaskId }).strict(),
  z.object({ op: z.literal("close"), taskId: TaskId }).strict(),
]);
export type BrowserRequest = z.infer<typeof BrowserRequest>;

export const SnapshotElement = z
  .object({
    ref: Ref,
    role: z.string().max(40),
    name: z.string().max(200),
    /** What kind of effect interacting with it could have; decided by the worker from the element, not by the model. */
    actionClass: z.enum(ACTION_CLASSES),
  })
  .strict();

export const BrowserResponse = z.discriminatedUnion("ok", [
  z
    .object({
      ok: z.literal(true),
      taskId: TaskId,
      /** The page the worker is now on (always an allowed address). */
      url: z.string().max(2048),
      title: z.string().max(200).optional(),
      /** Visible text, length-capped. Untrusted data. */
      text: z.string().max(20_000).optional(),
      untrusted: z.literal(true),
      elements: z.array(SnapshotElement).max(200).optional(),
      /** Handle to a stored screenshot, never inline image bytes. */
      screenshotId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/).optional(),
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      taskId: TaskId.optional(),
      reason: z.enum(["blocked_url", "blocked_redirect", "blocked_resource", "timeout", "unknown_element", "needs_confirmation", "page_error", "worker_busy", "bad_request"]),
    })
    .strict(),
]);
export type BrowserResponse = z.infer<typeof BrowserResponse>;

/** Hard limits the worker must enforce per task (values are the contract; the worker is built in M3-E). */
export const BROWSER_LIMITS = Object.freeze({
  maxStepsPerTask: 20,
  maxTaskSeconds: 120,
  maxConcurrentTasks: 2,
  maxTextChars: 20_000,
  maxDownloadBytes: 0, // downloads are not part of M3-E scope
});
