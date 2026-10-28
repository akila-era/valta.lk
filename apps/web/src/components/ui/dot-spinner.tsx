/** Dot sizes (as a share of the spinner's width) and opacities, head of the trail first: all neon orange, each a little smaller and fainter. */
const DOTS = [
  { d: 0.16, o: 1 },
  { d: 0.15, o: 1 },
  { d: 0.14, o: 0.9 },
  { d: 0.13, o: 0.8 },
  { d: 0.12, o: 0.7 },
  { d: 0.11, o: 0.6 },
  { d: 0.1, o: 0.5 },
  { d: 0.09, o: 0.4 },
];

/**
 * Eight separate round dots in a ring, all neon orange, fading along the trail, spinning clockwise (decorative:
 * pair it with a labelled status region). Under reduced motion it stays as a still ring.
 */
export function DotSpinner({ size = 56, className = "" }: { size?: number; className?: string }) {
  const r = size * 0.38; // radius of the ring of dot centres
  return (
    <span aria-hidden className={`relative inline-block animate-dot-ring ${className}`} style={{ width: size, height: size }}>
      {DOTS.map((dot, i) => {
        const d = dot.d * size;
        return (
          <span
            key={i}
            className="absolute left-1/2 top-1/2 rounded-full"
            style={{
              width: d,
              height: d,
              marginLeft: -d / 2,
              marginTop: -d / 2,
              background: "#ff5c00",
              opacity: dot.o,
              // each dot sits on the ring, 45 degrees behind the previous one, so the eight close the circle
              transform: `rotate(${-i * 45}deg) translateY(${-r}px)`,
            }}
          />
        );
      })}
    </span>
  );
}

/** Full-width centred loading state for a page that is being fetched: only the spinner is shown; the label is for screen readers. */
export function PageLoader({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="flex min-h-[55vh] animate-loader-in items-center justify-center">
      <DotSpinner size={68} />
      <span className="sr-only">{label}</span>
    </div>
  );
}
