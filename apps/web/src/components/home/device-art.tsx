/**
 * Decorative, generic device illustrations used only where no real product photo exists.
 * They are not product images and carry no brand, model or specification.
 */
export function PhoneArt({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 120 240" className={className} style={style} aria-hidden focusable="false">
      <rect x="6" y="6" width="108" height="228" rx="22" fill="#101820" stroke="#475467" strokeWidth="2" />
      <rect x="12" y="12" width="96" height="216" rx="17" fill="#1d2a38" />
      <rect x="12" y="12" width="96" height="216" rx="17" fill="url(#pg)" />
      <rect x="44" y="18" width="32" height="8" rx="4" fill="#101820" />
      <circle cx="60" cy="130" r="30" fill="#ff5c00" opacity=".9" />
      <rect x="28" y="190" width="64" height="6" rx="3" fill="#fff" opacity=".35" />
      <defs>
        <linearGradient id="pg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".14" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function EarbudsArt({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 160 140" className={className} style={style} aria-hidden focusable="false">
      <rect x="22" y="48" width="116" height="78" rx="30" fill="#f6f7f9" stroke="#d0d5dd" strokeWidth="2" />
      <path d="M22 78h116" stroke="#d0d5dd" strokeWidth="2" />
      <circle cx="80" cy="102" r="6" fill="#ff5c00" />
      <ellipse cx="56" cy="34" rx="15" ry="22" fill="#101820" />
      <ellipse cx="104" cy="34" rx="15" ry="22" fill="#101820" />
      <ellipse cx="52" cy="28" rx="5" ry="9" fill="#fff" opacity=".18" />
      <ellipse cx="100" cy="28" rx="5" ry="9" fill="#fff" opacity=".18" />
    </svg>
  );
}

export function WatchArt({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 120 200" className={className} style={style} aria-hidden focusable="false">
      <rect x="38" y="4" width="44" height="60" rx="10" fill="#344054" />
      <rect x="38" y="136" width="44" height="60" rx="10" fill="#344054" />
      <rect x="14" y="52" width="92" height="96" rx="26" fill="#101820" stroke="#475467" strokeWidth="2" />
      <rect x="22" y="60" width="76" height="80" rx="20" fill="#1d2a38" />
      <circle cx="60" cy="100" r="22" fill="none" stroke="#ff5c00" strokeWidth="6" strokeDasharray="100 40" strokeLinecap="round" />
      <rect x="106" y="86" width="6" height="24" rx="3" fill="#475467" />
    </svg>
  );
}

export function DeviceTrio({ className = "" }: { className?: string }) {
  const f = (r: string, dur: string, d: string) => ({ "--r": r, "--dur": dur, "--d": d }) as React.CSSProperties;
  return (
    <div className={`relative ${className}`} aria-hidden>
      <PhoneArt className="absolute left-[24%] top-[6%] h-[78%] animate-float drop-shadow-xl" style={f("-6deg", "7s", "0ms")} />
      <WatchArt className="absolute bottom-[4%] right-[10%] h-[52%] animate-float drop-shadow-xl" style={f("6deg", "6s", "700ms")} />
      <EarbudsArt className="absolute bottom-[2%] left-[4%] h-[34%] animate-float drop-shadow-xl" style={f("-3deg", "5s", "1200ms")} />
    </div>
  );
}
