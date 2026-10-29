/**
 * Page-change animations (React <ViewTransition>, see the store template) use the browser's
 * document.startViewTransition. When the tab is hidden at that moment (the visitor clicked a link and switched tabs
 * before the new page arrived), the browser aborts the animation with "InvalidStateError: Document hidden" and React
 * reports it as an error. A hidden tab shows nothing anyway, so while it is hidden the call fails at once instead:
 * React treats that as "no animation available" and simply swaps the page. Visible tabs are untouched.
 */
export function installViewTransitionGuard() {
  if (typeof document === "undefined" || typeof document.startViewTransition !== "function") return;
  const doc = document as Document & { __voltaVtGuard?: boolean };
  if (doc.__voltaVtGuard) return;
  doc.__voltaVtGuard = true;
  const original = document.startViewTransition.bind(document);
  document.startViewTransition = ((...args: Parameters<typeof original>) => {
    if (document.visibilityState === "hidden") throw new DOMException("Skipped: the page is not visible.", "InvalidStateError");
    return original(...args);
  }) as typeof document.startViewTransition;
}
