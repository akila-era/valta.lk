"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";

/** Remove one newsletter subscriber after a confirmation, then refresh the list. */
export function SubscriberRemove({ id, email }: { id: string; email: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      aria-label={`Remove ${email}`}
      className="btn-ghost h-9 min-h-0 w-9 px-0 text-danger"
      onClick={async () => {
        if (!window.confirm(`Remove ${email} from the newsletter list?`)) return;
        setBusy(true);
        const res = await fetch("/api/admin/newsletter", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }).catch(() => null);
        setBusy(false);
        if (res?.ok) router.refresh();
        else window.alert("The subscriber could not be removed. Please try again.");
      }}
    >
      <Trash2 className="h-4 w-4" aria-hidden />
    </button>
  );
}
