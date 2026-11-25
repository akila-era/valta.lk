import { SubCategoryRow, type SubTile } from "./sub-category-row";

interface CategoryHeaderProps {
  slug: string;
  name: string;
  count: number;
  /** Kept for callers; the header no longer shows a photo. */
  image?: string;
  subs: { slug: string; name: string; count: number }[];
  activeSub?: string;
}

/**
 * Category introduction: the name with its product count, then (when there are sub-categories) a scrollable row of
 * sub-category tiles with real counts. The catalogue has no category descriptions, so none are written here.
 */
export function CategoryHeader({ slug, name, count, subs, activeSub }: CategoryHeaderProps) {
  const tiles: SubTile[] = [
    { key: "all", label: "All", count, href: `/categories/${slug}`, active: !activeSub, all: true },
    ...subs.map((s) => ({ key: s.slug, label: s.name, count: s.count, href: `/categories/${slug}?sub=${encodeURIComponent(s.slug)}`, active: s.slug === activeSub })),
  ];
  return (
    <header className="mb-6">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
        <h1 className="page-title animate-lift">{name}</h1>
        <p className="type-meta">{count} {count === 1 ? "product" : "products"}</p>
      </div>
      {subs.length > 0 && (
        <div className="mt-4 border-b border-border pb-2">
          <SubCategoryRow tiles={tiles} label={`${name} sub-categories`} />
        </div>
      )}
    </header>
  );
}
