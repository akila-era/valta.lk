import { z } from "zod";
import type { ProposedAction } from "../../backend/types";
import type { SafeFetcher, SearchProvider, SearchQuota, SearchResult, TtlCache } from "../../search";
import type { Actor, CartLineSnapshot, ToolRegistry } from "../registry";
import type { ToolEvidence } from "./evidence";

/**
 * Authorisation classes. "read" tools only read the shop's own data or compute; "search" tools query a search provider; "external" tools fetch a page from the
 * public web; "disabled" tools are registered so the model-facing catalogue is complete but can never run (code execution has no approved sandbox, order data
 * has no approved backend route or privacy design); "proposal" tools never change anything themselves: they return a PROPOSAL that the shopper's own browser applies
 * only after the shopper confirms (the server has no cart). A proposal tool is OFF unless the lane lists it explicitly in `enabled`.
 */
export type AuthClass = "read" | "search" | "external" | "proposal" | "disabled";

/** What the server knows about this conversation (the `recall_conversation` tool reads it; the model cannot write it). Bounded when shown. */
export type SessionFacts = Record<string, unknown>;

/** Scratch space for ONE turn: ids of this turn's search results (so `fetch_page` can only take an id, never a URL) and a page counter. */
export interface TurnScratch {
  results: Map<string, { url: string; title: string }>;
  fetchedPages: number;
  nextResultNumber: number;
}

export interface LlmToolDeps {
  /** The existing shopping tools (strict schemas, actor checks, timeouts). The adapters call THIS; they never re-implement catalogue logic. */
  registry: ToolRegistry;
  search?: {
    provider: SearchProvider;
    /** False for an adapter that has no key/fetch. */
    providerEnabled?: boolean;
    quota: SearchQuota;
    cache: TtlCache<SearchResult[]>;
    fetcher: SafeFetcher;
  };
  /** Allow-list of official documentation domains per product key, for `lookup_documentation`. */
  docDomains?: Readonly<Record<string, readonly string[]>>;
  /** Read-only PUBLIC website information (store details, page text). Without it the site tools are not offered. */
  siteInfo?: SiteInfoSource;
}

/** The website's published store details, exactly as the relay returns them (see `backend/site-transport.ts`). */
export interface SiteInfo {
  name: string;
  phone: string;
  phone2: string;
  whatsapp: string;
  email: string;
  address: string;
  hours: string[];
  deliveryTime: string;
  pickupInfo: string;
  paymentMethods: string[];
  bankTransferOffered: boolean;
  instalments: { providers: string[]; parts: number } | null;
  pages: string[];
}

export interface SiteInfoSource {
  info(signal?: AbortSignal): Promise<SiteInfo>;
  /** The text of one public page, or null when the site has no such page. */
  page(slug: string, signal?: AbortSignal): Promise<{ slug: string; path: string; text: string } | null>;
}

export interface LlmToolContext {
  actor: Actor;
  requestId: string;
  /** Identifies the conversation for quotas (never logged with text). */
  sessionKey: string;
  signal: AbortSignal;
  session: SessionFacts;
  /** The browser's cart snapshot for this request (untrusted: the shop backend revalidates it). Only the cart proposal tool uses it. */
  cart?: readonly CartLineSnapshot[];
  turn: TurnScratch;
  deps: LlmToolDeps;
  now: () => number;
}

/**
 * `proposal` (cart tools only) is the client action the shopper's browser may apply after the shopper confirms. It is for the SERVER's response, never shown to the
 * model as something that happened, and it still goes through the existing action verification before it reaches a customer.
 */
export type ToolRun = { ok: true; data: unknown; evidence: ToolEvidence[]; untrusted?: boolean; proposal?: ProposedAction } | { ok: false; code: string; message: string };

export interface LlmTool<S extends z.ZodObject = z.ZodObject> {
  name: string;
  description: string;
  auth: AuthClass;
  /** Always a strict object: unknown keys are refused by the schema (the executor's tolerant parser drops unknown keys first and records that it did). */
  args: S;
  /** JSON schema in the shape Ollama's `tools` parameter expects. */
  parameters: Record<string, unknown>;
  timeoutMs: number;
  /** A dependency the tool cannot run without: when it is missing the tool is not offered to the model (and is listed as unavailable). */
  needs?: "siteInfo";
  /** Upper bound on the text shown to the model for one result. */
  maxResultChars: number;
  execute(args: z.output<S>, ctx: LlmToolContext): Promise<ToolRun>;
}

export function defineLlmTool<S extends z.ZodObject>(def: Omit<LlmTool<S>, "parameters" | "timeoutMs" | "maxResultChars"> & { timeoutMs?: number; maxResultChars?: number }): LlmTool<S> {
  if (!/^[a-z][a-z0-9_]{2,40}$/.test(def.name)) throw new Error("Invalid tool name.");
  const schema = z.toJSONSchema(def.args, { io: "input" }) as Record<string, unknown>;
  delete schema.$schema;
  delete schema.additionalProperties;
  const props = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
  for (const p of Object.values(props)) delete p.default; // keeps the prompt short; defaults are applied server-side
  return { ...def, parameters: schema, timeoutMs: def.timeoutMs ?? 5_000, maxResultChars: def.maxResultChars ?? 4_000 };
}

export const newTurnScratch = (): TurnScratch => ({ results: new Map(), fetchedPages: 0, nextResultNumber: 1 });
