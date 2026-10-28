/**
 * Floating WhatsApp chat button, shown only when the owner has set SITE_CONTACT_WHATSAPP (a number such as
 * +94771234567). Sits above the phone tab bar; in the store colours (black with an orange ring).
 */
export function WhatsAppButton({ number }: { number: string }) {
  const digits = number.replace(/[^\d]/g, "");
  if (digits.length < 9) return null;
  return (
    <a
      href={`https://wa.me/${digits}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp (opens in a new tab)"
      className="fixed bottom-20 right-4 z-30 flex h-13 w-13 items-center justify-center rounded-full bg-ink text-white ring-2 ring-brand-500 transition-transform hover:scale-105 md:bottom-6 md:right-6"
    >
      <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor" aria-hidden>
        <path d="M12.04 2a9.9 9.9 0 0 0-8.5 15l-1.4 5.1 5.2-1.4A9.9 9.9 0 1 0 12.04 2Zm0 18.1a8.2 8.2 0 0 1-4.2-1.15l-.3-.18-3.1.82.83-3-.2-.31a8.2 8.2 0 1 1 6.97 3.82Zm4.5-6.14c-.25-.12-1.46-.72-1.69-.8-.23-.08-.39-.12-.56.12-.16.25-.64.8-.79.97-.14.16-.29.19-.54.06a6.7 6.7 0 0 1-3.32-2.9c-.25-.43.25-.4.72-1.33.08-.16.04-.3-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.41-.56-.42h-.48a.92.92 0 0 0-.66.31 2.8 2.8 0 0 0-.87 2.08 4.85 4.85 0 0 0 1.02 2.58 11.1 11.1 0 0 0 4.25 3.75c1.58.68 2.2.74 2.99.62.48-.07 1.46-.6 1.67-1.18.2-.58.2-1.08.14-1.18-.06-.1-.23-.16-.48-.29Z" />
      </svg>
    </a>
  );
}
