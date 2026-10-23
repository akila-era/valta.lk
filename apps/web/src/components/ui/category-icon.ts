import { Cable, Gamepad2, Headphones, House, Laptop, Package, Smartphone, Speaker, Tablet, Watch } from "lucide-react";
import type { ComponentType } from "react";

export type IconComponent = ComponentType<{ className?: string; strokeWidth?: number; "aria-hidden"?: boolean }>;

/** Picks a lucide icon from a category name (keyword match); falls back to a generic package icon. */
export function categoryIcon(name: string): IconComponent {
  const n = name.toLowerCase();
  if (/phone|mobile/.test(n)) return Smartphone;
  if (/watch|wear/.test(n)) return Watch; // before the audio test: "wearables" contains "ear"
  if (/audio|head|ear|sound/.test(n)) return Headphones;
  if (/speaker/.test(n)) return Speaker;
  if (/tablet/.test(n)) return Tablet;
  if (/computer|laptop|pc/.test(n)) return Laptop;
  if (/gam/.test(n)) return Gamepad2;
  if (/home/.test(n)) return House;
  if (/access|cable|charg/.test(n)) return Cable;
  return Package;
}
