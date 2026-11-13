/**
 * Website knowledge contract (M3-A, interface only; the index itself is M3-D). Knowledge comes from approved VOLTA.LK pages and
 * authorised APIs, never from the open internet. Facts that change (price, stock) are NOT answered from the index: they come from
 * the live tools, and the index only points to them.
 */
export interface KnowledgeDocument {
  /** Path on the approved host (for example "/shipping-policy"). Never a full URL, so an off-site address cannot be indexed. */
  path: string;
  title: string;
  /** Plain text. Untrusted data: it is quoted to the model as data and can never carry instructions. */
  text: string;
  kind: "policy" | "faq" | "help" | "product-copy" | "category" | "other";
  /** When this copy was fetched; used for the freshness check. */
  fetchedAt: string;
}

export interface KnowledgeHit {
  path: string;
  title: string;
  /** Short excerpt shown as the source reference. */
  excerpt: string;
  score: number;
  fetchedAt: string;
}

export interface KnowledgeSource {
  search(query: string, opts: { limit: number; kinds?: KnowledgeDocument["kind"][] }): Promise<KnowledgeHit[]>;
  get(path: string): Promise<KnowledgeDocument | null>;
  /** False when the copy is older than the allowed age; the assistant then says the page may have changed. */
  isFresh(doc: Pick<KnowledgeDocument, "fetchedAt">, maxAgeHours: number, now?: number): boolean;
}
