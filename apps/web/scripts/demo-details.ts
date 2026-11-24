/**
 * Product details for the demo catalogue (made-up products): a short description, the key points, a description and
 * grouped specifications, worked out from each product's name and category. Used by scripts/seed-demo.ts, which saves
 * them as published website content, the same as staff would in Admin > Products.
 */
import type { DemoSpec } from "../tests/mock-erp/demo-catalogue";

type Feature = { title: string; description: string; icon: string };
type Spec = { group: string; name: string; value: string; unit: string };
export interface DemoDetails {
  shortDescription: string;
  descriptionHtml: string;
  features: Feature[];
  specs: Spec[];
}

const num = (re: RegExp, s: string) => {
  const m = s.match(re);
  return m ? Number(m[1]) : null;
};
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const f = (title: string, description: string, icon = "check"): Feature => ({ title, description, icon });
const s = (group: string, name: string, value: string | number, unit = ""): Spec => ({ group, name, value: String(value), unit });

function html(intro: string, points: string[], box: string[]) {
  return [
    `<p>${esc(intro)}</p>`,
    `<h3>Why you will like it</h3>`,
    `<ul>${points.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>`,
    `<h3>In the box</h3>`,
    `<ul>${box.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>`,
  ].join("");
}

function powerBank(d: DemoSpec): DemoDetails {
  const mah = num(/(\d+)mAh/i, d.name) ?? 10000;
  const w = num(/(\d+(?:\.\d+)?)W/i, d.name) ?? (/magnetic|qi2/i.test(d.name) ? 15 : 20);
  const magnetic = /magnetic|qi2/i.test(d.name);
  const charges = Math.max(1, Math.round((mah * 0.62) / 3500));
  const laptop = w >= 45;
  const weight = Math.round(mah / 55 + 40);
  return {
    shortDescription: `${mah.toLocaleString("en-US")}mAh of power with ${w}W fast charging${magnetic ? " that snaps onto the back of your phone" : ""}. About ${charges} full phone charges${laptop ? ", and enough output for a laptop" : ""}.`,
    descriptionHtml: html(
      `The ${d.name} keeps your phone${laptop ? ", tablet and laptop" : ""} going all day. ${magnetic ? "It attaches magnetically and charges without a cable, so you can keep using your phone while it charges." : "It charges your phone at full speed and refills itself quickly too."}`,
      [
        `${w}W output charges a phone to about 50% in 30 minutes`,
        `${mah.toLocaleString("en-US")}mAh is about ${charges} full charges for a typical phone`,
        laptop ? "Powerful enough for USB-C laptops and tablets" : "Slim enough to carry in a pocket or small bag",
        "Protection against over-charging, overheating and short circuits",
      ],
      ["Power bank", "USB-C to USB-C cable", "User guide"],
    ),
    features: [
      f(`${w}W fast charging`, `Up to ${w}W from the USB-C port.`, "zap"),
      f(`${mah.toLocaleString("en-US")}mAh capacity`, `About ${charges} full phone charges.`, "battery"),
      magnetic ? f("Magnetic and wireless", "Snaps onto MagSafe-ready phones and cases.", "smartphone") : f("Charges two devices", "USB-C and USB-A ports at the same time.", "check"),
      f("Safe charging", "Multi-layer protection for you and your phone.", "shield"),
    ],
    specs: [
      s("Battery", "Capacity", mah.toLocaleString("en-US"), "mAh"),
      s("Battery", "Cell type", "Lithium polymer"),
      s("Output", "Maximum output", w, "W"),
      s("Output", "Ports", magnetic ? "1 x USB-C, wireless pad" : "1 x USB-C, 1 x USB-A"),
      s("Input", "Recharge", laptop ? "USB-C 65W" : "USB-C 20W"),
      s("Size", "Weight", weight, "g"),
      ...(magnetic ? [s("Output", "Wireless", "15W magnetic")] : []),
    ],
  };
}

function charger(d: DemoSpec): DemoDetails {
  const w = num(/(\d+)W/i, d.name) ?? 20;
  const gan = /gan/i.test(d.name);
  const ports = num(/(\d)-Port/i, d.name) ?? (/dual|\+/i.test(d.name) ? 2 : 1);
  const withCable = /cable/i.test(d.name);
  return {
    shortDescription: `${w}W ${gan ? "GaN " : ""}wall charger with ${ports} port${ports > 1 ? "s" : ""}. Fast charging for phones${w >= 45 ? ", tablets and laptops" : ""}.`,
    descriptionHtml: html(
      `The ${d.name} charges your devices at full speed${gan ? " and stays small and cool thanks to GaN (gallium nitride) parts" : ""}. It works with Sri Lankan 3-pin sockets using the included adapter.`,
      [
        `Up to ${w}W from one port, shared between ports when more than one device is plugged in`,
        "Supports USB Power Delivery (PD) and Quick Charge",
        w >= 65 ? "Charges USB-C laptops such as MacBook Air and most Windows ultrabooks" : "Charges most phones to about 50% in 30 minutes",
        "Protection against over-voltage, overheating and short circuits",
      ],
      ["Charger", ...(withCable ? ["USB-C to USB-C cable (1.5m)"] : []), "User guide"],
    ),
    features: [
      f(`${w}W fast charging`, "USB Power Delivery and Quick Charge.", "zap"),
      f(`${ports} port${ports > 1 ? "s" : ""}`, ports > 1 ? "Charge several devices at the same time." : "One USB-C port for your phone or tablet.", "check"),
      ...(gan ? [f("GaN technology", "Smaller and cooler than an ordinary charger.", "cpu")] : []),
      f("Safe charging", "Built-in protection for you and your devices.", "shield"),
    ],
    specs: [
      s("Output", "Maximum output", w, "W"),
      s("Output", "Ports", ports === 1 ? "1 x USB-C" : `${ports - 1} x USB-C, 1 x USB-A`),
      s("Output", "Protocols", "USB PD 3.0, QC 4+, PPS"),
      s("Input", "Input voltage", "100-240V ~ 50/60Hz"),
      s("General", "Technology", gan ? "GaN" : "Silicon"),
      s("General", "Plug", "Type G (3-pin) adapter included"),
    ],
  };
}

function cable(d: DemoSpec): DemoDetails {
  const len = num(/(\d+(?:\.\d+)?)m\b/i, d.name) ?? 1;
  const w = num(/(\d+)W/i, d.name);
  const video = /hdmi|displayport/i.test(d.name);
  const res = /8K/.test(d.name) ? "8K at 60Hz / 4K at 120Hz" : /4K/.test(d.name) ? "4K at 60Hz" : /DisplayPort/.test(d.name) ? "8K at 30Hz / 4K at 144Hz" : "";
  const braided = /braided/i.test(d.name) || video;
  return {
    shortDescription: video
      ? `${len}m ${braided ? "braided " : ""}display cable for ${res}. Connect a laptop, console or PC to a TV or monitor.`
      : `${len}m charging and data cable${w ? ` rated for ${w}W` : ""}. Strong connectors and a cable that bends thousands of times.`,
    descriptionHtml: html(
      video
        ? `The ${d.name} sends sharp picture and sound from your laptop, console or PC to a TV or monitor, with gold-plated connectors for a steady signal.`
        : `The ${d.name} charges fast and moves files quickly. The connectors are reinforced where cables usually break.`,
      video
        ? [`Supports ${res}`, "HDR and audio pass-through", "Gold-plated connectors resist corrosion", "Plug and play: no drivers needed"]
        : [w ? `Up to ${w}W fast charging` : "Fast charging for phones and tablets", "Data transfer for photos and files", "Tested to bend 10,000+ times", "Works with phones, tablets and laptops"],
      ["Cable", "Cable tie"],
    ),
    features: video
      ? [f(res.split(" / ")[0], "Sharp picture on TVs and monitors.", "check"), f("HDR and audio", "Picture and sound in one cable.", "check"), f(`${len}m length`, "Room to reach the TV.", "check")]
      : [f(w ? `${w}W charging` : "Fast charging", "Charges phones and tablets at full speed.", "zap"), f("Strong build", "Tested to bend 10,000+ times.", "shield"), f(`${len}m length`, "Comfortable to use while charging.", "check")],
    specs: [
      s("General", "Length", len, "m"),
      s("General", "Connectors", d.name.replace(/^Nexa\s+/, "").replace(/\s+Cable.*$/, "")),
      ...(w ? [s("Charging", "Maximum power", w, "W")] : []),
      ...(video ? [s("Video", "Resolution", res)] : [s("Data", "Transfer speed", /USB-C to USB-C/.test(d.name) ? "480 Mbps" : "480 Mbps")]),
      s("General", "Jacket", braided ? "Nylon braided" : "TPE"),
    ],
  };
}

function hub(d: DemoSpec): DemoDetails {
  const ports = num(/(\d+)-in-1/i, d.name) ?? num(/(\d+)-Port/i, d.name) ?? 4;
  const dock = /dock/i.test(d.name);
  const usbA = /usb 3\.0/i.test(d.name);
  return {
    shortDescription: `${ports} ports from one ${usbA ? "USB-A" : "USB-C"} plug${usbA ? "" : ": HDMI, USB, card reader and charging"}. More ports, less clutter on your desk.`,
    descriptionHtml: html(
      `The ${d.name} adds the ports your laptop is missing. ${dock ? "Connect two screens, wired internet, keyboard, mouse and drives with one cable." : "Plug it in and everything works, no drivers needed."}`,
      [
        usbA ? "Four USB 3.0 ports at up to 5Gbps" : "HDMI output up to 4K at 30Hz",
        usbA ? "Compact aluminium body" : "100W USB-C pass-through charging keeps your laptop charged",
        "Works with Windows, macOS, ChromeOS and iPad",
        "Aluminium body helps it stay cool",
      ],
      [d.name.replace(/^Nexa\s+/, ""), "User guide"],
    ),
    features: [
      f(`${ports} ports`, "Everything you need from one plug.", "cpu"),
      ...(usbA ? [] : [f("4K HDMI", "Mirror or extend your screen.", "check"), f("100W pass-through", "Charge your laptop while you work.", "zap")]),
      f("Plug and play", "No drivers to install.", "check"),
    ],
    specs: [
      s("Ports", "Total ports", ports),
      s("Ports", "Host connection", usbA ? "USB-A 3.0" : "USB-C"),
      ...(usbA ? [s("Ports", "USB-A", "4 x USB 3.0 (5Gbps)")] : [s("Video", "HDMI", dock ? "2 x HDMI, 4K at 60Hz" : "1 x HDMI, 4K at 30Hz"), s("Power", "Pass-through", 100, "W")]),
      s("General", "Body", "Aluminium"),
    ],
  };
}

function audio(d: DemoSpec): DemoDetails {
  const speaker = /speaker/i.test(d.name);
  const anc = /anc/i.test(d.name);
  const over = /headphones/i.test(d.name);
  const hours = speaker ? (/mini/i.test(d.name) ? 12 : 20) : over ? 40 : anc ? 30 : 24;
  return {
    shortDescription: speaker
      ? `Portable Bluetooth speaker with rich sound, ${hours} hours of play and a water-resistant body.`
      : `${over ? "Over-ear headphones" : "Wireless earbuds"}${anc ? " with active noise cancelling" : ""} and up to ${hours} hours of listening${over ? "" : " with the case"}.`,
    descriptionHtml: html(
      speaker
        ? `The ${d.name} fills the room with clear sound and deep bass. Take it to the beach or the garden: it shrugs off splashes and rain.`
        : `The ${d.name} gives clear sound for music, calls and videos${anc ? ", and active noise cancelling quietens buses, trains and busy offices" : ""}.`,
      speaker
        ? [`${hours} hours of play on one charge`, "IPX7: water-resistant", "Pair two speakers for stereo", "USB-C charging"]
        : [`Up to ${hours} hours of listening`, anc ? "Active noise cancelling up to 40dB" : "Clear calls with two microphones", "Bluetooth 5.3 for a steady connection", "USB-C fast charging: 10 minutes for 2 hours"],
      speaker ? ["Speaker", "USB-C cable", "User guide"] : over ? ["Headphones", "Carry pouch", "USB-C cable", "3.5mm audio cable"] : ["Earbuds", "Charging case", "Ear tips (S, M, L)", "USB-C cable"],
    ),
    features: [
      f(`${hours}h battery`, speaker ? "Plays all day on one charge." : "Long listening on one charge.", "battery"),
      anc ? f("Noise cancelling", "Blocks out traffic and chatter.", "headphones") : f("Clear sound", "Balanced sound with deep bass.", "headphones"),
      f("Bluetooth 5.3", "Fast pairing and a steady signal.", "wifi"),
      ...(speaker ? [f("IPX7 water-resistant", "Safe by the pool or in the rain.", "shield")] : []),
    ],
    specs: [
      s("Audio", "Driver", speaker ? "45mm full-range" : over ? "40mm dynamic" : "10mm dynamic"),
      s("Connection", "Bluetooth", "5.3"),
      s("Connection", "Range", 10, "m"),
      s("Battery", "Play time", hours, "hours"),
      s("Battery", "Charging port", "USB-C"),
      ...(anc ? [s("Audio", "Noise cancelling", "Active (ANC)")] : []),
      ...(speaker ? [s("General", "Water resistance", "IPX7")] : []),
    ],
  };
}

function wireless(d: DemoSpec): DemoDetails {
  const multi = num(/(\d)-in-1/i, d.name) ?? 1;
  return {
    shortDescription: `${multi > 1 ? `Charges ${multi} devices at once: phone, earbuds${multi > 2 ? " and watch" : ""}.` : "Snaps onto your phone and charges at 15W."} No cables to plug in each night.`,
    descriptionHtml: html(
      `The ${d.name} keeps your desk or bedside tidy. Put your phone down and it starts charging.`,
      ["Up to 15W for phones", multi > 1 ? `Charges ${multi} devices at the same time` : "Strong magnets keep the phone in place", "Works through most cases up to 5mm", "Foreign-object detection stops charging if a coin or key is on the pad"],
      ["Wireless charger", "USB-C cable", "User guide"],
    ),
    features: [f("15W wireless", "Fast wireless charging for phones.", "zap"), f(multi > 1 ? `${multi}-in-1` : "Magnetic", multi > 1 ? "Phone, earbuds and more in one place." : "Lines up perfectly every time.", "smartphone"), f("Safe charging", "Temperature control and object detection.", "shield")],
    specs: [s("Output", "Phone", 15, "W"), ...(multi > 1 ? [s("Output", "Earbuds", 5, "W")] : []), ...(multi > 2 ? [s("Output", "Watch", 2.5, "W")] : []), s("Input", "Power input", "USB-C, 20W adapter or higher"), s("General", "Works through cases", "Up to 5mm")],
  };
}

function glass(d: DemoSpec): DemoDetails {
  const caseItem = /case/i.test(d.name);
  const privacy = /privacy/i.test(d.name);
  const lens = /lens/i.test(d.name);
  return {
    shortDescription: caseItem ? "Clear, slim case with strong magnets and raised edges to protect the screen and camera." : `${privacy ? "Privacy" : lens ? "Camera lens" : "9H"} tempered glass that protects ${lens ? "your camera lenses" : "your screen"} from scratches and drops.`,
    descriptionHtml: html(
      caseItem ? `The ${d.name} keeps your phone looking new without hiding its colour. It works with magnetic chargers and wallets.` : `The ${d.name} takes the knocks so your ${lens ? "camera" : "screen"} does not. ${privacy ? "People beside you see a dark screen; you see everything." : "It stays clear and smooth to touch."}`,
      caseItem ? ["Shock-absorbing corners", "Stays clear: does not turn yellow", "Built-in magnets", "Raised edges around the screen and camera"] : ["9H hardness resists scratches from keys and coins", privacy ? "28-degree privacy angle" : "Over 99% clarity", "Oil-resistant coating", "Easy, bubble-free fitting with the guide frame"],
      caseItem ? ["Case"] : ["Tempered glass", "Fitting frame", "Cleaning wipes", "Dust-removal stickers"],
    ),
    features: caseItem ? [f("Drop protection", "Shock-absorbing corners.", "shield"), f("Magnetic", "Works with magnetic chargers.", "smartphone")] : [f("9H hardness", "Resists everyday scratches.", "shield"), f(privacy ? "Privacy filter" : "Crystal clear", privacy ? "Keeps your screen private." : "Over 99% clarity.", "check"), f("Easy fitting", "Guide frame for a perfect fit.", "check")],
    specs: caseItem ? [s("General", "Material", "TPU and polycarbonate"), s("General", "Magnets", "Built-in"), s("General", "Thickness", 1.5, "mm")] : [s("General", "Hardness", "9H"), s("General", "Thickness", lens ? 0.25 : 0.33, "mm"), s("General", "Coating", "Oil-resistant"), ...(privacy ? [s("General", "Privacy angle", 28, "degrees")] : [])],
  };
}

function watch(d: DemoSpec): DemoDetails {
  const band = /band/i.test(d.name);
  const days = band ? 14 : /lite/i.test(d.name) ? 10 : 7;
  return {
    shortDescription: `${band ? "Fitness band" : "Smartwatch"} with heart-rate, sleep and step tracking, and up to ${days} days of battery.`,
    descriptionHtml: html(
      `The ${d.name} tracks your day and your sleep, and shows calls and messages on your wrist${band ? "" : ", with a bright AMOLED screen you can read in the sun"}.`,
      [`Up to ${days} days on one charge`, "Heart rate, blood oxygen and sleep tracking", "100+ sports modes", "5ATM water resistance: wear it in the pool"],
      [band ? "Fitness band" : "Smartwatch", "Magnetic charging cable", "User guide"],
    ),
    features: [f(`${days}-day battery`, "Charge once a week or less.", "battery"), f("Health tracking", "Heart rate, SpO2 and sleep.", "check"), f("5ATM", "Safe for swimming.", "shield")],
    specs: [s("Display", "Screen", band ? '1.47" AMOLED' : '1.43" AMOLED'), s("Battery", "Battery life", days, "days"), s("Connection", "Bluetooth", "5.3"), s("General", "Water resistance", "5ATM"), s("General", "Works with", "Android 8+, iOS 13+")],
  };
}

function phone(d: DemoSpec): DemoDetails {
  const tablet = d.category === "Tablets";
  const pro = /pro/i.test(d.name);
  const lite = /lite/i.test(d.name);
  const screen = tablet ? (/12/.test(d.name) ? '12.1"' : '10.4"') : pro ? '6.7"' : '6.5"';
  const ram = pro ? 12 : lite ? 6 : 8;
  const storage = pro ? 256 : 128;
  const battery = tablet ? (/12/.test(d.name) ? 10090 : 7040) : 5000;
  const cam = tablet ? 13 : pro ? 200 : lite ? 50 : 108;
  return {
    shortDescription: `${screen} ${tablet ? "tablet" : "smartphone"} with ${ram}GB RAM, ${storage}GB storage and a ${battery.toLocaleString("en-US")}mAh battery.`,
    descriptionHtml: html(
      `The ${d.name} is quick for everyday apps, photos and games, with a bright ${screen} screen and a battery that lasts ${tablet ? "through long work and study sessions" : "all day"}.`,
      [`${screen} ${pro ? "AMOLED, 120Hz" : "display, 90Hz"}`, `${cam}MP main camera`, `${ram}GB RAM and ${storage}GB storage`, `${battery.toLocaleString("en-US")}mAh battery with fast charging`],
      [tablet ? "Tablet" : "Phone", "USB-C cable", ...(tablet ? [] : ["Clear case", "SIM tool"]), "Quick start guide"],
    ),
    features: [f(`${screen} display`, pro ? "AMOLED, 120Hz." : "Smooth 90Hz screen.", "smartphone"), f(`${cam}MP camera`, "Sharp photos day and night.", "camera"), f(`${battery.toLocaleString("en-US")}mAh`, "Lasts all day.", "battery"), f(`${ram}GB RAM`, "Smooth when switching apps.", "cpu")],
    specs: [
      s("Display", "Size", screen),
      s("Display", "Refresh rate", pro ? 120 : 90, "Hz"),
      s("Performance", "RAM", ram, "GB"),
      s("Performance", "Storage", storage, "GB"),
      s("Camera", "Main camera", cam, "MP"),
      s("Battery", "Capacity", battery.toLocaleString("en-US"), "mAh"),
      s("Battery", "Fast charging", pro ? 67 : 33, "W"),
      s("Connection", "Network", tablet ? "Wi-Fi 6" : "4G / 5G dual SIM"),
    ],
  };
}

export function demoDetails(d: DemoSpec): DemoDetails {
  switch (d.category) {
    case "Power Banks":
      return powerBank(d);
    case "Charging Adapters":
      return charger(d);
    case "Cables":
      return cable(d);
    case "Hubs & Docks":
      return hub(d);
    case "Headphones & Earphones":
      return audio(d);
    case "Wireless Chargers":
      return wireless(d);
    case "Phone Cases & Tempered Glass":
      return glass(d);
    case "Smartwatches":
      return watch(d);
    default:
      return phone(d);
  }
}
