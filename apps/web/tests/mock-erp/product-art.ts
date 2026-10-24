export interface ItemInfo {
  name: string;
  category: string;
  subCategory?: string;
}

export function renderProductSvg(it?: ItemInfo): string {
  const name = it?.name || "";
  const cat = it?.category || "";
  const sub = it?.subCategory || "";

  const defs = `
    <defs>
      <linearGradient id="metalGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#2a2e39"/>
        <stop offset="50%" stop-color="#16181d"/>
        <stop offset="100%" stop-color="#0d0e12"/>
      </linearGradient>
      <linearGradient id="screenGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#1e1b4b"/>
        <stop offset="40%" stop-color="#312e81"/>
        <stop offset="75%" stop-color="#ff5c00"/>
        <stop offset="100%" stop-color="#fbbf24"/>
      </linearGradient>
      <linearGradient id="screenGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#090d16"/>
        <stop offset="50%" stop-color="#0f2b48"/>
        <stop offset="85%" stop-color="#ff5c00"/>
        <stop offset="100%" stop-color="#f97316"/>
      </linearGradient>
      <linearGradient id="phoneGlow" x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#0d1117"/>
        <stop offset="60%" stop-color="#161b22"/>
        <stop offset="100%" stop-color="#ff5c00" stop-opacity="0.8"/>
      </linearGradient>
      <linearGradient id="glassReflection" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.25"/>
        <stop offset="35%" stop-color="#ffffff" stop-opacity="0.05"/>
        <stop offset="36%" stop-color="#ffffff" stop-opacity="0"/>
        <stop offset="100%" stop-color="#ffffff" stop-opacity="0.02"/>
      </linearGradient>
      <linearGradient id="orangeAccent" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#ff7a2e"/>
        <stop offset="100%" stop-color="#ff5c00"/>
      </linearGradient>
      <linearGradient id="silverGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#f8fafc"/>
        <stop offset="50%" stop-color="#cbd5e1"/>
        <stop offset="100%" stop-color="#94a3b8"/>
      </linearGradient>
      <radialGradient id="earbudShine" cx="30%" cy="25%" r="70%">
        <stop offset="0%" stop-color="#ffffff"/>
        <stop offset="60%" stop-color="#f1f5f9"/>
        <stop offset="100%" stop-color="#cbd5e1"/>
      </radialGradient>
      <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#090b10" flood-opacity="0.18"/>
      </filter>
      <filter id="glowLight" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="0" stdDeviation="8" flood-color="#ff5c00" flood-opacity="0.4"/>
      </filter>
    </defs>
  `;

  // 1. Smartphones
  if (/nova x1/i.test(name)) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="100%" height="100%">
      ${defs}
      <g filter="url(#softShadow)">
        <rect x="122" y="36" width="156" height="328" rx="32" fill="#1e222b" stroke="#333846" stroke-width="2.5"/>
        <rect x="126" y="40" width="148" height="320" rx="28" fill="#0b0d11"/>
        <rect x="130" y="44" width="140" height="312" rx="24" fill="url(#screenGrad1)"/>
        <path d="M 130 44 L 270 44 L 130 240 Z" fill="url(#glassReflection)"/>
        <rect x="178" y="52" width="44" height="14" rx="7" fill="#000000"/>
        <circle cx="210" cy="59" r="3.5" fill="#111827"/>
        <rect x="175" y="344" width="50" height="4" rx="2" fill="#ffffff" fill-opacity="0.75"/>
        <text x="145" y="62" fill="#ffffff" font-size="9" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-weight="600" opacity="0.9">9:41</text>
        <circle cx="250" cy="59" r="2.5" fill="#ffffff" opacity="0.8"/>
        <circle cx="215" cy="210" r="42" fill="#ff5c00" opacity="0.85" filter="url(#glowLight)"/>
        <circle cx="175" cy="180" r="30" fill="#fbbf24" opacity="0.6"/>
      </g>
    </svg>`;
  }

  if (/orbit pro/i.test(name)) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="100%" height="100%">
      ${defs}
      <g filter="url(#softShadow)">
        <rect x="120" y="34" width="160" height="332" rx="34" fill="#12151c" stroke="#ff5c00" stroke-width="1.5" stroke-opacity="0.4"/>
        <rect x="124" y="38" width="152" height="324" rx="30" fill="#08090c"/>
        <rect x="128" y="42" width="144" height="316" rx="26" fill="url(#screenGrad2)"/>
        <path d="M 128 42 L 272 42 L 128 280 Z" fill="url(#glassReflection)"/>
        <circle cx="200" cy="56" r="5" fill="#000000"/>
        <circle cx="200" cy="56" r="2" fill="#1e293b"/>
        <text x="200" y="112" text-anchor="middle" fill="#ffffff" font-size="28" font-family="-apple-system, sans-serif" font-weight="700" letter-spacing="-0.5">10:24</text>
        <text x="200" y="128" text-anchor="middle" fill="#ffffff" font-size="10" font-family="-apple-system, sans-serif" font-weight="500" opacity="0.7">Saturday, Oct 24</text>
        <circle cx="200" cy="220" r="46" fill="url(#orangeAccent)" filter="url(#glowLight)"/>
        <ellipse cx="200" cy="220" rx="54" ry="18" fill="none" stroke="#ffffff" stroke-width="2" opacity="0.6" transform="rotate(-20 200 220)"/>
        <rect x="175" y="346" width="50" height="4" rx="2" fill="#ffffff" opacity="0.8"/>
      </g>
    </svg>`;
  }

  if (/nova lite/i.test(name) || /phone|mobile/i.test(cat)) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="100%" height="100%">
      ${defs}
      <g filter="url(#softShadow)">
        <rect x="124" y="38" width="152" height="324" rx="30" fill="#1e293b" stroke="#475569" stroke-width="2"/>
        <rect x="128" y="42" width="144" height="316" rx="26" fill="url(#phoneGlow)"/>
        <path d="M 128 42 L 272 42 L 128 220 Z" fill="url(#glassReflection)"/>
        <circle cx="200" cy="56" r="4" fill="#090d16"/>
        <circle cx="200" cy="200" r="38" fill="url(#orangeAccent)" opacity="0.9" filter="url(#glowLight)"/>
        <rect x="175" y="344" width="50" height="4" rx="2" fill="#ffffff" opacity="0.7"/>
      </g>
    </svg>`;
  }

  // 2. Audio - Earbuds
  if (/earbud/i.test(name) || /earbud/i.test(sub)) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="100%" height="100%">
      ${defs}
      <g filter="url(#softShadow)">
        <rect x="120" y="160" width="160" height="150" rx="55" fill="url(#earbudShine)" stroke="#e2e8f0" stroke-width="2"/>
        <path d="M 120 205 C 160 215, 240 215, 280 205" fill="none" stroke="#cbd5e1" stroke-width="2"/>
        <circle cx="200" cy="235" r="3.5" fill="#22c55e"/>
        <g transform="translate(-10, -10)">
          <rect x="156" y="95" width="14" height="65" rx="7" fill="url(#earbudShine)" stroke="#e2e8f0" stroke-width="1"/>
          <ellipse cx="160" cy="95" rx="22" ry="18" fill="url(#earbudShine)" stroke="#e2e8f0" stroke-width="1"/>
          <ellipse cx="152" cy="95" rx="9" ry="12" fill="#1e293b"/>
          <rect x="156" y="154" width="14" height="6" rx="3" fill="#94a3b8"/>
        </g>
        <g transform="translate(10, -10)">
          <rect x="230" y="95" width="14" height="65" rx="7" fill="url(#earbudShine)" stroke="#e2e8f0" stroke-width="1"/>
          <ellipse cx="240" cy="95" rx="22" ry="18" fill="url(#earbudShine)" stroke="#e2e8f0" stroke-width="1"/>
          <ellipse cx="248" cy="95" rx="9" ry="12" fill="#1e293b"/>
          <rect x="230" y="154" width="14" height="6" rx="3" fill="#94a3b8"/>
        </g>
      </g>
    </svg>`;
  }

  // 3. Audio - Over-Ear Headphones
  if (/headphone/i.test(name) || /headphone/i.test(sub)) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="100%" height="100%">
      ${defs}
      <g filter="url(#softShadow)">
        <path d="M 115 210 C 115 80, 285 80, 285 210" fill="none" stroke="#1e2430" stroke-width="26" stroke-linecap="round"/>
        <path d="M 125 180 C 130 95, 270 95, 275 180" fill="none" stroke="#ff5c00" stroke-width="4" opacity="0.85"/>
        <g transform="translate(90, 175)">
          <rect x="0" y="0" width="46" height="95" rx="23" fill="#0f131a" stroke="#2d3748" stroke-width="2"/>
          <rect x="8" y="8" width="30" height="79" rx="15" fill="#1a202c"/>
          <circle cx="23" cy="47" r="12" fill="#ff5c00" opacity="0.9"/>
        </g>
        <g transform="translate(264, 175)">
          <rect x="0" y="0" width="46" height="95" rx="23" fill="#0f131a" stroke="#2d3748" stroke-width="2"/>
          <rect x="8" y="8" width="30" height="79" rx="15" fill="#1a202c"/>
          <circle cx="23" cy="47" r="12" fill="#ff5c00" opacity="0.9"/>
        </g>
        <rect x="110" y="155" width="8" height="28" rx="3" fill="#94a3b8"/>
        <rect x="282" y="155" width="8" height="28" rx="3" fill="#94a3b8"/>
      </g>
    </svg>`;
  }

  // 4. Audio - Speakers
  if (/speaker/i.test(name) || /speaker/i.test(sub)) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="100%" height="100%">
      ${defs}
      <g filter="url(#softShadow)">
        <rect x="135" y="70" width="130" height="260" rx="65" fill="#181c24" stroke="#2d3748" stroke-width="3"/>
        <path d="M 140 120 L 260 120 M 140 150 L 260 150 M 140 180 L 260 180 M 140 210 L 260 210 M 140 240 L 260 240 M 140 270 L 260 270" stroke="#252b38" stroke-width="3" stroke-dasharray="4 4"/>
        <circle cx="200" cy="195" r="34" fill="#0e1117" stroke="#ff5c00" stroke-width="3"/>
        <path d="M 200 183 L 200 207 M 188 195 L 212 195" stroke="#ffffff" stroke-width="3" stroke-linecap="round"/>
        <ellipse cx="200" cy="72" rx="65" ry="14" fill="#2d3748"/>
        <ellipse cx="200" cy="328" rx="65" ry="14" fill="#12161f"/>
        <path d="M 200 58 Q 230 25 240 50 Q 245 75 220 70" fill="none" stroke="#ff5c00" stroke-width="5" stroke-linecap="round"/>
      </g>
    </svg>`;
  }

  // 5. Wearables - Smartwatch
  if (/smartwatch/i.test(name) || (/watch/i.test(name) && !/band/i.test(name))) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="100%" height="100%">
      ${defs}
      <g filter="url(#softShadow)">
        <path d="M 146 30 L 254 30 L 244 120 L 156 120 Z" fill="#2d3748"/>
        <path d="M 152 45 L 248 45 M 154 65 L 246 65 M 156 85 L 244 85" stroke="#1a202c" stroke-width="3"/>
        <path d="M 156 280 L 244 280 L 254 370 L 146 370 Z" fill="#2d3748"/>
        <path d="M 154 315 L 246 315 M 152 335 L 248 335 M 150 355 L 250 355" stroke="#1a202c" stroke-width="3"/>
        <rect x="278" y="165" width="14" height="32" rx="4" fill="#94a3b8" stroke="#64748b" stroke-width="1"/>
        <rect x="278" y="215" width="10" height="20" rx="3" fill="#475569"/>
        <rect x="122" y="105" width="156" height="190" rx="46" fill="#1e2430" stroke="#475569" stroke-width="3"/>
        <rect x="130" y="113" width="140" height="174" rx="38" fill="#0a0c10"/>
        <circle cx="200" cy="200" r="48" fill="none" stroke="#1e293b" stroke-width="6"/>
        <circle cx="200" cy="200" r="48" fill="none" stroke="#ef4444" stroke-width="6" stroke-dasharray="240" stroke-dashoffset="60" stroke-linecap="round"/>
        <circle cx="200" cy="200" r="38" fill="none" stroke="#1e293b" stroke-width="6"/>
        <circle cx="200" cy="200" r="38" fill="none" stroke="#22c55e" stroke-width="6" stroke-dasharray="190" stroke-dashoffset="45" stroke-linecap="round"/>
        <circle cx="200" cy="200" r="28" fill="none" stroke="#1e293b" stroke-width="6"/>
        <circle cx="200" cy="200" r="28" fill="none" stroke="#ff5c00" stroke-width="6" stroke-dasharray="140" stroke-dashoffset="30" stroke-linecap="round"/>
        <text x="200" y="160" text-anchor="middle" fill="#ffffff" font-size="22" font-family="-apple-system, sans-serif" font-weight="700">10:09</text>
        <text x="200" y="248" text-anchor="middle" fill="#ff5c00" font-size="12" font-family="-apple-system, sans-serif" font-weight="600">76 BPM</text>
      </g>
    </svg>`;
  }

  // 6. Wearables - Fitness Band
  if (/band/i.test(name) || (/wear/i.test(cat) && /band/i.test(name))) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="100%" height="100%">
      ${defs}
      <g filter="url(#softShadow)">
        <rect x="165" y="30" width="70" height="340" rx="35" fill="#1e2430" stroke="#334155" stroke-width="2"/>
        <rect x="156" y="110" width="88" height="180" rx="44" fill="#090b0e" stroke="#ff5c00" stroke-width="2.5"/>
        <rect x="164" y="125" width="72" height="150" rx="36" fill="#020408"/>
        <text x="200" y="175" text-anchor="middle" fill="#ffffff" font-size="20" font-family="-apple-system, sans-serif" font-weight="700">8,432</text>
        <text x="200" y="195" text-anchor="middle" fill="#94a3b8" font-size="10" font-family="-apple-system, sans-serif">STEPS</text>
        <path d="M 175 225 L 185 225 L 190 215 L 195 235 L 202 210 L 208 230 L 214 225 L 225 225" fill="none" stroke="#ff5c00" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
        <text x="200" y="252" text-anchor="middle" fill="#ff5c00" font-size="11" font-family="-apple-system, sans-serif" font-weight="600">72 bpm</text>
      </g>
    </svg>`;
  }

  // 7. Tablets
  if (/tablet/i.test(name) || /tablet/i.test(cat)) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="100%" height="100%">
      ${defs}
      <g filter="url(#softShadow)">
        <rect x="90" y="55" width="220" height="290" rx="24" fill="#1e2430" stroke="#475569" stroke-width="2"/>
        <rect x="96" y="61" width="208" height="278" rx="18" fill="#0a0c10"/>
        <rect x="102" y="67" width="196" height="266" rx="14" fill="url(#screenGrad1)"/>
        <path d="M 102 67 L 298 67 L 102 220 Z" fill="url(#glassReflection)"/>
        <circle cx="200" cy="74" r="3" fill="#000000"/>
        <rect x="175" y="324" width="50" height="4" rx="2" fill="#ffffff" opacity="0.8"/>
      </g>
    </svg>`;
  }

  // 8. Chargers & Power Accessories
  if (/charger/i.test(name) || /charger/i.test(sub)) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="100%" height="100%">
      ${defs}
      <g filter="url(#softShadow)">
        <rect x="125" y="130" width="150" height="160" rx="32" fill="url(#silverGrad)" stroke="#e2e8f0" stroke-width="2"/>
        <rect x="145" y="150" width="110" height="120" rx="20" fill="#0f172a"/>
        <rect x="170" y="195" width="60" height="20" rx="10" fill="#1e293b" stroke="#ff5c00" stroke-width="2"/>
        <rect x="180" y="202" width="40" height="6" rx="3" fill="#ff5c00"/>
        <text x="200" y="178" text-anchor="middle" fill="#94a3b8" font-size="12" font-family="-apple-system, sans-serif" font-weight="700" letter-spacing="1">20W PD</text>
        <text x="200" y="245" text-anchor="middle" fill="#ff5c00" font-size="10" font-family="-apple-system, sans-serif" font-weight="600">FAST CHARGE</text>
        <rect x="155" y="80" width="18" height="52" rx="6" fill="#64748b"/>
        <rect x="227" y="80" width="18" height="52" rx="6" fill="#64748b"/>
      </g>
    </svg>`;
  }

  // 9. Cables
  if (/cable/i.test(name) || /cable/i.test(sub)) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="100%" height="100%">
      ${defs}
      <g filter="url(#softShadow)">
        <ellipse cx="200" cy="220" rx="100" ry="75" fill="none" stroke="#334155" stroke-width="18" stroke-dasharray="6 3"/>
        <ellipse cx="200" cy="220" rx="76" ry="55" fill="none" stroke="#1e293b" stroke-width="14" stroke-dasharray="6 3"/>
        <g transform="translate(110, 80) rotate(-25)">
          <rect x="0" y="30" width="22" height="50" rx="7" fill="#475569"/>
          <rect x="3" y="10" width="16" height="22" rx="4" fill="#cbd5e1"/>
          <rect x="6" y="0" width="10" height="12" rx="3" fill="#fbbf24"/>
          <rect x="0" y="55" width="22" height="6" fill="#ff5c00"/>
        </g>
        <g transform="translate(260, 90) rotate(25)">
          <rect x="0" y="30" width="22" height="50" rx="7" fill="#475569"/>
          <rect x="3" y="10" width="16" height="22" rx="4" fill="#cbd5e1"/>
          <rect x="6" y="0" width="10" height="12" rx="3" fill="#fbbf24"/>
          <rect x="0" y="55" width="22" height="6" fill="#ff5c00"/>
        </g>
      </g>
    </svg>`;
  }

  // 10. Screen Protectors / Tempered Glass
  if (/glass/i.test(name) || /protector/i.test(name)) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="100%" height="100%">
      ${defs}
      <g filter="url(#softShadow)">
        <rect x="120" y="50" width="160" height="310" rx="32" fill="#0f172a" stroke="#334155" stroke-width="2"/>
        <g transform="translate(-15, -15)">
          <rect x="120" y="50" width="160" height="310" rx="32" fill="#38bdf8" fill-opacity="0.12" stroke="#38bdf8" stroke-width="3"/>
          <path d="M 125 55 L 275 55 L 125 250 Z" fill="#ffffff" fill-opacity="0.25"/>
          <rect x="160" y="180" width="80" height="36" rx="18" fill="#ff5c00" filter="url(#glowLight)"/>
          <text x="200" y="203" text-anchor="middle" fill="#ffffff" font-size="14" font-family="-apple-system, sans-serif" font-weight="800">9H GLASS</text>
          <path d="M 135 75 L 135 65 L 145 65" fill="none" stroke="#38bdf8" stroke-width="2"/>
          <path d="M 265 75 L 265 65 L 255 65" fill="none" stroke="#38bdf8" stroke-width="2"/>
          <path d="M 135 325 L 135 335 L 145 335" fill="none" stroke="#38bdf8" stroke-width="2"/>
          <path d="M 265 325 L 265 335 L 255 335" fill="none" stroke="#38bdf8" stroke-width="2"/>
        </g>
      </g>
    </svg>`;
  }

  // 11. Power Banks
  if (/power bank/i.test(name)) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="100%" height="100%">
      ${defs}
      <g filter="url(#softShadow)">
        <rect x="125" y="70" width="150" height="270" rx="28" fill="#1e2430" stroke="#334155" stroke-width="2"/>
        <path d="M 125 70 L 275 70 L 125 240 Z" fill="url(#glassReflection)"/>
        <rect x="135" y="80" width="130" height="40" rx="10" fill="#0a0d14"/>
        <rect x="145" y="92" width="28" height="14" rx="3" fill="#ff5c00"/>
        <rect x="186" y="94" width="26" height="10" rx="5" fill="#38bdf8"/>
        <rect x="225" y="92" width="28" height="14" rx="3" fill="#ff5c00"/>
        <circle cx="170" cy="150" r="4" fill="#22c55e"/>
        <circle cx="190" cy="150" r="4" fill="#22c55e"/>
        <circle cx="210" cy="150" r="4" fill="#22c55e"/>
        <circle cx="230" cy="150" r="4" fill="#22c55e"/>
        <text x="200" y="270" text-anchor="middle" fill="#ffffff" font-size="22" font-family="-apple-system, sans-serif" font-weight="700">10,000</text>
        <text x="200" y="290" text-anchor="middle" fill="#ff5c00" font-size="11" font-family="-apple-system, sans-serif" font-weight="600" letter-spacing="1">mAh FAST CHARGE</text>
      </g>
    </svg>`;
  }

  // Fallback
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="100%" height="100%">
    ${defs}
    <g filter="url(#softShadow)">
      <rect x="110" y="100" width="180" height="200" rx="32" fill="#1e2430" stroke="#ff5c00" stroke-width="2"/>
      <circle cx="200" cy="200" r="44" fill="url(#orangeAccent)" filter="url(#glowLight)"/>
      <text x="200" y="260" text-anchor="middle" fill="#ffffff" font-size="13" font-family="-apple-system, sans-serif" font-weight="600">${name.slice(0, 16)}</text>
    </g>
  </svg>`;
}
