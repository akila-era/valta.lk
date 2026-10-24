/** Admin areas that the ERP store API / website do not support yet. Each page states exactly what is missing. */
export interface Unavailable {
  title: string;
  why: string;
  needs: string[];
  link?: { href: string; label: string };
}

export const PAYMENT_PAGES: Record<string, Unavailable> = {
  failed: {
    title: "Failed payments",
    why: "Failed payments only exist for online payments, and no online payment gateway is connected. Cash on delivery cannot fail at checkout; an unpaid COD order simply stays \"to collect\".",
    needs: ["A payment gateway and its credentials", "Gateway webhooks stored on the website or exposed by the ERP"],
    link: { href: "/admin/payments/transactions?filter=to-collect", label: "See COD awaiting collection" },
  },
  refunds: {
    title: "Refunds",
    why: "The ERP store API has no refund endpoints and no gateway is connected, so there are no refund records to show.",
    needs: ["Refund endpoints in the ERP store API", "A payment gateway for online refunds"],
  },
  reconciliation: {
    title: "Payment reconciliation",
    why: "Reconciliation compares gateway settlements with orders. There is no gateway, and the ERP only reports whether COD cash was collected per order.",
    needs: ["Gateway settlement reports", "Bank or courier remittance data from the ERP"],
    link: { href: "/admin/payments", label: "See COD collected vs to collect" },
  },
};

export const SHIPPING_PAGES: Record<string, Unavailable> = {
  tracking: {
    title: "Delivery tracking",
    why: "The ERP records the carrier and tracking number when an order is dispatched. There is no live carrier tracking feed, so tracking is shown per order (and to customers on the track-order page).",
    needs: ["A carrier tracking API or ERP tracking events"],
    link: { href: "/admin/shipping", label: "See dispatched orders with tracking numbers" },
  },
  partners: {
    title: "Delivery partners",
    why: "The ERP exposes only a carrier name on each dispatched order. There is no list of delivery partners, rates or service areas to manage.",
    needs: ["Delivery partner and rate endpoints in the ERP"],
  },
};

export const MARKETING_PAGES: Record<string, Unavailable> = {
  homepage: {
    title: "Homepage content",
    why: "Homepage sections are part of the approved storefront design and are maintained in code. There is no content management system behind them.",
    needs: ["A CMS or content tables, and an editor workflow with review"],
  },
  banners: {
    title: "Promotional banners",
    why: "The storefront has no banner slots backed by data, and no image upload storage exists.",
    needs: ["File/image storage", "A banners table and storefront slots that read from it"],
  },
  "hot-deals": {
    title: "Hot Deals",
    why: "Hot Deals need the website database to store the selection.",
    needs: ["A configured website database (DATABASE_URL) with the HotDeal migration applied"],
  },
  promotions: {
    title: "Promotions & discounts",
    why: "Prices and sale prices come from the ERP and the website cannot change them. There is no coupon or discount engine, and orders are validated against ERP prices.",
    needs: ["Discount and coupon support in the ERP order API", "A website coupon model that the ERP can verify"],
  },
};

export const ERP_LOGS: Unavailable = {
  title: "Integration logs",
  why: "The website does not store a log of every ERP request. What it does keep is each order's sync status, attempts, next attempt and last error.",
  needs: ["Structured request logging to a table or log service (without secrets)"],
  link: { href: "/admin/erp/orders", label: "See order sync status and errors" },
};
