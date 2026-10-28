/**
 * A ring spinner: a faint orange track with a bright orange arc (round ends, fading into the track) running round it
 * (decorative: pair it with a labelled status region). Under reduced motion it stays as a still ring.
 */
export function DotSpinner({ size = 56, className = "" }: { size?: number; className?: string }) {
  const stroke = Math.max(4, size * 0.11);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg aria-hidden width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={`animate-dot-ring ${className}`}>
      <defs>
        <linearGradient id="valta-ring-arc" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ff5c00" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#ff5c00" />
        </linearGradient>
      </defs>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#ff5c00" strokeOpacity="0.2" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="url(#valta-ring-arc)" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${c * 0.7} ${c}`} />
    </svg>
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
