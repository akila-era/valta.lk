import { ToastProvider } from "@/components/ui/toast";

/** Scopes the admin colour theme (see .admin-theme in globals.css) to the admin area, including the sign-in page. */
export default function AdminAreaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin-theme">
      <ToastProvider>{children}</ToastProvider>
    </div>
  );
}
