import { cut, looksLikeMash, nameKey } from "./text";
import type { AuditProduct } from "./types";

/**
 * The proposed category tree (docs/VOLTA_CATEGORY_NORMALIZATION_PROPOSAL.md, section 3) and the rules that compare a product's FILED category with the
 * kind of product its own name, model and sub-category describe. Inference is evidence for a human, never a decision: only a filed category that already
 * names a node is "exact", everything else is a candidate, a conflict or unmappable.
 */
export type NodeId = "mobile-phones" | "tablets" | "smart-watches" | "laptops" | "computer-accessories" | "chargers" | "power-banks" | "cables" | "audio-devices" | "phone-accessories" | "uncategorised";

export type ProfileId = "phone" | "tablet" | "watch" | "laptop" | "charger" | "power-bank" | "cable" | "audio" | "computer-accessory" | "phone-accessory";

export interface CategoryNode {
  id: NodeId;
  name: string;
  parent: string;
  profile: ProfileId | null;
  /** An accessory kind (checked for device links). */
  accessory: boolean;
}

export const CATEGORY_TREE: readonly CategoryNode[] = [
  { id: "mobile-phones", name: "Mobile Phones", parent: "Phones and tablets", profile: "phone", accessory: false },
  { id: "tablets", name: "Tablets", parent: "Phones and tablets", profile: "tablet", accessory: false },
  { id: "smart-watches", name: "Smart Watches", parent: "Phones and tablets", profile: "watch", accessory: false },
  { id: "laptops", name: "Laptops", parent: "Computers", profile: "laptop", accessory: false },
  { id: "computer-accessories", name: "Computer Accessories", parent: "Computers", profile: "computer-accessory", accessory: true },
  { id: "chargers", name: "Chargers", parent: "Power and charging", profile: "charger", accessory: true },
  { id: "power-banks", name: "Power Banks", parent: "Power and charging", profile: "power-bank", accessory: true },
  { id: "cables", name: "Cables", parent: "Power and charging", profile: "cable", accessory: true },
  { id: "audio-devices", name: "Audio Devices", parent: "Audio", profile: "audio", accessory: true },
  { id: "phone-accessories", name: "Phone Accessories", parent: "Protection and accessories", profile: "phone-accessory", accessory: true },
  { id: "uncategorised", name: "Uncategorised", parent: "Other", profile: null, accessory: false },
];

export const nodeById = (id: NodeId): CategoryNode => CATEGORY_TREE.find((n) => n.id === id)!;

/** Filed strings that already mean a node ("exact"). Compared after `nameKey`. */
const EXACT_ALIASES: Record<string, NodeId> = {
  "mobile phones": "mobile-phones",
  "mobile phone": "mobile-phones",
  mobiles: "mobile-phones",
  mobile: "mobile-phones",
  phones: "mobile-phones",
  phone: "mobile-phones",
  smartphones: "mobile-phones",
  smartphone: "mobile-phones",
  tablets: "tablets",
  tablet: "tablets",
  "smart watches": "smart-watches",
  "smart watch": "smart-watches",
  smartwatches: "smart-watches",
  smartwatch: "smart-watches",
  laptops: "laptops",
  laptop: "laptops",
  notebooks: "laptops",
  notebook: "laptops",
  "computer accessories": "computer-accessories",
  "pc accessories": "computer-accessories",
  chargers: "chargers",
  charger: "chargers",
  "power banks": "power-banks",
  "power bank": "power-banks",
  powerbanks: "power-banks",
  cables: "cables",
  cable: "cables",
  audio: "audio-devices",
  "audio devices": "audio-devices",
  earbuds: "audio-devices",
  headphones: "audio-devices",
  speakers: "audio-devices",
  "phone accessories": "phone-accessories",
  "mobile accessories": "phone-accessories",
  cases: "phone-accessories",
  covers: "phone-accessories",
  uncategorised: "uncategorised",
  uncategorized: "uncategorised",
};

/** Filed words that only SUGGEST a node (the proposal marks "watch" a candidate: it could be a non-smart watch). */
const WEAK_ALIASES: Record<string, NodeId> = { watch: "smart-watches", watches: "smart-watches", accessories: "computer-accessories", gadgets: "uncategorised" };

interface Rule {
  node: NodeId;
  re: RegExp;
  label: string;
}

/** Order matters: accessory words win over device words ("iphone case" is a phone accessory, not a phone). */
const RULES: readonly Rule[] = [
  { node: "phone-accessories", re: /\b(back ?cover|phone case|case for|tempered|screen (guard|protector)|glass protector|silicone case|flip cover|pouch)\b/, label: "accessory words" },
  { node: "power-banks", re: /\b(power ?bank|powerbank)\b/, label: "power bank" },
  { node: "chargers", re: /\b(charger|adapter|adaptor|wall plug|gan \d+ ?w)\b/, label: "charger" },
  { node: "cables", re: /\b(cable|lightning to|usb c to|type c to|hdmi)\b/, label: "cable" },
  { node: "audio-devices", re: /\b(earbuds?|earphones?|headphones?|headset|airpods?|buds \d?|speaker|soundbar|neckband)\b/, label: "audio words" },
  { node: "computer-accessories", re: /\b(mouse|keyboard|webcam|pen ?drive|flash drive|usb hub|laptop stand|mouse ?pad|external (hdd|ssd))\b/, label: "computer accessory words" },
  { node: "laptops", re: /\b(laptop|notebook|macbook|thinkpad|ideapad|vivobook|zenbook|inspiron|pavilion|latitude|legion|nitro \d|chromebook|ultrabook)\b/, label: "laptop words" },
  { node: "tablets", re: /\b(ipad|tablet|galaxy tab|mediapad|tab [a-z]?\d{1,2})\b/, label: "tablet words" },
  { node: "smart-watches", re: /\b(smart ?watch|watch\d*|fitness band|fit band)\b/, label: "watch word" },
  { node: "mobile-phones", re: /\b(iphone|smartphone|redmi|poco|galaxy (s|a|m|z|note)\d+|pixel \d|oneplus|realme|oppo|vivo \w?\d|nokia \d|infinix|tecno|mobile phone)\b/, label: "phone words" },
];

export interface Inference {
  node: NodeId | null;
  evidence: string[];
}

/** What the product's own name, model and sub-category say it is. The FILED category is deliberately not an input. */
export function inferKind(p: Pick<AuditProduct, "name" | "model" | "subCategory">): Inference {
  const fields: [string, string | undefined][] = [
    ["name", p.name],
    ["model", p.model],
    ["sub-category", p.subCategory],
  ];
  for (const rule of RULES) {
    for (const [field, text] of fields) {
      if (!text) continue;
      const key = nameKey(cut(text, 300));
      const m = rule.re.exec(key);
      if (m) return { node: rule.node, evidence: [`${field} "${m[0]}" (${rule.label})`] };
    }
  }
  return { node: null, evidence: [] };
}

export type CategoryStatus = "exact" | "candidate" | "conflict" | "junk" | "brand_as_category" | "missing" | "none";

export interface Classification {
  status: CategoryStatus;
  filed: string | null;
  filedKey: string;
  /** The node the filed string already names, if any. */
  filedNode: NodeId | null;
  inferred: Inference;
  /** The node a human should confirm, if the evidence points to one. */
  proposedNode: NodeId | null;
  /** The node used to pick a specification profile (the proposal, or the filed node), with how sure we are. */
  profileNode: NodeId | null;
  profileConfidence: "high" | "low" | "none";
  note: string;
}

export function classify(p: AuditProduct, knownBrands: ReadonlySet<string>): Classification {
  const inferred = inferKind(p);
  const filed = p.category ?? null;
  const filedKey = filed ? nameKey(filed) : "";
  const base = { filed, filedKey, inferred };
  if (!filed || !filedKey) {
    return { ...base, status: "missing", filedNode: null, proposedNode: inferred.node, profileNode: inferred.node, profileConfidence: inferred.node ? "low" : "none", note: "no category is filed" };
  }
  const exact = EXACT_ALIASES[filedKey] ?? null;
  if (exact) {
    if (inferred.node === null || inferred.node === exact) {
      return { ...base, status: "exact", filedNode: exact, proposedNode: exact, profileNode: exact, profileConfidence: "high", note: "the filed category names this node" };
    }
    return { ...base, status: "conflict", filedNode: exact, proposedNode: inferred.node, profileNode: inferred.node, profileConfidence: "low", note: `filed as ${nodeById(exact).name} but the product reads as ${nodeById(inferred.node).name}` };
  }
  const single = filedKey.split(" ").length === 1 ? filedKey : "";
  if (single && looksLikeMash(single)) {
    return { ...base, status: "junk", filedNode: null, proposedNode: inferred.node ?? "uncategorised", profileNode: inferred.node, profileConfidence: inferred.node ? "low" : "none", note: "the category text looks typed at random" };
  }
  if (knownBrands.has(filedKey)) {
    return { ...base, status: "brand_as_category", filedNode: null, proposedNode: inferred.node, profileNode: inferred.node, profileConfidence: inferred.node ? "low" : "none", note: "a brand is filed as the category" };
  }
  const weak = WEAK_ALIASES[filedKey] ?? null;
  const proposed = inferred.node ?? weak;
  if (proposed) {
    return { ...base, status: "candidate", filedNode: null, proposedNode: proposed, profileNode: proposed, profileConfidence: "low", note: inferred.node ? "not a controlled category; the product's own words point to a node" : `the word "${filedKey}" only suggests a node` };
  }
  return { ...base, status: "none", filedNode: null, proposedNode: null, profileNode: null, profileConfidence: "none", note: "not a controlled category and nothing in the record says what the product is" };
}
