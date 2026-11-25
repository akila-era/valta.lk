"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

// Loaded after the page, and mounted once in the root layout so the assistant (and the conversation) survives every page change.
const AiAssistant = dynamic(() => import("./ai-modal").then((m) => m.AiAssistant));

/** The assistant is for shoppers: it is not shown in the admin area. */
export function AiRoot() {
  const path = usePathname();
  if (path.startsWith("/admin")) return null;
  return <AiAssistant />;
}
