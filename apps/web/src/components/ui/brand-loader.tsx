/**
 * VOLTA.LK wordmark for loading states (decorative: pair it with a labelled status region). The wordmark stays still;
 * only the bar below it moves: a short bar sweeps along the track, or on the splash fills it once. On white (default) the O and the bar are neon orange; on the neon
 * orange splash (`onBrand`) the wordmark and bar are white and the O is black. Under reduced motion the bar is still too.
 */
export function BrandLoaderMark({ size = "lg", onBrand = false }: { size?: "md" | "lg"; onBrand?: boolean }) {
  return (
    <span aria-hidden className="flex flex-col items-center gap-5">
      <span className={`flex items-baseline font-display font-extrabold leading-none tracking-[-0.02em] ${onBrand ? "text-white" : "text-ink"} ${size === "lg" ? "text-5xl sm:text-6xl" : "text-4xl sm:text-5xl"}`}>
        V<span className={onBrand ? "text-ink" : "text-brand-500"}>O</span>LTA<span className="text-[0.82em]">.LK</span>
      </span>
      <span className={`relative h-[3px] w-36 overflow-hidden rounded-full sm:w-44 ${onBrand ? "bg-white/30" : "bg-border"}`}>
        <span className={`absolute inset-y-0 left-0 rounded-full ${onBrand ? "w-full origin-left bg-white animate-loader-fill" : "w-2/5 bg-brand-500 animate-loader-bar"}`} />
      </span>
    </span>
  );
}
