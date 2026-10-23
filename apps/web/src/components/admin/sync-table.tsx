import Link from "next/link";
import type { WebOrder } from "@/generated/prisma/client";
import { formatLkr } from "@/lib/utils/money";
import { RetryButton } from "./retry-button";
import { SyncBadge } from "./badges";
import { Empty, Table } from "./ui";

const when = (d: Date | null) => (d ? d.toLocaleString("en-LK", { dateStyle: "medium", timeStyle: "short" }) : "-");

/** Orders that have not reached the ERP, with the reason and a safe retry (the ERP never creates a duplicate). */
export function SyncTable({ rows, empty }: { rows: WebOrder[]; empty: string }) {
  if (!rows.length) return <Empty>{empty}</Empty>;
  return (
    <Table label="Orders not yet in the ERP" min="56rem" head={["Order", "Placed", { label: "Total", right: true }, "Sync", { label: "Attempts", right: true }, "Next attempt", "Last error", "Action"]}>
      {rows.map((r) => (
        <tr key={r.externalRef} data-testid="sync-row">
          <td className="px-4 py-3 font-mono"><Link href={`/admin/orders/${r.externalRef}`} className="font-semibold text-brand-600 hover:underline">{r.externalRef}</Link></td>
          <td className="whitespace-nowrap px-4 py-3">{when(r.createdAt)}</td>
          <td className="whitespace-nowrap px-4 py-3 text-right font-semibold">{formatLkr(Number(r.total))}</td>
          <td className="px-4 py-3"><SyncBadge status={r.syncStatus} /></td>
          <td className="px-4 py-3 text-right">{r.syncAttempts}</td>
          <td className="whitespace-nowrap px-4 py-3">{r.syncStatus === "PENDING" ? when(r.nextAttemptAt) : "Manual retry only"}</td>
          <td className="max-w-[18rem] px-4 py-3 text-xs text-muted">{r.lastError ?? "-"}</td>
          <td className="px-4 py-3"><RetryButton orderRef={r.externalRef} /></td>
        </tr>
      ))}
    </Table>
  );
}
