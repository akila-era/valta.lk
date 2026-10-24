import Link from "next/link";

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/"
      className={`inline-flex items-baseline font-display font-extrabold tracking-[-0.02em] ${className}`}
      aria-label="VALTA.LK home"
    >
      <span aria-hidden>V</span>
      <span aria-hidden className="text-brand-500">Λ</span>
      <span aria-hidden>LTA</span>
      <span aria-hidden className="text-[0.82em] font-extrabold">.LK</span>
    </Link>
  );
}
