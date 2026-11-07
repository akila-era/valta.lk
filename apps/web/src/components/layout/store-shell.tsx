import { AddedNotice } from "@/components/cart/added-notice";
import { ToastProvider } from "@/components/ui/toast";
import { accountsEnabled } from "@/lib/auth/session";
import { getStoreInfo } from "@/lib/store-info";
import { getWaSettings } from "@/lib/whatsapp/settings";
import { ChatWidget } from "@/components/chat/chat-widget";
import { activeSeason } from "@/lib/season";
import { Footer } from "./footer";
import { HalloweenDecor } from "./halloween";
import { Header } from "./header";
import { MobileTabBar } from "./mobile-tab-bar";
import { NavigationLoader } from "./navigation-loader";
import { ShellMain } from "./shell-main";
import { SplashScreen } from "./splash-screen";
import { WhatsAppFloat } from "./whatsapp-float";

/** Shared page chrome (header, page area, footer, tab bar). The page area decides the homepage vs container layout itself. */
export async function StoreShell({ children }: { children: React.ReactNode }) {
  const [season, store, wa] = await Promise.all([activeSeason(), getStoreInfo().catch(() => null), getWaSettings().catch(() => null)]);
  return (
    <ToastProvider>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-bg focus:px-3 focus:py-2 focus:text-ink">
        Skip to content
      </a>
      <Header />
      {season?.season === "halloween" ? <HalloweenDecor /> : null}
      <ShellMain>{children}</ShellMain>
      <Footer halloween={season?.season === "halloween"} />
      <MobileTabBar accounts={accountsEnabled()} />
      <NavigationLoader />
      <SplashScreen />
      <AddedNotice />
      {/* With the WhatsApp chat switched on (Admin, WhatsApp chat) visitors chat on the site; otherwise a plain WhatsApp link. */}
      {wa && wa.mode !== "off" ? <ChatWidget /> : <WhatsAppFloat number={store?.whatsapp} />}
    </ToastProvider>
  );
}
