"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut } from "lucide-react";

export function SignOutButton({ className = "btn-secondary w-full", onDone, admin = false }: { className?: string; onDone?: () => void; /** Sign out of the admin only (the shop sign-in stays). */ admin?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      className={className}
      onClick={async () => {
        setBusy(true);
        await fetch(admin ? "/api/admin/logout" : "/api/account/logout", { method: "POST" }).catch(() => undefined);
        onDone?.();
        router.replace(admin ? "/admin/login" : "/");
        router.refresh();
      }}
    >
      <LogOut className="h-4 w-4" aria-hidden /> Sign out
    </button>
  );
}
