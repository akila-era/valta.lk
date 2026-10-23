"use client";

import { createContext, useContext, useState } from "react";

interface Choice {
  variantKey: string;
  setVariantKey: (key: string) => void;
}

const VariantChoiceContext = createContext<Choice | null>(null);

/** Shares the selected variant between the purchase panel and accessory recommendations. */
export function VariantChoice({ initial, children }: { initial: string; children: React.ReactNode }) {
  const [variantKey, setVariantKey] = useState(initial);
  return <VariantChoiceContext.Provider value={{ variantKey, setVariantKey }}>{children}</VariantChoiceContext.Provider>;
}

export function useVariantChoice() {
  return useContext(VariantChoiceContext);
}
