import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { NotAvailable, PageHeader } from "@/components/admin/ui";
import { adminGate } from "@/lib/admin/gate";
import { PAYMENT_PAGES } from "@/lib/admin/unavailable";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ kind: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = PAYMENT_PAGES[(await params).kind];
  return { title: p?.title ?? "Payments" };
}

export default async function Page({ params }: Props) {
  const { kind } = await params;
  const page = PAYMENT_PAGES[kind];
  if (!page) notFound();
  const denied = await adminGate(`/admin/payments/${kind}`);
  if (denied) return denied;
  return (
    <>
      <PageHeader title={page.title} />
      <NotAvailable title="Not available yet" why={page.why} needs={page.needs}>
        {page.link && <Link href={page.link.href} className="btn-primary mt-5">{page.link.label}</Link>}
      </NotAvailable>
    </>
  );
}
