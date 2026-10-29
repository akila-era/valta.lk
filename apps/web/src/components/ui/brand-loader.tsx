/** The wordmark split into pieces that rise in one after another; the O is the neon orange one. */
const PIECES = [
  { t: "V" },
  { t: "O", brand: true },
  { t: "L" },
  { t: "T" },
  { t: "A" },
  { t: ".LK", small: true },
];

/**
 * Animated VOLTA.LK wordmark for loading states (decorative: pair it with a labelled status region). The letters rise
 * in one by one, the orange O glows, and a short neon orange bar sweeps along the track below. Under reduced motion it
 * is simply shown still.
 */
export function BrandLoaderMark({ size = "lg" }: { size?: "md" | "lg" }) {
  return (
    <span aria-hidden className="flex flex-col items-center gap-5">
      <span className={`flex items-baseline font-display font-extrabold leading-none tracking-[-0.02em] text-ink ${size === "lg" ? "text-5xl sm:text-6xl" : "text-4xl sm:text-5xl"}`}>
        {PIECES.map((p, i) => (
          <span key={p.t} className={`inline-block animate-letter-in ${p.small ? "text-[0.82em]" : ""}`} style={{ "--i": i } as React.CSSProperties}>
            {p.brand ? <span className="inline-block animate-o-glow text-brand-500">{p.t}</span> : p.t}
          </span>
        ))}
      </span>
      <span className="relative h-[3px] w-36 overflow-hidden rounded-full bg-border sm:w-44">
        <span className="absolute inset-y-0 left-0 w-2/5 rounded-full bg-brand-500 animate-loader-bar" />
      </span>
    </span>
  );
}
