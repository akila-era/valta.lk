import { ToastProvider } from "@/components/ui/toast";
import { accountsEnabled } from "@/lib/auth/session";
import { siteConfig } from "@/lib/site-config";
import { Footer } from "./footer";
import { Header } from "./header";
import { MobileTabBar } from "./mobile-tab-bar";
import { WhatsAppButton } from "./whatsapp-button";

/** Shared page chrome. `contained` pages get a centred container; the homepage lays out its own bands. */
export function StoreShell({ children, contained = true }: { children: React.ReactNode; contained?: boolean }) {
  return (
    <ToastProvider>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-bg focus:px-3 focus:py-2 focus:text-ink">
        Skip to content
      </a>
      <Header />
      {contained ? (
        // overflow-x-clip: full-bleed bands may extend past the container without ever causing a sideways scroll. No
        // stacking context here, so phone drawers and dialogs inside the page (filters, confirmations) open above the
        // sticky header and the tab bar.
        <div className="relative overflow-x-clip">
          <main id="main" className="container-page py-8 sm:py-10">
            {children}
          </main>
        </div>
      ) : (
        <main id="main">{children}</main>
      )}
      <Footer />
      <MobileTabBar accounts={accountsEnabled()} />
      <WhatsAppButton number={siteConfig.whatsapp} />
    </ToastProvider>
  );
}
