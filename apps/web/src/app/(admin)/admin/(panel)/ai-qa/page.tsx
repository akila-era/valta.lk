import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { QaCenter } from "@/components/admin/ai-qa/qa-center";
import { PageHeader } from "@/components/admin/ui";
import { adminGate } from "@/lib/admin/gate";
import { qaEnabled } from "@/lib/ai-qa/flags";

export const metadata: Metadata = { title: "AI QA" };
export const dynamic = "force-dynamic";

/** Development only: a production build, or a build without AI_QA_ENABLED=true, answers 404 as if this page did not exist. */
export default async function AiQaPage() {
  if (!qaEnabled()) notFound();
  const denied = await adminGate("/admin/ai-qa");
  if (denied) return denied;
  return (
    <>
      <PageHeader title="VOLTA AI QA control center" subtitle="Development only. Talk to the real assistant, run the checks, and see honestly what works, what is limited, what is mock and what is not connected." />
      <QaCenter />
    </>
  );
}
