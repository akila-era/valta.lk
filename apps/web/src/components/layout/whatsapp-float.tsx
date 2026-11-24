import { WhatsAppLottie } from "@/components/chat/whatsapp-lottie";

/**
 * Floating WhatsApp support button at the bottom right. Shown only when the store has a WhatsApp number (Admin, Store
 * details). On phones it sits above the bottom tab bar, and above a product page's sticky "Add to cart" bar while that
 * bar is showing (see the html[data-buybar] rule in globals.css), so it never covers either.
 */
export function WhatsAppFloat({ number }: { number?: string | null }) {
  const digits = (number ?? "").replace(/\D/g, "");
  if (!digits) return null;
  return (
    <a
      href={`https://wa.me/${digits}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp (opens in a new tab)"
      title="Chat with us on WhatsApp"
      className="wa-float fixed right-5 z-30 flex items-center justify-center transition-[transform,bottom] duration-200 hover:scale-105 motion-reduce:transition-none sm:right-8 h-[6.25rem] w-[7.5rem]"
    >
      <WhatsAppLottie className="h-full w-full drop-shadow-[0_6px_10px_rgb(0_0_0/0.25)]" />
    </a>
  );
}
