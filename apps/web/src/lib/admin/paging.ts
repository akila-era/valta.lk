export const PAGE_SIZES = [10, 25, 50] as const;
export const DEFAULT_PAGE_SIZE = 25;

/** The per-page choice from the URL, limited to the offered sizes. */
export const parseSize = (v: string | undefined, fallback: number = DEFAULT_PAGE_SIZE): number => PAGE_SIZES.find((s) => String(s) === v) ?? fallback;

/** 1 2 3 4 5 … last, centred on the current page. */
export function pageList(page: number, count: number): (number | "gap")[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);
  const near = new Set([1, count, page - 1, page, page + 1].filter((n) => n >= 1 && n <= count));
  const out: (number | "gap")[] = [];
  [...near].sort((a, b) => a - b).forEach((n, i, a) => {
    if (i && n - a[i - 1] > 1) out.push("gap");
    out.push(n);
  });
  return out;
}
