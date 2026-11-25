import "server-only";
import { z } from "zod";
import { getDb } from "./db";

/** Info pages the owner can edit in the admin. Each keeps its text in the banner table under this placement (no schema change). */
export const PAGE_PLACEMENT = "PAGE";

export interface InfoSection {
  heading: string;
  /** Plain text. Blank line = new paragraph, lines starting with "- " = bullet list, [text](/path) = link, **bold**. */
  body: string;
}
export interface InfoPageContent {
  title: string;
  intro: string;
  sections: InfoSection[];
}

export const sectionSchema = z.object({ heading: z.string().trim().min(1).max(100), body: z.string().trim().min(1).max(4000) });
export const pageSchema = z.object({
  title: z.string().trim().min(2).max(80),
  intro: z.string().trim().max(300),
  sections: z.array(sectionSchema).min(1).max(14),
});

export interface PageDef {
  slug: string;
  path: string;
  label: string;
  /** What the page shows until the owner edits it. Only facts the website really has. */
  defaults: InfoPageContent;
}

const CONTACT = "[Contact us](/contact)";

export const PAGES: PageDef[] = [
  {
    slug: "about",
    path: "/about",
    label: "About us",
    defaults: {
      title: "About VOLTA.LK",
      intro: "VOLTA.LK is a Sri Lankan online store for mobile phones, electronics and accessories.",
      sections: [
        { heading: "Who we are", body: "VOLTA.LK sells mobile phones, electronics and everyday accessories online in Sri Lanka. All prices are in Sri Lankan rupees (LKR)." },
        { heading: "What you can buy", body: "Browse by category or use the search box to find phones, audio, chargers, cables and accessories. Every product page shows its price, availability and details.\n\n- Phones and tablets\n- Audio, earbuds and speakers\n- Chargers, cables and power banks\n- Computer accessories" },
        { heading: "How ordering works", body: "1. Add the products you want to your cart.\n2. Enter your delivery details at checkout.\n3. Place your order and keep your order reference.\n\nPayment is by cash on delivery. Prices and stock availability come directly from our inventory system and are confirmed again when you place your order." },
        { heading: "Delivery and tracking", body: "We deliver across Sri Lanka. The delivery charge is shown at checkout before you place your order. Use the reference shown after you order to follow your order on the [Track order](/track-order) page." },
        { heading: "Talk to us", body: `Questions about an order or a product? ${CONTACT} and we will help.` },
      ],
    },
  },
  {
    slug: "wholesale",
    path: "/wholesale",
    label: "Wholesale",
    defaults: {
      title: "Wholesale registration",
      intro: "Buying for a shop, a business or to resell? Register your interest and our team will get in touch.",
      sections: [
        { heading: "Who it is for", body: "Retail shops, resellers, online stores and businesses that buy phones, electronics and accessories in larger quantities." },
        { heading: "Why register", body: "- Talk to a person about the products and quantities you need\n- Ask about prices for bulk orders\n- Get help with delivery for larger orders\n- One contact for follow-up questions" },
        { heading: "What happens next", body: "1. Fill in the form with your shop or company details.\n2. Our team reads it and contacts you by phone or email.\n3. We agree what you need, the price and the delivery." },
      ],
    },
  },
  {
    slug: "faq",
    path: "/faq",
    label: "FAQ",
    // The default questions are built from live ERP settings in the page itself; saving here replaces them.
    defaults: { title: "Frequently asked questions", intro: "Quick answers about paying, delivery, stock, tracking and returns.", sections: [{ heading: "How do I pay?", body: "Payment is by cash on delivery." }] },
  },
  {
    slug: "shipping-policy",
    path: "/shipping-policy",
    label: "Shipping",
    defaults: {
      title: "Shipping policy",
      intro: "How delivery works for VOLTA.LK orders.",
      sections: [
        { heading: "Delivery charge", body: "The delivery charge is shown at checkout before you place your order." },
        { heading: "Tracking", body: "Once your order is dispatched, the carrier and tracking number (when available) appear on the [Track order](/track-order) page. We do not promise specific delivery times on this website." },
        { heading: "Cash on delivery", body: "Please have the payment ready when your order arrives." },
      ],
    },
  },
  {
    slug: "returns-policy",
    path: "/returns-policy",
    label: "Returns",
    defaults: {
      title: "Returns policy",
      intro: "How returns are handled.",
      sections: [
        { heading: "How returns work", body: `Returns are processed manually by our team. Processing a return does not change the status shown on the Track order page, and refunds are not issued automatically. ${CONTACT} to arrange a return.` },
        { heading: "Return conditions", body: `The return period, which items are eligible, the condition they must be in and the refund process have not been published yet. Until they are, ${CONTACT} before sending anything back.` },
      ],
    },
  },
  {
    slug: "warranty",
    path: "/warranty",
    label: "Warranty",
    defaults: {
      title: "Warranty",
      intro: "Warranty on products sold by VOLTA.LK.",
      sections: [{ heading: "Warranty terms", body: `Warranty periods and coverage differ by product and have not been published yet. Until they are, ${CONTACT} to ask about the warranty on a specific product.` }],
    },
  },
  {
    slug: "privacy-policy",
    path: "/privacy-policy",
    label: "Privacy",
    defaults: {
      title: "Privacy policy",
      intro: "What we collect when you order from VOLTA.LK and how it is used.",
      sections: [
        { heading: "Information we collect", body: "When you place an order we collect your name, phone number, optional email address and delivery address. Your shopping cart is kept only in your browser." },
        { heading: "How we use it", body: "- To process, deliver and support your order.\n- To let you track your order using your order reference." },
        { heading: "Where it is stored", body: "Order details are passed securely to our inventory and order management system. This website does not store your payment details because payment is made in cash on delivery." },
        { heading: "Questions", body: "Contact us using the details on the Contact page to ask about your data. This policy should be reviewed by the business owner and legal adviser before launch." },
      ],
    },
  },
  {
    slug: "terms",
    path: "/terms",
    label: "Terms",
    defaults: {
      title: "Terms & conditions",
      intro: "By placing an order you agree to the following.",
      sections: [
        { heading: "Orders and prices", body: "All prices are in Sri Lankan rupees (LKR). Prices and availability are confirmed when you place your order. If a price or stock level changes, you will be asked to review your order before it is placed." },
        { heading: "Payment", body: "Payment is by cash on delivery. Your order is recorded as unpaid until the cash is collected on delivery." },
        { heading: "Cancellation", body: "You can cancel an order online before it is dispatched. After dispatch, please contact us." },
        { heading: "Review notice", body: "This text is a starting point and should be reviewed by the business owner and legal adviser before launch." },
      ],
    },
  },
];

export const pageDef = (slug: string) => PAGES.find((p) => p.slug === slug);

/** The page as shoppers see it: the owner's saved version when there is one, otherwise the defaults. `custom` says which. */
export async function getInfoPage(slug: string): Promise<{ content: InfoPageContent; custom: boolean }> {
  const def = pageDef(slug);
  if (!def) throw new Error(`Unknown info page ${slug}`);
  const db = getDb();
  if (!db) return { content: def.defaults, custom: false };
  const row = await db.banner.findFirst({ where: { placement: PAGE_PLACEMENT, href: slug }, select: { headline: true, text: true } }).catch(() => null);
  if (!row?.text) return { content: def.defaults, custom: false };
  try {
    const raw = JSON.parse(row.text) as { intro?: unknown; sections?: unknown };
    const parsed = pageSchema.safeParse({ title: row.headline, intro: raw.intro ?? "", sections: raw.sections });
    return parsed.success ? { content: parsed.data, custom: true } : { content: def.defaults, custom: false };
  } catch {
    return { content: def.defaults, custom: false };
  }
}
