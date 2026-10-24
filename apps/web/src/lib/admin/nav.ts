import {
  Award, Banknote, BarChart3, Boxes, CheckCircle2, CircleAlert, ClipboardList, Clock, CreditCard, FolderTree, Gauge, Handshake, History, House, Image as ImageIcon,
  Inbox, KeyRound, LayoutDashboard, MapPin, Package, PackageCheck, PackagePlus, PackageSearch, PackageX, Percent, Plug, Receipt, RefreshCw,
  RotateCcw, Scale, ScrollText, Settings, Settings2, ShieldCheck, ShoppingBag, Star, TrendingUp, TriangleAlert, Truck, Undo2, UserCog, Users, Wallet, XCircle, type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  /** key of a live count shown as a badge (see AdminBadges) */
  badge?: "new" | "pending" | "failed";
  /** also active for deeper routes such as /admin/orders/<ref> */
  deep?: boolean;
}
export interface NavGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  items: NavItem[];
}

/** Every entry maps to a real route under /admin. Pages without backend support say so on the page itself. */
export const NAV: NavGroup[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, items: [{ label: "Dashboard", href: "/admin" }] },
  {
    id: "catalog", label: "Catalog", icon: Package,
    items: [
      { label: "Products", href: "/admin/products", deep: true },
      { label: "Categories", href: "/admin/categories" },
      { label: "Brands", href: "/admin/brands" },
    ],
  },
  {
    id: "inventory", label: "Inventory", icon: Boxes,
    items: [
      { label: "Stock Overview", href: "/admin/inventory" },
      { label: "Low Stock", href: "/admin/inventory/low-stock" },
      { label: "Out of Stock", href: "/admin/inventory/out-of-stock" },
    ],
  },
  {
    id: "orders", label: "Sales & Orders", icon: ShoppingBag,
    items: [
      { label: "All Orders", href: "/admin/orders", deep: true },
      { label: "New Orders", href: "/admin/orders?status=PLACED", badge: "new" },
      { label: "Pending Orders", href: "/admin/orders?status=pending", badge: "pending" },
      { label: "Processing", href: "/admin/orders?status=CONFIRMED" },
      { label: "Dispatched", href: "/admin/orders?status=DISPATCHED" },
      { label: "Completed", href: "/admin/orders?status=DELIVERED" },
      { label: "Cancelled", href: "/admin/orders?status=CANCELLED" },
    ],
  },
  {
    id: "customers", label: "Customers", icon: Users,
    items: [
      { label: "All Customers", href: "/admin/customers", deep: true },
      { label: "Customer Order History", href: "/admin/customers/history" },
    ],
  },
  {
    id: "payments", label: "Payments", icon: Wallet,
    items: [
      { label: "Transactions", href: "/admin/payments/transactions" },
      { label: "Cash on Delivery", href: "/admin/payments" },
    ],
  },
  {
    id: "shipping", label: "Shipping", icon: Truck,
    items: [
      { label: "Shipments", href: "/admin/shipping" },
    ],
  },
  {
    id: "erp", label: "ERP Integration", icon: RefreshCw,
    items: [
      { label: "ERP Overview", href: "/admin/erp" },
      { label: "Product Sync", href: "/admin/erp/products" },
      { label: "Inventory Sync", href: "/admin/erp/inventory" },
      { label: "Order Sync", href: "/admin/erp/orders" },
      { label: "Failed Sync Jobs", href: "/admin/erp/failed", badge: "failed" },
    ],
  },
  {
    id: "marketing", label: "Promotions", icon: Percent,
    items: [
      { label: "Promotions & Discounts", href: "/admin/marketing/promotions" },
      { label: "Promotional Banners", href: "/admin/marketing/banners" },
      { label: "Hot Deals", href: "/admin/marketing/hot-deals" },
    ],
  },
  {
    id: "reports", label: "Reports & Analytics", icon: BarChart3,
    items: [
      { label: "Sales Reports", href: "/admin/reports" },
      { label: "Order Reports", href: "/admin/reports/orders" },
      { label: "Product Reports", href: "/admin/reports/products" },
      { label: "Payment Reports", href: "/admin/reports/payments" },
      { label: "ERP Sync Reports", href: "/admin/reports/erp" },
    ],
  },
  {
    id: "administration", label: "Administration", icon: ShieldCheck,
    items: [
      { label: "Admin Users", href: "/admin/users" },
      { label: "General Settings", href: "/admin/settings" },
      { label: "Payment Settings", href: "/admin/settings/payment" },
      { label: "Shipping Settings", href: "/admin/settings/shipping" },
      { label: "ERP Settings", href: "/admin/settings/erp" },
    ],
  },
];

/** One icon per sidebar entry (keyed by label). */
const ITEM_ICONS: Record<string, LucideIcon> = {
  Dashboard: LayoutDashboard,
  Products: Package, "Add Product": PackagePlus, Categories: FolderTree, Brands: Award, "Featured Products": Star,
  "Stock Overview": Boxes, "Low Stock": TriangleAlert, "Out of Stock": PackageX, "ERP Stock Sync": RefreshCw, "Stock Sync Errors": CircleAlert,
  "All Orders": ClipboardList, "New Orders": Inbox, "Pending Orders": Clock, Processing: Settings2, "Ready for Dispatch": PackageCheck,
  Dispatched: Truck, Completed: CheckCircle2, Cancelled: XCircle, "Returns & Refunds": Undo2,
  "All Customers": Users, "Customer Order History": History,
  Transactions: Receipt, "Pending Payments": Clock, "Failed Payments": CircleAlert, Refunds: RotateCcw, "Cash on Delivery": Banknote, "Payment Reconciliation": Scale,
  Shipments: Truck, "Delivery Tracking": MapPin, "Delivery Partners": Handshake,
  "ERP Overview": Gauge, "Product Sync": Package, "Inventory Sync": Boxes, "Order Sync": ShoppingBag, "Failed Sync Jobs": TriangleAlert, "Integration Logs": ScrollText, "Connection Settings": Plug,
  "Homepage Content": House, "Promotional Banners": ImageIcon, "Promotions & Discounts": Percent,
  "Sales Reports": TrendingUp, "Order Reports": ClipboardList, "Product Reports": PackageSearch, "Payment Reports": Wallet, "ERP Sync Reports": RefreshCw,
  "Admin Users": UserCog, "Roles & Permissions": KeyRound, "Audit Logs": ScrollText, "General Settings": Settings, "Payment Settings": CreditCard, "Shipping Settings": Truck, "ERP Settings": Plug,
};
export const iconFor = (label: string): LucideIcon => ITEM_ICONS[label] ?? Package;

const EXACT_PATHS = new Set(NAV.flatMap((g) => g.items.map((i) => i.href.split("?")[0])));

/** Breadcrumb trail for a path: Admin > group > page (group omitted for the dashboard). */
export function crumbsFor(pathname: string, status: string | null): { label: string; href?: string }[] {
  if (pathname === "/admin") return [{ label: "Dashboard" }];
  const hit = NAV.flatMap((g) => g.items.map((i) => ({ g, i }))).filter(({ i }) => isActive(i, pathname, status)).sort((a, b) => b.i.href.length - a.i.href.length)[0];
  const trail: { label: string; href?: string }[] = [{ label: "Dashboard", href: "/admin" }];
  if (hit) {
    trail.push({ label: hit.g.label });
    const exact = hit.i.href.split("?")[0] === pathname;
    trail.push(exact ? { label: hit.i.label } : { label: hit.i.label, href: hit.i.href });
    if (!exact) trail.push({ label: pathname.split("/").pop() ?? "" });
  }
  return trail;
}

export interface AdminBadges {
  new: number;
  pending: number;
  failed: number;
}

/** Does this nav entry match the current URL? Entries with ?status= also compare the status. */
export function isActive(item: NavItem, pathname: string, status: string | null, filter: string | null = null): boolean {
  const [path, query] = item.href.split("?");
  const want = query ? new URLSearchParams(query).get("status") : null;
  const deepHit = item.deep && pathname.startsWith(`${path}/`) && !EXACT_PATHS.has(pathname);
  if (pathname !== path && !deepHit) return false;
  if (path === "/admin/orders" && pathname === "/admin/orders") return (status ?? null) === want;
  if (path === "/admin/payments/transactions" && pathname === path) return (filter ?? null) === (query ? new URLSearchParams(query).get("filter") : null);
  return true;
}
