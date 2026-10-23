import { ToastProvider } from "@/components/ui/toast";
import { Footer } from "./footer";
import { Header } from "./header";

/** Shared page chrome. `contained` pages get a centred container; the homepage lays out its own full-width bands. */
export function StoreShell({ children, contained = true }: { children: React.ReactNode; contained?: boolean }) {
  return (
    <ToastProvider>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-bg focus:px-3 focus:py-2 focus:text-ink">
        Skip to content
      </a>
      <Header />
      <main id="main" className={contained ? "container-page py-8 sm:py-10" : undefined}>
        {children}
      </main>
      <Footer />
    </ToastProvider>
  );
}
