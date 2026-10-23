/** Shown while an admin page loads its data: a calm skeleton in the same shape as the dashboard, announced to screen readers. */
export default function AdminLoading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading…</span>
      <div className="mb-6 space-y-2 motion-safe:animate-pulse">
        <div className="h-7 w-44 rounded-md bg-border" />
        <div className="h-4 w-80 max-w-full rounded-md bg-border/70" />
      </div>
      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3 2xl:grid-cols-6 motion-safe:animate-pulse">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="card space-y-3 p-4">
            <div className="flex items-center justify-between"><div className="h-3 w-20 rounded bg-border" /><div className="h-9 w-9 rounded-lg bg-border/70" /></div>
            <div className="h-6 w-24 rounded bg-border" />
            <div className="h-3 w-28 rounded bg-border/70" />
          </div>
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.7fr_1fr] motion-safe:animate-pulse">
        <div className="card h-72" />
        <div className="card h-72" />
      </div>
    </div>
  );
}
