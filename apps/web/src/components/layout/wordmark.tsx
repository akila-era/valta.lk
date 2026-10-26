import Link from "next/link";

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/"
      className={`inline-flex items-baseline font-display font-extrabold tracking-[-0.02em] ${className}`}
    >
      <span className="sr-only">VOLTA.LK home</span>
      <span aria-hidden>V</span>
      <span aria-hidden className="text-brand-500">O</span>
      <span aria-hidden>LTA</span>
      <span aria-hidden className="text-[0.82em] font-extrabold">.LK</span>
    </Link>
  );
}
