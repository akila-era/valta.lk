import type { ReactNode } from "react";

const TONE = {
  info: { box: "border-info/30 bg-info-bg text-info", role: "status" },
  success: { box: "border-success/30 bg-success-bg text-success", role: "status" },
  warning: { box: "border-warn/30 bg-warn-bg text-warn", role: "status" },
  danger: { box: "border-danger/30 bg-danger-bg text-danger", role: "alert" },
} as const;

export type NoticeTone = keyof typeof TONE;

export function Notice({ tone = "info", title, children }: { tone?: NoticeTone; title?: string; children?: ReactNode }) {
  const style = TONE[tone];
  return (
    <div role={style.role} className={`rounded-xl border px-4 py-3 text-sm ${style.box}`}>
      {title ? <p className="font-semibold">{title}</p> : null}
      {children ? <div className={title ? "mt-1" : undefined}>{children}</div> : null}
    </div>
  );
}
