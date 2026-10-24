import { ToastProvider } from "@/components/ui/toast";
import { Footer } from "./footer";
import { Header } from "./header";

/**
 * The 3D backdrop behind every contained page: a warm band that fades into the page, a dot grid, a soft orange glow
 * and a tilted orbit ring. Purely decorative and behind the content (no pointer events, hidden from assistive tech).
 */
function PageBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[30rem] overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#fbf6f1,#ffffff_85%)]" />
      <div className="absolute inset-0 [background-image:radial-gradient(rgb(23_23_23/0.07)_1px,transparent_1.3px)] [background-size:18px_18px] [mask-image:linear-gradient(180deg,#000,transparent_80%)]" />
      <div className="absolute -right-24 -top-32 h-96 w-96 rounded-full bg-brand-500/12 blur-3xl" />
      <div className="absolute -right-40 top-8 hidden aspect-square w-[38rem] rounded-full border border-brand-500/25 [transform:perspective(900px)_rotateX(72deg)] md:block" />
      <div className="absolute -right-28 top-24 hidden aspect-square w-[26rem] rounded-full border border-dashed border-ink/10 [transform:perspective(900px)_rotateX(72deg)] md:block" />
    </div>
  );
}

/** Shared page chrome. `contained` pages get a centred container over the 3D backdrop; the homepage lays out its own bands. */
export function StoreShell({ children, contained = true }: { children: React.ReactNode; contained?: boolean }) {
  return (
    <ToastProvider>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-bg focus:px-3 focus:py-2 focus:text-ink">
        Skip to content
      </a>
      <Header />
      {contained ? (
        // overflow-x-clip: decoration may extend past the edges without ever causing a sideways scroll (sticky still works).
        <div className="relative isolate overflow-x-clip">
          <PageBackdrop />
          <main id="main" className="container-page py-8 sm:py-10">
            {children}
          </main>
        </div>
      ) : (
        <main id="main">{children}</main>
      )}
      <Footer />
    </ToastProvider>
  );
}
