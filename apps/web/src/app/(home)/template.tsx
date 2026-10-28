/** Re-created when the homepage is opened from another page, so it fades in like every other page change. */
export default function HomeTemplate({ children }: { children: React.ReactNode }) {
  return <div className="animate-page-in">{children}</div>;
}
