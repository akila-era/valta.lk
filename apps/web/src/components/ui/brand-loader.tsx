/**
 * VOLTA.LK wordmark for loading states (decorative: pair it with a labelled status region). The wordmark stays still
 * (the O in neon orange); only a short neon orange bar sweeps along the track below it. Under reduced motion the bar
 * is still too.
 */
export function BrandLoaderMark({ size = "lg" }: { size?: "md" | "lg" }) {
  return (
    <span aria-hidden className="flex flex-col items-center gap-5">
      <span className={`flex items-baseline font-display font-extrabold leading-none tracking-[-0.02em] text-ink ${size === "lg" ? "text-5xl sm:text-6xl" : "text-4xl sm:text-5xl"}`}>
        V<span className="text-brand-500">O</span>LTA<span className="text-[0.82em]">.LK</span>
      </span>
      <span className="relative h-[3px] w-36 overflow-hidden rounded-full bg-border sm:w-44">
        <span className="absolute inset-y-0 left-0 w-2/5 rounded-full bg-brand-500 animate-loader-bar" />
      </span>
    </span>
  );
}
