/** Average value of non-cancelled orders. Null when the period has none, so a zero is never shown as an average. */
export function averageOrderValue(revenue: number, liveOrders: number): number | null {
  if (!Number.isFinite(revenue) || liveOrders <= 0) return null;
  return revenue / liveOrders;
}

export interface AttachmentLink {
  sourceItemId: string;
  accessoryItemId: string;
}

/**
 * Share of orders that include a linked accessory.
 * An order counts only when it contains a product that has an explicit accessory link.
 * No links, or no such orders, leaves the rate unset rather than reporting 0%.
 */
export function accessoryAttachment(orders: { itemIds: string[] }[], links: AttachmentLink[]): { eligible: number; attached: number; rate: number | null } {
  const bySource = new Map<string, Set<string>>();
  for (const link of links) {
    if (!link.sourceItemId || !link.accessoryItemId || link.sourceItemId === link.accessoryItemId) continue;
    const set = bySource.get(link.sourceItemId) ?? new Set<string>();
    set.add(link.accessoryItemId);
    bySource.set(link.sourceItemId, set);
  }
  if (bySource.size === 0) return { eligible: 0, attached: 0, rate: null };

  let eligible = 0;
  let attached = 0;
  for (const order of orders) {
    const ids = new Set(order.itemIds.filter(Boolean));
    const sources = [...ids].filter((id) => bySource.has(id));
    if (!sources.length) continue;
    eligible += 1;
    if (sources.some((source) => [...bySource.get(source)!].some((accessory) => ids.has(accessory)))) attached += 1;
  }
  return { eligible, attached, rate: eligible > 0 ? attached / eligible : null };
}
