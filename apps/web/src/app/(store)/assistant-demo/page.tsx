import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AssistantDemoShell } from "@/components/assistant/demo-shell";

export const metadata: Metadata = { title: "Assistant demo (local, mock data)", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Local demo of the assistant's cards over built-in demo data. Off unless ASSISTANT_DEMO_ENABLED=true, so a normal build
 * answers 404. It has no server logic and no connection to the Agent, the ERP or the real cart.
 */
export default function AssistantDemoPage() {
  if (process.env.ASSISTANT_DEMO_ENABLED !== "true") notFound();
  return (
    <>
      <h1 className="page-title mb-6">Assistant demo</h1>
      <AssistantDemoShell />
    </>
  );
}
