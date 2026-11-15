import type { ProfileId } from "./categories";

/**
 * Specification profiles from docs/VOLTA_PRODUCT_SPECIFICATION_SCHEMA.md (section 4): which fields a kind of product must carry, how a staff row for that
 * field is recognised, and the validation ranges. "rank" fields are the numbers the Agent can rank on today (`reasoning/facts.ts`), so a category with
 * none of them cannot honestly be recommended by specification.
 */
export type FieldKey =
  | "ram" | "storage" | "display" | "processor" | "camera" | "battery" | "connectivity" | "os" | "gpu"
  | "compatibility" | "connector" | "power_output" | "standards" | "capacity" | "length" | "audio_type" | "wireless" | "fits_models";

export interface FieldSpec {
  key: FieldKey;
  /** The canonical row name the schema asks for. */
  label: string;
  /** Recognises a staff row for this field by its name. */
  nameRe: RegExp;
  /** The Agent's own reader for this field, if it has one: a value that does not match is shown to shoppers as "no details". */
  agentRe?: RegExp;
  range?: { min: number; max: number; unit: string; take: RegExp };
}

export const FIELDS: Record<FieldKey, FieldSpec> = {
  ram: { key: "ram", label: "RAM", nameRe: /^(ram|memory)$|\bram\b/i, agentRe: /\d{1,3}\s*gb/i, range: { min: 1, max: 128, unit: "GB", take: /(\d{1,3})\s*gb/i } },
  storage: { key: "storage", label: "Storage", nameRe: /storage|\brom\b|internal memory/i, agentRe: /\d{2,4}\s*(gb|tb)/i },
  display: { key: "display", label: "Display", nameRe: /display|screen/i },
  processor: { key: "processor", label: "Processor", nameRe: /processor|chipset|\bcpu\b|\bsoc\b/i },
  camera: { key: "camera", label: "Camera", nameRe: /camera/i, agentRe: /\d{1,3}(\.\d)?\s*mp/i, range: { min: 1, max: 300, unit: "MP", take: /(\d{1,3}(?:\.\d)?)\s*mp/i } },
  battery: { key: "battery", label: "Battery", nameRe: /battery/i, agentRe: /\d{3,5}\s*mah/i, range: { min: 500, max: 10_000, unit: "mAh", take: /(\d{3,5})\s*mah/i } },
  connectivity: { key: "connectivity", label: "Connectivity", nameRe: /connectivity|network|\bsim\b|bluetooth|wi-?fi/i },
  os: { key: "os", label: "Operating system", nameRe: /operating system|^os$/i },
  gpu: { key: "gpu", label: "Graphics", nameRe: /graphics|\bgpu\b/i },
  compatibility: { key: "compatibility", label: "Compatibility", nameRe: /compatib/i },
  connector: { key: "connector", label: "Connector type", nameRe: /connector|port type/i },
  power_output: { key: "power_output", label: "Power output", nameRe: /power output|output power|wattage|^watts?$/i },
  standards: { key: "standards", label: "Supported standards", nameRe: /standard|fast charging|power delivery/i },
  capacity: { key: "capacity", label: "Capacity", nameRe: /capacity/i },
  length: { key: "length", label: "Length", nameRe: /^length$|cable length/i },
  audio_type: { key: "audio_type", label: "Audio type", nameRe: /audio type|^type$/i },
  wireless: { key: "wireless", label: "Wireless", nameRe: /wireless|bluetooth/i },
  fits_models: { key: "fits_models", label: "Fits models", nameRe: /fits|fit models|suitable for|compatible models/i },
};

export interface Profile {
  id: ProfileId;
  required: FieldKey[];
  /** Fields the Agent can rank by (a subset of what the profile needs). */
  rank: FieldKey[];
}

export const PROFILES: Record<ProfileId, Profile> = {
  phone: { id: "phone", required: ["ram", "storage", "display", "processor", "camera", "battery", "connectivity", "os"], rank: ["camera", "battery", "ram"] },
  tablet: { id: "tablet", required: ["ram", "storage", "display", "processor", "battery", "os", "connectivity"], rank: ["battery", "ram"] },
  laptop: { id: "laptop", required: ["processor", "ram", "storage", "gpu", "display", "battery", "os"], rank: ["processor", "ram", "storage"] },
  watch: { id: "watch", required: ["display", "battery", "connectivity", "compatibility"], rank: ["battery"] },
  charger: { id: "charger", required: ["compatibility", "connector", "power_output", "standards"], rank: [] },
  "power-bank": { id: "power-bank", required: ["connector", "power_output", "capacity", "standards"], rank: [] },
  cable: { id: "cable", required: ["compatibility", "connector", "standards", "length"], rank: [] },
  audio: { id: "audio", required: ["compatibility", "audio_type", "wireless"], rank: [] },
  "computer-accessory": { id: "computer-accessory", required: ["compatibility", "connector"], rank: [] },
  "phone-accessory": { id: "phone-accessory", required: ["compatibility", "fits_models"], rank: [] },
};

/** Values that are present but say nothing. */
export const EMPTY_VALUE = /^(n\/?a|none|null|nil|unknown|tbd|tba|-+|\?+|\.+|test|asdf\w*)$/i;

/** The Agent's description fallback (reasoning/facts.ts): camera, battery and memory numbers may be read from description text. */
export const DESCRIPTION_READERS: Partial<Record<FieldKey, RegExp>> = {
  camera: /(\d{1,3}(?:\.\d)?)\s*mp\b/i,
  battery: /(\d{3,5})\s*mah/i,
  ram: /(\d{1,3})\s*gb\s*ram|ram\s*[:-]?\s*(\d{1,3})\s*gb/i,
};
