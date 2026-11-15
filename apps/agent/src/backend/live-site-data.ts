import type { SiteData } from "./site";

type Content = SiteData["content"];

/**
 * Website-owned data for the real-catalogue path. Today only the staff-entered specification rows are read (accessory links, promotions and
 * customer orders stay empty: customer data never reaches the Agent). The rows are fetched in the background and the LAST GOOD copy is
 * served, so a slow or failing website never slows or breaks a chat; a failed refresh keeps what was known and only counts the failure.
 * Synchronous reads by the catalogue mapper see a plain object.
 */
export interface LiveSiteData extends SiteData {
  /** Fetches once now. Resolves true on success, false when the website did not answer (the previous rows stay in use). */
  refresh(): Promise<boolean>;
  /** Starts a periodic refresh that never keeps the process alive. Returns a stop function. */
  start(intervalMs?: number): () => void;
  readonly stats: { refreshes: number; failures: number; products: number };
}

export function createLiveSiteData(fetchContent: () => Promise<Content>): LiveSiteData {
  let current: Content = {};
  const stats = { refreshes: 0, failures: 0, products: 0 };
  let inFlight: Promise<boolean> | null = null;
  const site: LiveSiteData = {
    links: [],
    promotions: [],
    get content() {
      return current;
    },
    customerOrders: new Map(),
    stats,
    refresh() {
      inFlight ??= fetchContent()
        .then((c) => {
          current = c;
          stats.refreshes++;
          stats.products = Object.keys(c).length;
          return true;
        })
        .catch(() => {
          stats.failures++;
          return false;
        })
        .finally(() => {
          inFlight = null;
        });
      return inFlight;
    },
    start(intervalMs = 60_000) {
      const t = setInterval(() => void site.refresh(), Math.max(5_000, intervalMs));
      t.unref();
      return () => clearInterval(t);
    },
  };
  return site;
}
