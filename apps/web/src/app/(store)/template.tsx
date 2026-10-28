import { ViewTransition } from "react";

/** Re-created on every navigation between store pages. The old page animates out and the new one in (see the view-transition rules in globals.css); update="none" keeps filter and sort changes on the same page from animating. */
export default function StoreTemplate({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition enter="page-enter" exit="page-exit" update="none" default="none">
      <div className="animate-page-in">{children}</div>
    </ViewTransition>
  );
}
