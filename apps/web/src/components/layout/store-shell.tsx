import { ToastProvider } from "@/components/ui/toast";
import { accountsEnabled } from "@/lib/auth/session";
import { siteConfig } from "@/lib/site-config";
import { Footer } from "./footer";
import { Header } from "./header";
import { MobileTabBar } from "./mobile-tab-bar";
import { NavigationLoader } from "./navigation-loader";
import { ShellMain } from "./shell-main";
import { SplashScreen } from "./splash-screen";
import { WhatsAppButton } from "./whatsapp-button";

/** Shared page chrome (header, page area, footer, tab bar). The page area decides the homepage vs container layout itself. */
export function StoreShell({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-bg focus:px-3 focus:py-2 focus:text-ink">
        Skip to content
      </a>
      <Header />
      <ShellMain>{children}</ShellMain>
      <Footer />
      <MobileTabBar accounts={accountsEnabled()} />
      <WhatsAppButton number={siteConfig.whatsapp} />
      <NavigationLoader />
      <SplashScreen />
    </ToastProvider>
  );
}
