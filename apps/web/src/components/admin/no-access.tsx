import Link from "next/link";

export function NoAccess({ title, text }: { title: string; text: string }) {
  return (
    <div role="alert" className="card mx-auto max-w-md p-8 text-center">
      <h1 className="text-xl font-bold">{title}</h1>
      <p className="mt-2 text-sm text-muted">{text}</p>
      <Link href="/" className="btn-secondary mt-6">Back to the shop</Link>
    </div>
  );
}
