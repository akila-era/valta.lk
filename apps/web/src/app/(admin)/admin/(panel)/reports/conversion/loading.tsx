/** Skeleton in the shape of the Conversion Analytics page (six cards, funnel + chart, table + bars, revenue). */
export default function ConversionLoading() {
  const block = "card motion-safe:animate-pulse";
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading conversion analytics…</span>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3 motion-safe:animate-pulse">
        <div className="space-y-2">
          <div className="h-7 w-56 rounded-md bg-border" />
          <div className="h-4 w-96 max-w-full rounded-md bg-border/70" />
        </div>
        <div className="h-9 w-72 max-w-full rounded-lg bg-border/70" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 2xl:grid-cols-6">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className={`${block} space-y-3 p-4`}>
            <div className="flex items-center justify-between"><div className="h-3 w-20 rounded bg-border" /><div className="h-9 w-9 rounded-lg bg-border/70" /></div>
            <div className="h-6 w-20 rounded bg-border" />
            <div className="h-3 w-28 rounded bg-border/70" />
          </div>
        ))}
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.45fr)]">
        <div className={`${block} h-80`} />
        <div className={`${block} h-80`} />
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className={`${block} h-72`} />
        <div className={`${block} h-72`} />
      </div>
      <div className={`${block} mt-5 h-56`} />
    </div>
  );
}
