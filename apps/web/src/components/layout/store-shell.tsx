import { StoreOverlays } from "./store-overlays";
import { KokoPartsProvider } from "@/components/products/koko-instalment";
import { ToastProvider } from "@/components/ui/toast";
import { getKokoInstallmentParts } from "@/lib/payments/koko-public";
import { isPayzyAdvertised } from "@/lib/payments/payzy-public";
import { Footer } from "./footer";
import { Header } from "./header";
import { MobileTabBar } from "./mobile-tab-bar";

/** Shared page chrome. `contained` pages get a centred container; the homepage lays out its own full-width bands. */
export async function StoreShell({ children, contained = true }: { children: React.ReactNode; contained?: boolean }) {
  const [parts, payzy] = await Promise.all([getKokoInstallmentParts(), isPayzyAdvertised()]);
  return (
    <KokoPartsProvider parts={parts} payzy={payzy}>
    <ToastProvider>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-bg focus:px-3 focus:py-2 focus:text-ink">
        Skip to content
      </a>
      <Header />
      <main id="main" className={contained ? "container-page py-8 sm:py-10" : undefined}>
        {children}
      </main>
      <Footer />
      <StoreOverlays />
      <MobileTabBar />
    </ToastProvider>
    </KokoPartsProvider>
  );
}
