import Link from "next/link";

export default function AdminNotFound() {
  return (
    <div role="status" className="card mx-auto mt-10 max-w-lg p-8 text-center">
      <p className="text-sm font-semibold text-brand-600">404</p>
      <h1 className="mt-1 text-xl font-bold">Page not found</h1>
      <p className="mt-2 text-sm text-muted">This admin page or record does not exist, or it has been removed.</p>
      <div className="mt-6 flex justify-center gap-3">
        <Link href="/admin" className="btn-primary">Dashboard</Link>
        <Link href="/admin/orders" className="btn-secondary">All orders</Link>
      </div>
    </div>
  );
}
