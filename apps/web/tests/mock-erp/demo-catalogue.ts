/**
 * A larger demo catalogue for the mock ERP (MOCK_ERP_DEMO=1), laid out like a big accessories store (ugreen.lk):
 * power banks, chargers, cables, hubs, audio, wireless chargers, screen protectors, wearables, phones and tablets,
 * most with sub-categories. Names and brands are made up for the demo. Some items are on sale, some sold out and
 * some new, so every badge and filter has something to show. Local demos only; the tests use the small catalogue.
 */
export interface DemoSpec {
  name: string;
  category: string;
  subCategory?: string;
  brand: string;
  price: number;
  sale?: number;
  stock?: number;
  fresh?: boolean;
  warrantyMonths?: number;
  model?: string;
}

const pb = (name: string, sub: string, price: number, extra: Partial<DemoSpec> = {}): DemoSpec => ({ name, category: "Power Banks", subCategory: sub, brand: "Volt", price, warrantyMonths: 18, ...extra });
const ch = (name: string, sub: string, price: number, extra: Partial<DemoSpec> = {}): DemoSpec => ({ name, category: "Charging Adapters", subCategory: sub, brand: "Volt", price, warrantyMonths: 18, ...extra });
const cb = (name: string, sub: string, price: number, extra: Partial<DemoSpec> = {}): DemoSpec => ({ name, category: "Cables", subCategory: sub, brand: "Nexa", price, warrantyMonths: 12, ...extra });

export const DEMO_CATALOGUE: DemoSpec[] = [
  // Power Banks
  pb("Volt 10000mAh 20W Slim Power Bank", "10000mAh Power Banks", 7650, { fresh: true }),
  pb("Volt 10000mAh 22.5W Power Bank with Built-in Cable", "10000mAh Power Banks", 8750),
  pb("Volt 10000mAh 33W Fast Charging Power Bank", "10000mAh Power Banks", 11200, { sale: 9990 }),
  pb("Volt 10000mAh Two-way Fast Charging Power Bank", "10000mAh Power Banks", 8350, { stock: 0 }),
  pb("Volt 20000mAh 45W Power Bank", "20000mAh Power Banks", 13950),
  pb("Volt 20000mAh 65W Laptop Power Bank", "20000mAh Power Banks", 19850, { fresh: true }),
  pb("Volt 20000mAh 22.5W Power Bank", "20000mAh Power Banks", 10950, { sale: 9450 }),
  pb("Volt 5000mAh Magnetic Wireless Power Bank", "Magnetic Power Banks", 8950),
  pb("Volt 10000mAh Magnetic Wireless Power Bank with Stand", "Magnetic Power Banks", 12550, { fresh: true }),
  pb("Volt 10000mAh Qi2 Magnetic Power Bank", "Magnetic Power Banks", 18250, { stock: 0 }),
  pb("Volt 25000mAh 145W Power Bank", "25000mAh+ Power Banks", 28900),
  pb("Volt 48000mAh 300W Power Bank", "25000mAh+ Power Banks", 64900, { sale: 59900 }),

  // Charging Adapters
  ch("Volt 20W USB-C Fast Charger", "20W Chargers", 3900),
  ch("Volt 20W USB-C + USB-A Charger", "20W Chargers", 4450, { fresh: true }),
  ch("Volt 30W GaN Charger", "30W - 45W Chargers", 6950),
  ch("Volt 45W GaN Dual Port Charger", "30W - 45W Chargers", 8950, { sale: 7950 }),
  ch("Volt 65W GaN 3-Port Charger", "65W GaN Chargers", 14200),
  ch("Volt 65W GaN Charger with USB-C Cable", "65W GaN Chargers", 15750, { stock: 0 }),
  ch("Volt 100W GaN 4-Port Charger", "100W+ GaN Chargers", 20950, { fresh: true }),
  ch("Volt 140W GaN Desktop Charger", "100W+ GaN Chargers", 29900),

  // Cables
  cb("Nexa USB-C to USB-C Cable 60W 1m", "USB-C Cables", 1500),
  cb("Nexa USB-C to USB-C Cable 100W 2m", "USB-C Cables", 2950, { fresh: true }),
  cb("Nexa USB-C to USB-C Cable 240W Braided 1m", "USB-C Cables", 3950),
  cb("Nexa USB-C to Lightning Cable 1m", "Lightning Cables", 2950, { sale: 2490 }),
  cb("Nexa USB-A to Lightning Cable 1m", "Lightning Cables", 2450),
  cb("Nexa HDMI 2.1 8K Cable 2m", "HDMI & Display Cables", 4700),
  cb("Nexa DisplayPort 1.4 Cable 2m", "HDMI & Display Cables", 4250, { stock: 0 }),
  cb("Nexa USB-C to HDMI 4K Cable 1.5m", "HDMI & Display Cables", 5450, { fresh: true }),

  // Hubs & Docks
  { name: "Nexa 5-in-1 USB-C Hub", category: "Hubs & Docks", subCategory: "USB-C Hubs", brand: "Nexa", price: 6950, warrantyMonths: 12 },
  { name: "Nexa 7-in-1 USB-C Hub with HDMI", category: "Hubs & Docks", subCategory: "USB-C Hubs", brand: "Nexa", price: 9950, sale: 8950, warrantyMonths: 12 },
  { name: "Nexa 11-in-1 Docking Station", category: "Hubs & Docks", subCategory: "Docking Stations", brand: "Nexa", price: 24950, fresh: true, warrantyMonths: 12 },
  { name: "Nexa 4-Port USB 3.0 Hub", category: "Hubs & Docks", subCategory: "USB-A Hubs", brand: "Nexa", price: 3450, warrantyMonths: 12 },

  // Headphones & Earphones
  { name: "Pulse Wireless Earbuds", category: "Headphones & Earphones", subCategory: "Earbuds", brand: "Pulse", price: 14900, fresh: true, warrantyMonths: 12 },
  { name: "Pulse ANC Earbuds Pro", category: "Headphones & Earphones", subCategory: "Earbuds", brand: "Pulse", price: 18350, sale: 16500, warrantyMonths: 12 },
  { name: "Pulse Open-Ear Sport Earbuds", category: "Headphones & Earphones", subCategory: "Earbuds", brand: "Pulse", price: 11250, warrantyMonths: 12 },
  { name: "Pulse Lite Earbuds", category: "Headphones & Earphones", subCategory: "Earbuds", brand: "Pulse", price: 4990, warrantyMonths: 12 },
  { name: "Pulse Over-Ear Headphones", category: "Headphones & Earphones", subCategory: "Headphones", brand: "Pulse", price: 24900, warrantyMonths: 12 },
  { name: "Pulse ANC Headphones Max", category: "Headphones & Earphones", subCategory: "Headphones", brand: "Pulse", price: 13850, stock: 0, warrantyMonths: 12 },
  { name: "Echo Bluetooth Speaker", category: "Headphones & Earphones", subCategory: "Speakers", brand: "Echo", price: 11900, warrantyMonths: 12 },
  { name: "Echo Mini Speaker", category: "Headphones & Earphones", subCategory: "Speakers", brand: "Echo", price: 5900, sale: 4990, warrantyMonths: 12 },

  // Wireless Chargers
  { name: "Volt 15W Magnetic Wireless Charger", category: "Wireless Chargers", subCategory: "Magnetic Chargers", brand: "Volt", price: 6450, warrantyMonths: 18 },
  { name: "Volt 3-in-1 Wireless Charger Stand", category: "Wireless Chargers", subCategory: "Charging Stations", brand: "Volt", price: 15950, fresh: true, warrantyMonths: 18 },
  { name: "Volt 2-in-1 Foldable Wireless Charger", category: "Wireless Chargers", subCategory: "Charging Stations", brand: "Volt", price: 12450, sale: 10950, warrantyMonths: 18 },

  // Phone Cases & Tempered Glass
  { name: "Glide Tempered Glass for 6.1-inch Phones", category: "Phone Cases & Tempered Glass", subCategory: "Tempered Glass", brand: "Glide", price: 990 },
  { name: "Glide Privacy Tempered Glass", category: "Phone Cases & Tempered Glass", subCategory: "Tempered Glass", brand: "Glide", price: 2850, fresh: true },
  { name: "Glide Camera Lens Protector", category: "Phone Cases & Tempered Glass", subCategory: "Tempered Glass", brand: "Glide", price: 1490 },
  { name: "Glide Clear Magnetic Case", category: "Phone Cases & Tempered Glass", subCategory: "Phone Cases", brand: "Glide", price: 3900, sale: 3490 },

  // Smartwatches & Bands
  { name: "Atlas Smartwatch", category: "Smartwatches", subCategory: "Smartwatches", brand: "Atlas", price: 34900, fresh: true, warrantyMonths: 12 },
  { name: "Atlas Smartwatch Lite", category: "Smartwatches", subCategory: "Smartwatches", brand: "Atlas", price: 19900, warrantyMonths: 12 },
  { name: "Atlas Fitness Band", category: "Smartwatches", subCategory: "Fitness Bands", brand: "Atlas", price: 8900, warrantyMonths: 12 },
  { name: "Atlas Fitness Band 2", category: "Smartwatches", subCategory: "Fitness Bands", brand: "Atlas", price: 11900, sale: 9900, warrantyMonths: 12 },

  // Mobile Phones & Tablets
  { name: "Nova X1 Smartphone", category: "Mobile Phones", brand: "Nova", price: 129900, model: "X1", warrantyMonths: 12 },
  { name: "Orbit Pro Smartphone", category: "Mobile Phones", brand: "Orbit", price: 219900, sale: 199900, warrantyMonths: 12 },
  { name: "Nova Lite Smartphone", category: "Mobile Phones", brand: "Nova", price: 64900, fresh: true, warrantyMonths: 12 },
  { name: "Orbit Tablet 10", category: "Tablets", brand: "Orbit", price: 89900, warrantyMonths: 12 },
  { name: "Orbit Tablet 12 Pro", category: "Tablets", brand: "Orbit", price: 149900, stock: 0, warrantyMonths: 12 },
];
