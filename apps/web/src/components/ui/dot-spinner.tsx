/** Dot sizes (as a share of the spinner's width) and colours, head of the trail first: big and orange to small and pale. */
const DOTS = [
  { d: 0.2, c: "#ff5c00" },
  { d: 0.185, c: "#ff6a14" },
  { d: 0.17, c: "#ff7a2e" },
  { d: 0.155, c: "#ff8a45" },
  { d: 0.14, c: "#ff9a5c" },
  { d: 0.125, c: "#ff9e66" },
  { d: 0.115, c: "#ffa677" },
  { d: 0.105, c: "#ffae86" },
  { d: 0.095, c: "#ffb896" },
  { d: 0.085, c: "#ffc2a6" },
];

/**
 * A full ring of dots that shrinks and fades along its trail while it spins (decorative: pair it with a labelled status
 * region). Orange tints on white, in the store's palette. Under reduced motion it stays as a still ring.
 */
export function DotSpinner({ size = 56, className = "" }: { size?: number; className?: string }) {
  const r = size * 0.4; // radius of the ring of dot centres
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
              background: dot.c,
              // each dot sits on the ring, 36 degrees behind the previous one, so ten dots close the ring (the spin runs clockwise)
              transform: `rotate(${-i * 36}deg) translateY(${-r}px)`,
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
