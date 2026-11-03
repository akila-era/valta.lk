import Link from "next/link";
import { tint } from "@/lib/brand-colors";

export interface BrandCategory { slug: string; name: string; count: number }

/**
 * The top of a brand's page, in VOLTA.LK's own style with the brand's colour: a light tint of that colour with a thin
 * border, the brand's logo (or its name as a wordmark) on a white tile, the name and product count, then the brand's
 * categories as chips that filter the products below at once.
 */
export function BrandHero({
  name,
  color,
  logo,
  count,
  categories,
  current,
}: {
  name: string;
  color: string;
  logo?: string;
  count?: number;
  categories: BrandCategory[];
  /** The category chosen in the address (?category=), if any. */
  current?: string;
}) {
  const base = `/products?brand=${encodeURIComponent(name)}`;
  const chip = (on: boolean) =>
    `inline-flex min-h-9 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition-colors ${on ? "border-brand-500 bg-brand-500 text-on-brand" : "border-brand-500/30 bg-white text-ink hover:border-brand-500"}`;
  return (
    <>
      <nav aria-label="Breadcrumbs" className="mb-4">
        <ol className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <li><Link href="/" className="inline-flex min-h-6 items-center hover:text-ink">Home</Link></li>
          <li aria-hidden className="text-muted/70">/</li>
          <li><Link href="/brands" className="inline-flex min-h-6 items-center hover:text-ink">Brands</Link></li>
          <li aria-hidden className="text-muted/70">/</li>
          <li><span className="font-semibold text-ink" aria-current="page">{name}</span></li>
        </ol>
      </nav>
      <section
        aria-labelledby="brand-title"
        className="mb-8 rounded-panel border p-5 sm:p-7"
        style={{ backgroundColor: tint(color, 0.9), borderColor: tint(color, 0.6) }}
      >
        <div className="flex flex-wrap items-center gap-4 sm:gap-6">
          <span className="flex h-20 w-32 shrink-0 items-center justify-center rounded-card bg-white p-3 shadow-card sm:h-24 sm:w-40">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt={`${name} logo`} className="max-h-full max-w-full object-contain" />
            ) : (
              <span aria-hidden className="max-w-full truncate font-display text-xl font-extrabold uppercase tracking-[0.05em] sm:text-2xl" style={{ color }}>
                {name}
              </span>
            )}
          </span>
          <div className="min-w-0">
            <h1 id="brand-title" className="font-display text-[clamp(1.8rem,1.3rem+1.8vw,2.8rem)] font-extrabold leading-tight tracking-title text-ink">{name}</h1>
            {count != null ? <p className="mt-1 text-sm text-ink/70">{count} {count === 1 ? "product" : "products"} at VOLTA.LK</p> : null}
          </div>
        </div>
        {categories.length > 1 ? (
          <nav aria-label={`${name} categories`} className="mt-6">
            <ul className="flex flex-wrap gap-2">
              <li>
                <Link href={base} scroll={false} aria-current={!current ? "page" : undefined} className={chip(!current)}>All</Link>
              </li>
              {categories.map((c) => (
                <li key={c.slug}>
                  <Link href={`${base}&category=${encodeURIComponent(c.slug)}`} scroll={false} aria-current={current === c.slug ? "page" : undefined} className={chip(current === c.slug)}>
                    {c.name} <span className="text-xs opacity-70">{c.count}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
      </section>
    </>
  );
}
